import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { decodeAadhaarQR } from "@/app/lib/image-qr";
import {
  parseAadhaarSecureQR,
  isAdult,
} from "@/app/lib/aadhaar-qr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

function jsonResponse(
  body: Record<string, any>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control":
        "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function verifyUIDAISignature(
  signedData: Buffer,
  signature: Buffer
): boolean {
  const publicKey = process.env.UIDAI_PUBLIC_KEY;

  if (!publicKey) {
    throw new Error(
      "UIDAI_PUBLIC_KEY is not configured."
    );
  }

  return crypto.verify(
    "sha256",
    signedData,
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    signature
  );
}

function cleanupBuffers(
  ...buffers: Array<Buffer | null | undefined>
) {
  for (const buffer of buffers) {
    if (!buffer) continue;

    try {
      buffer.fill(0);
    } catch {
      // Best-effort cleanup only.
    }
  }
}

export async function GET() {
  return jsonResponse({
    success: true,
    service:
      "ZeroAssert ephemeral verification API",
    route: "/api/verify-ephemeral",
    method: "POST",
    status: "ready",
  });
}

export async function POST(req: NextRequest) {
  let imageBuffer: Buffer | null = null;
  let signedData: Buffer | null = null;
  let signature: Buffer | null = null;

  let stage = "request";

  try {
    stage = "content-type";

    const contentType =
      req.headers.get("content-type") || "";

    if (
      !contentType
        .toLowerCase()
        .includes("multipart/form-data")
    ) {
      return jsonResponse(
        {
          success: false,
          age_verified: false,
          error:
            "Request must use multipart/form-data.",
          stage,
        },
        400
      );
    }

    stage = "form-data";

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonResponse(
        {
          success: false,
          age_verified: false,
          error: "No image supplied.",
          stage,
        },
        400
      );
    }

    stage = "file-validation";

    if (
      !file.type ||
      !file.type.startsWith("image/")
    ) {
      return jsonResponse(
        {
          success: false,
          age_verified: false,
          error:
            "Uploaded file is not an image.",
          stage,
        },
        400
      );
    }

    const MAX_IMAGE_SIZE =
      10 * 1024 * 1024;

    if (file.size > MAX_IMAGE_SIZE) {
      return jsonResponse(
        {
          success: false,
          age_verified: false,
          error:
            "Image exceeds the 10 MB limit.",
          stage,
        },
        413
      );
    }

    stage = "image-read";

    imageBuffer = Buffer.from(
      await file.arrayBuffer()
    );

    if (imageBuffer.length === 0) {
      return jsonResponse(
        {
          success: false,
          age_verified: false,
          error:
            "Uploaded image is empty.",
          stage,
        },
        400
      );
    }

    stage = "qr-decode";

    const qr =
      await decodeAadhaarQR(
        imageBuffer
      );

    if (!qr) {
      return jsonResponse(
        {
          success: false,
          age_verified: false,
          error:
            "No valid Aadhaar Secure QR could be detected in the uploaded image.",
          stage,
        },
        400
      );
    }

    stage = "qr-parse";

    const parsed =
      parseAadhaarSecureQR(
        qr.data
      );

    signedData =
      parsed.signedData;

    signature =
      parsed.signature;

    stage = "signature-verification";

    const signatureValid =
      verifyUIDAISignature(
        signedData,
        signature
      );

    if (!signatureValid) {
      return jsonResponse(
        {
          success: false,
          age_verified: false,
          error:
            "Aadhaar Secure QR signature verification failed.",
          stage,
        },
        401
      );
    }

    stage = "age-verification";

    const ageVerified =
      isAdult(
        parsed.birthDate
      );

    if (!ageVerified) {
      return jsonResponse(
        {
          success: false,
          age_verified: false,
          error:
            "Age requirement of 18 years was not met.",
          stage,
        },
        403
      );
    }

    stage = "token-generation";

    const proofToken =
      crypto
        .createHash("sha256")
        .update(
          crypto.randomBytes(32)
        )
        .digest("hex");

    return jsonResponse(
      {
        success: true,
        age_verified: true,
        proof_token:
          proofToken,
        qr_decoder:
          qr.method,
        message:
          "Age verified successfully.",
      },
      200
    );
  } catch (error: any) {
    console.error(
      "[ZeroAssert] verification failed",
      {
        stage,
        error,
      }
    );

    return jsonResponse(
      {
        success: false,
        age_verified: false,
        error:
          error?.message ||
          "Ephemeral verification failed.",
        stage,
        error_name:
          error?.name ||
          "UnknownError",
      },
      500
    );
  } finally {
    cleanupBuffers(
      imageBuffer,
      signedData,
      signature
    );

    imageBuffer = null;
    signedData = null;
    signature = null;
  }
}
