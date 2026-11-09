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

// ZXing Reader with HybridBinarizer
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
    const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));

    const reader = new MultiFormatReader();
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    reader.setHints(hints);

    const result = reader.decode(binaryBitmap);
    return result.getText();
  } catch {
    return null;
  }
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

      // 1. OPTIMIZE FOR HIGH-DENSITY MATRICES
      // Cap at 2200px max dimension: prevents memory exhaustion while preserving 
      // sufficient pixel density (~4-6px per module) on dense 177x177 QR codes.
      const maxDim = Math.max(image.bitmap.width, image.bitmap.height);
      if (maxDim > 2200) {
        if (image.bitmap.width > image.bitmap.height) {
          image.resize(2200, Jimp.AUTO);
        } else {
          image.resize(Jimp.AUTO, 2200);
        }
      }

      // 2. MULTI-PASS CAMERA DECODING PIPELINE
      let qrText: string | null = null;

      // Pass A: Direct decode
      qrText = decodeBitmap(image.bitmap);

      // Pass B: Grayscale + Dynamic Contrast Normalization (compensates for room glare/shadows)
      if (!qrText) {
        const normalized = image.clone().greyscale().contrast(0.35).normalize();
        qrText = decodeBitmap(normalized.bitmap);
      }

      // Pass C: Rotational Sweep (fixes phone EXIF orientation mismatches: 90, 180, 270 deg)
      if (!qrText) {
        for (const angle of [90, 180, 270]) {
          const rotated = image.clone().rotate(angle);
          qrText = decodeBitmap(rotated.bitmap);
          if (qrText) break;

          // Try contrast normalization on rotated frames
          const rotNorm = rotated.clone().greyscale().contrast(0.35).normalize();
          qrText = decodeBitmap(rotNorm.bitmap);
          if (qrText) break;
        }
      }

      // Pass D: Fallback scanner with double-inversion check
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
            error: 'No QR code detected. For camera photos, ensure good lighting and frame the QR code clearly.' 
          },
          { status: 400 }
        );
      }

      // 3. PARSE DEMOGRAPHICS & EXTRACT BIRTH YEAR
      let birthYear: number | null = null;
      const rawString = qrText.trim();

      // Check legacy/offline XML
      const xmlDob = rawString.match(/dob="(\d{2})[/.-](\d{2})[/.-](\d{4})"/i);
      const xmlYob = rawString.match(/yob="(\d{4})"/i);

      if (xmlDob) {
        birthYear = parseInt(xmlDob[3], 10);
      } else if (xmlYob) {
        birthYear = parseInt(xmlYob[1], 10);
      } else {
        // Modern Secure QR: Large base-10 number string
        const cleanDigits = rawString.replace(/[^0-9]/g, '');

        if (cleanDigits.length > 300) {
          try {
            let hex = BigInt(cleanDigits).toString(16);
            if (hex.length % 2 !== 0) hex = '0' + hex;
            const compressed = Buffer.from(hex, 'hex');

            let decompressed: Buffer | null = null;
            try {
              decompressed = zlib.gunzipSync(compressed);
            } catch {
              try {
                decompressed = zlib.unzipSync(compressed);
              } catch {
                try {
                  decompressed = zlib.inflateRawSync(compressed);
                } catch (e) {
                  console.error('Decompression failure:', e);
                }
              }
            }

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
                const dobField = fields[3];
                const match = dobField.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
                if (match) {
                  birthYear = parseInt(match[3], 10);
                } else if (/^\d{4}$/.test(dobField.trim())) {
                  birthYear = parseInt(dobField.trim(), 10);
                }
              }

              if (!birthYear) {
                for (const field of fields) {
                  const m = field.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
                  if (m) {
                    birthYear = parseInt(m[3], 10);
                    break;
                  }
                }
              }
            }
          } catch (numErr) {
            console.error('BigInt payload extraction error:', numErr);
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

      // 4. MATHEMATICAL 18+ ASSERTION
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

    // 5. ATTESTATION PROOF & SUPABASE AUDIT
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
