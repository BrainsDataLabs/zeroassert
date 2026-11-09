import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import zlib from 'zlib';
import Jimp from 'jimp';
import jsQR from 'jsqr';
import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  GlobalHistogramBinarizer,
} from '@zxing/library';

export const dynamic = 'force-dynamic';

function sanitizeUrl(rawUrl: string): string {
  let url = rawUrl.trim().replace(/^["']|["']$/g, '');
  const dashMatch = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9_-]+)/i);
  if (dashMatch) return `https://${dashMatch[1]}.supabase.co`;
  return url.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
}

function generateAttestationProof(checkoutId: string, shopDomain: string, signatureHash: string): string {
  const secret = process.env.ATTESTATION_SECRET || 'zeroassert_audit_key_sec_9918';
  return crypto
    .createHmac('sha256', secret)
    .update(`${checkoutId}:${shopDomain}:${signatureHash}:${Date.now()}`)
    .digest('hex');
}

// Multi-pass ZXing Reader (Hybrid + Global Histogram)
function decodeBitmap(imageBitmap: { width: number; height: number; data: Buffer }): string | null {
  try {
    const { width, height, data } = imageBitmap;
    const len = width * height;
    const luminances = new Uint8ClampedArray(len);

    for (let i = 0; i < len; i++) {
      const offset = i * 4;
      luminances[i] = (data[offset] * 77 + data[offset + 1] * 150 + data[offset + 2] * 29) >> 8;
    }

    const luminanceSource = new RGBLuminanceSource(luminances, width, height);

    const reader = new MultiFormatReader();
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    reader.setHints(hints);

    // Pass 1: HybridBinarizer (standard)
    try {
      const bitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
      return reader.decode(bitmap).getText();
    } catch {}

    // Pass 2: GlobalHistogramBinarizer (better for paper reflections and camera shadows)
    try {
      const bitmap = new BinaryBitmap(new GlobalHistogramBinarizer(luminanceSource));
      return reader.decode(bitmap).getText();
    } catch {}

    return null;
  } catch {
    return null;
  }
}

// Robust decompressor across all compression schemes
function tryDecompress(buf: Buffer): Buffer | null {
  try {
    return zlib.gunzipSync(buf);
  } catch {}
  try {
    return zlib.unzipSync(buf);
  } catch {}
  try {
    return zlib.inflateRawSync(buf);
  } catch {}
  try {
    return zlib.inflateSync(buf);
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const checkout_id = (formData.get('checkout_id') as string) || 'chk_live_session_9823';
    const shop_domain = (formData.get('shop_domain') as string) || 'standalone-test.myshopify.com';
    const bypass_simulation = formData.get('bypass_simulation') === 'true';
    const file = formData.get('file') as File | null;

    if (bypass_simulation && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { success: false, age_verified: false, error: 'Simulation mode is disabled in production.' },
        { status: 403 }
      );
    }

    if (!file && !bypass_simulation) {
      return NextResponse.json(
        { success: false, age_verified: false, error: 'No verification image provided.' },
        { status: 400 }
      );
    }

    let isAgeVerified = false;
    let signatureHash = '';

    if (bypass_simulation) {
      isAgeVerified = true;
      signatureHash = 'simulated_' + crypto.randomBytes(8).toString('hex');
    } else if (file) {
      if (!file.type.startsWith('image/')) {
        return NextResponse.json(
          { success: false, age_verified: false, error: 'Uploaded file is not a valid image.' },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      let image: any;
      try {
        image = await Jimp.read(imageBuffer);
      } catch (err) {
        return NextResponse.json(
          { success: false, age_verified: false, error: 'Corrupted image: Unable to process pixels.' },
          { status: 400 }
        );
      }

      // 1. DOWNSCALE ONLY EXCESSIVELY LARGE IMAGES
      // Keep up to 2400px so high-density matrices maintain required module pixel counts
      const maxDim = Math.max(image.bitmap.width, image.bitmap.height);
      if (maxDim > 2400) {
        if (image.bitmap.width > image.bitmap.height) {
          image.resize(2400, Jimp.AUTO);
        } else {
          image.resize(Jimp.AUTO, 2400);
        }
      }

      // 2. SCANNING PIPELINE
      let qrText: string | null = decodeBitmap(image.bitmap);

      // Contrast + Grayscale normalization pass for lighting gradients
      if (!qrText) {
        const enhanced = image.clone().greyscale().contrast(0.3).normalize();
        qrText = decodeBitmap(enhanced.bitmap);
      }

      // Rotational sweep (addresses phone EXIF orientation flips)
      if (!qrText) {
        for (const angle of [90, 180, 270]) {
          const rotated = image.clone().rotate(angle);
          qrText = decodeBitmap(rotated.bitmap);
          if (qrText) break;

          const rotEnhanced = rotated.clone().greyscale().contrast(0.3).normalize();
          qrText = decodeBitmap(rotEnhanced.bitmap);
          if (qrText) break;
        }
      }

      // Fallback pass with jsQR
      if (!qrText) {
        const jsQrResult = jsQR(
          new Uint8ClampedArray(image.bitmap.data),
          image.bitmap.width,
          image.bitmap.height,
          { inversionAttempts: 'attemptBoth' }
        );
        if (jsQrResult?.data) {
          qrText = jsQrResult.data;
        }
      }

      if (!qrText) {
        return NextResponse.json(
          { 
            success: false, 
            age_verified: false, 
            error: 'No QR code detected. Ensure the QR code is clearly framed and well-focused.' 
          },
          { status: 400 }
        );
      }

      // 3. MULTI-FORMAT DEMOGRAPHIC EXTRACTION
      let birthYear: number | null = null;
      const rawString = qrText.trim();

      // Check format A: Legacy XML
      const xmlDob = rawString.match(/dob="(\d{2})[/.-](\d{2})[/.-](\d{4})"/i);
      const xmlYob = rawString.match(/yob="(\d{4})"/i);

      if (xmlDob) {
        birthYear = parseInt(xmlDob[3], 10);
      } else if (xmlYob) {
        birthYear = parseInt(xmlYob[1], 10);
      } else {
        // Modern Secure QR: Support both Numeric BigInt and Raw Latin-1 Byte streams
        let decompressed: Buffer | null = null;

        // Path 1: Numeric BigInt representation (e-Aadhaar format)
        const cleanDigits = rawString.replace(/[^0-9]/g, '');
        if (cleanDigits.length > 300) {
          try {
            let hex = BigInt(cleanDigits).toString(16);
            if (hex.length % 2 !== 0) hex = '0' + hex;
            const compressed = Buffer.from(hex, 'hex');
            decompressed = tryDecompress(compressed);
          } catch (e) {
            console.error('BigInt parsing error:', e);
          }
        }

        // Path 2: Raw byte stream (Physical PVC card format)
        if (!decompressed) {
          const rawBytes = Buffer.from(rawString, 'latin1');
          decompressed = tryDecompress(rawBytes);
        }

        // Path 3: Sliced search for GZIP magic bytes (0x1F, 0x8B) in the buffer
        if (!decompressed) {
          const rawBytes = Buffer.from(rawString, 'latin1');
          for (let i = 0; i < rawBytes.length - 1; i++) {
            if (rawBytes[i] === 0x1f && rawBytes[i + 1] === 0x8b) {
              decompressed = tryDecompress(rawBytes.subarray(i));
              if (decompressed) break;
            }
          }
        }

        // Parse demographic fields from decompressed buffer
        if (decompressed) {
          const fields: string[] = [];
          let start = 0;
          for (let i = 0; i < decompressed.length; i++) {
            if (decompressed[i] === 255) {
              fields.push(decompressed.subarray(start, i).toString('latin1'));
              start = i + 1;
              if (fields.length >= 10) break;
            }
          }

          if (fields.length > 3) {
            const dobMatch = fields[3].match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
            if (dobMatch) {
              birthYear = parseInt(dobMatch[3], 10);
            } else if (/^\d{4}$/.test(fields[3].trim())) {
              birthYear = parseInt(fields[3].trim(), 10);
            }
          }

          if (!birthYear) {
            for (const f of fields) {
              const m = f.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
              if (m) {
                birthYear = parseInt(m[3], 10);
                break;
              }
            }
          }

          if (!birthYear) {
            const fullText = decompressed.toString('latin1');
            const fallback = fullText.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
            if (fallback) birthYear = parseInt(fallback[3], 10);
          }
        }
      }

      if (!birthYear || isNaN(birthYear)) {
        return NextResponse.json(
          { 
            success: false, 
            age_verified: false, 
            error: 'Invalid QR code. The uploaded QR is not an official Aadhaar secure document.' 
          },
          { status: 400 }
        );
      }

      // 4. STATUTORY 18+ ASSERTION
      const currentYear = new Date().getFullYear();
      const calculatedAge = currentYear - birthYear;

      if (calculatedAge < 18) {
        return NextResponse.json(
          { 
            success: false, 
            age_verified: false, 
            error: 'Verification failed: Age requirement (18+) not met.' 
          },
          { status: 403 }
        );
      }

      isAgeVerified = true;
      signatureHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    }

    if (!isAgeVerified) {
      return NextResponse.json(
        { success: false, age_verified: false, error: 'Verification failed.' },
        { status: 403 }
      );
    }

    // 5. AUDIT LOGGING & SUPABASE REVENUE LOGIC
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!rawUrl || !rawKey) {
      return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    }

    const supabaseUrl = sanitizeUrl(rawUrl);
    const serviceKey = rawKey.trim().replace(/^["']|["']$/g, '');
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: merchant, error: fetchErr } = await supabase
      .from('merchant_accounts')
      .select('verification_credits')
      .eq('shop_domain', shop_domain)
      .maybeSingle();

    let nextCredits = 80;
    if (!fetchErr && merchant) {
      nextCredits = Math.max(0, (merchant.verification_credits ?? 81) - 1);
      await supabase
        .from('merchant_accounts')
        .update({ verification_credits: nextCredits })
        .eq('shop_domain', shop_domain);
    }

    const proofToken = generateAttestationProof(checkout_id, shop_domain, signatureHash);

    await supabase.from('age_verifications').insert([
      {
        checkout_id,
        shop_domain,
        created_at: new Date().toISOString(),
      },
    ]);

    return NextResponse.json({
      success: true,
      age_verified: true,
      checkout_id,
      proof_token: proofToken,
      remaining_credits: nextCredits,
    });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, age_verified: false, error: err.message || 'Server processing error' },
      { status: 500 }
    );
  }
}
