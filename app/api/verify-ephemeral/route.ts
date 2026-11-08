import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import zlib from 'zlib';
import Jimp from 'jimp';
import jsQR from 'jsqr';

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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const checkout_id = (formData.get('checkout_id') as string) || 'chk_live_session_9823';
    const shop_domain = (formData.get('shop_domain') as string) || 'standalone-test.myshopify.com';
    const bypass_simulation = formData.get('bypass_simulation') === 'true';
    const file = formData.get('file') as File | null;

    // 1. BLOCK SIMULATION IN PRODUCTION
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
      // Validate file type
      if (!file.type.startsWith('image/')) {
        return NextResponse.json(
          { success: false, age_verified: false, error: 'Uploaded file is not a valid image.' },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      // A. LOAD IMAGE PIXELS
      let image: any;
      try {
        image = await Jimp.read(imageBuffer);
      } catch (err) {
        return NextResponse.json(
          { success: false, age_verified: false, error: 'Corrupted image: Unable to process pixels.' },
          { status: 400 }
        );
      }

      // B. SCAN FOR QR CODE MATRIX (Fails immediately on selfies, blank photos, memes)
      const qrCode = jsQR(
        new Uint8ClampedArray(image.bitmap.data),
        image.bitmap.width,
        image.bitmap.height
      );

      if (!qrCode || (!qrCode.data && !qrCode.binaryData)) {
        return NextResponse.json(
          { 
            success: false, 
            age_verified: false, 
            error: 'No QR code detected in image. Please upload a clear Aadhaar secure QR code.' 
          },
          { status: 400 }
        );
      }

      // C. PARSE DEMOGRAPHICS & EXTRACT BIRTH YEAR
      let birthYear: number | null = null;

      // Check legacy/offline XML format
      const xmlDob = qrCode.data.match(/dob="(\d{2})[/.-](\d{2})[/.-](\d{4})"/i);
      const xmlYob = qrCode.data.match(/yob="(\d{4})"/i);

      if (xmlDob) {
        birthYear = parseInt(xmlDob[3], 10);
      } else if (xmlYob) {
        birthYear = parseInt(xmlYob[1], 10);
      } else {
        // Parse modern Secure QR (compressed binary / BigInt string)
        try {
          let rawBytes: Buffer;
          if (/^\d+$/.test(qrCode.data.trim())) {
            let hex = BigInt(qrCode.data.trim()).toString(16);
            if (hex.length % 2 !== 0) hex = '0' + hex;
            rawBytes = Buffer.from(hex, 'hex');
          } else {
            rawBytes = Buffer.from(qrCode.binaryData || qrCode.data);
          }

          let decompressed: Buffer;
          try {
            decompressed = zlib.inflateRawSync(rawBytes);
          } catch {
            try {
              decompressed = zlib.inflateSync(rawBytes);
            } catch {
              decompressed = rawBytes;
            }
          }

          // Fields delimited by 255 (0xFF): [Email/Mob flag, Ref ID, Name, DOB, Gender...]
          const fields: string[] = [];
          let start = 0;
          for (let i = 0; i < decompressed.length; i++) {
            if (decompressed[i] === 255) {
              fields.push(decompressed.subarray(start, i).toString('utf-8'));
              start = i + 1;
              if (fields.length >= 6) break;
            }
          }

          for (const field of fields) {
            const m = field.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
            if (m) {
              birthYear = parseInt(m[3], 10);
              break;
            }
          }

          if (!birthYear) {
            const fullText = decompressed.toString('utf-8');
            const fallback = fullText.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
            if (fallback) birthYear = parseInt(fallback[3], 10);
          }
        } catch (e) {
          console.error("Payload extraction failed:", e);
        }
      }

      // Reject non-Aadhaar QR codes (e.g., website URLs, payment QRs)
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

      // D. MATHEMATICAL 18+ ASSERTION
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

    // 2. ATTESTATION & SUPABASE AUDIT
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!rawUrl || !rawKey) {
      return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    }

    const supabaseUrl = sanitizeUrl(rawUrl);
    const serviceKey = rawKey.trim().replace(/^["']|["']$/g, '');
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Decrement credits
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
