import { NextResponse } from "next/server";
import { decodeAadhaarQR } from "@/app/lib/image-qr";
import {
  parseAadhaarSecureQR,
  isAdult,
} from "@/app/lib/aadhaar-qr";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

function errorResponse(
  message: string,
  status: number,
  stage: string,
  started: number
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      stage,
      elapsedMs: Date.now() - started,
    },
    { status }
  );
}

export async function GET() {
  return NextResponse.json({
    success: true,
    service: "ZeroAssert ephemeral verification API",
    route: "/api/verify-ephemeral",
    method: "POST",
    status: "ready",
  });
}

export async function POST(request: Request) {
  const started = Date.now();

  try {
    // ---------------------------------------------------------
    // 1. Read multipart upload
    // ---------------------------------------------------------
    let formData: FormData;

    try {
      formData = await request.formData();
    } catch (error) {
      console.error("Multipart parsing failed:", error);

      return errorResponse(
        "Could not read uploaded form data.",
        400,
        "multipart",
        started
      );
    }

    const file = formData.get("file");

    if (!(file instanceof File)) {
      return errorResponse(
        "No image file was uploaded.",
        400,
        "upload",
        started
      );
    }

    // 10 MB hard limit
    if (file.size > 10 * 1024 * 1024) {
      return errorResponse(
        "Image is too large. Maximum size is 10 MB.",
        413,
        "upload",
        started
      );
    }

    // ---------------------------------------------------------
    // 2. Read image into memory
    // ---------------------------------------------------------
    let imageBuffer: Buffer;

    try {
      const arrayBuffer = await file.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } catch (error) {
      console.error("File read failed:", error);

      return errorResponse(
        "Could not read uploaded image.",
        400,
        "upload",
        started
      );
    }

    // ---------------------------------------------------------
    // 3. QR decoding
    // ---------------------------------------------------------
    let qrData: string | null = null;

    try {
      qrData = await decodeAadhaarQR(imageBuffer);
    } catch (error) {
      console.error("QR decoder failed:", error);

      return errorResponse(
        "QR decoder failed.",
        422,
        "qr_decode",
        started
      );
    }

    if (!qrData) {
      return errorResponse(
        "No supported Aadhaar Secure QR code was detected in the image.",
        400,
        "qr_decode",
        started
      );
    }

    console.log(
      `ZeroAssert QR detected. Length=${qrData.length}`
    );

    // ---------------------------------------------------------
    // 4. Parse Secure QR
    // ---------------------------------------------------------
    let parsedQR;

    try {
      parsedQR = await parseAadhaarSecureQR(qrData);
    } catch (error) {
      console.error("Secure QR parser threw:", error);

      return errorResponse(
        "The detected QR code could not be parsed as an Aadhaar Secure QR.",
        422,
        "qr_parse",
        started
      );
    }

    if (!parsedQR) {
      return errorResponse(
        "The detected QR code is not a supported Aadhaar Secure QR.",
        422,
        "qr_parse",
        started
      );
    }

    // ---------------------------------------------------------
    // 5. Verify cryptographic signature
    // ---------------------------------------------------------
    const publicKey = process.env.UIDAI_PUBLIC_KEY;

    if (!publicKey) {
      console.error("UIDAI_PUBLIC_KEY is not configured.");

      return errorResponse(
        "Verification service is not configured correctly.",
        500,
        "signature_config",
        started
      );
    }

    let signatureValid = false;

    try {
      const verifier = crypto.createVerify("RSA-SHA256");

      verifier.update(parsedQR.signedData);
      verifier.end();

      signatureValid = verifier.verify(
        publicKey,
        parsedQR.signature
      );
    } catch (error) {
      console.error("Signature verification error:", error);

      return errorResponse(
        "Cryptographic verification failed.",
        422,
        "signature",
        started
      );
    }

    if (!signatureValid) {
      return errorResponse(
        "Aadhaar Secure QR signature is invalid.",
        403,
        "signature",
        started
      );
    }

    // ---------------------------------------------------------
    // 6. Age verification
    // ---------------------------------------------------------
    if (!parsedQR.birthDate && !parsedQR.birthYear) {
      return errorResponse(
        "Date of birth could not be established from the verified QR.",
        422,
        "dob",
        started
      );
    }

    const adult = isAdult(
      parsedQR.birthDate ?? parsedQR.birthYear!
    );

    // ---------------------------------------------------------
    // 7. Generate an ephemeral opaque result token
    //
    // Do NOT put Aadhaar number, DOB, name, QR contents,
    // or other identity data into this token.
    // ---------------------------------------------------------
    const proofToken = crypto
      .randomBytes(32)
      .toString("base64url");

    if (!adult) {
      return NextResponse.json(
        {
          success: true,
          age_verified: false,
          status: "under_18",
          proof_token: proofToken,
          elapsedMs: Date.now() - started,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      age_verified: true,
      status: "18_plus",
      proof_token: proofToken,
      elapsedMs: Date.now() - started,
    });
  } catch (error) {
    console.error("ZeroAssert verification route crashed:", error);

    return errorResponse(
      "Verification service failed unexpectedly.",
      500,
      "internal",
      started
    );
  }
}
