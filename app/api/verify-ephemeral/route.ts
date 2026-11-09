import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  decodeAadhaarQR,
} from "@/app/lib/image-qr";
import {
  parseAadhaarSecureQR,
  isAdult,
} from "@/app/lib/aadhaar-qr";

export const dynamic = "force-dynamic";

export const runtime = "nodejs";

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
  ...buffers: Array<Buffer | undefined | null>
) {
  /*
   * Best-effort memory cleanup.
   *
   * Node/V8 does not provide guaranteed secure memory
   * erasure, so this should not be described as a
   * cryptographic secure-memory wipe.
   */
  for (const buffer of buffers) {
    if (buffer) {
      buffer.fill(0);
    }
  }
}

export async function POST(
  req: NextRequest
) {
  let imageBuffer: Buffer | null = null;
  let signedData: Buffer | null = null;
  let signature: Buffer | null = null;

  try {
    const formData = await req.formData();

    const file =
      formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          age_verified: false,
          error: "No image supplied.",
        },
        { status: 400 }
      );
    }

    if (
      !file.type ||
      !file.type.startsWith("image/")
    ) {
      return NextResponse.json(
        {
          success: false,
          age_verified: false,
          error: "Uploaded file is not an image.",
        },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        {
          success: false,
          age_verified: false,
          error: "Image exceeds the 10 MB limit.",
        },
        { status: 413 }
      );
    }

    imageBuffer = Buffer.from(
      await file.arrayBuffer()
    );

    /*
     * STEP 1
     * Detect and decode Aadhaar Secure QR.
     */
    const qr = await decodeAadhaarQR(
      imageBuffer
    );

    if (!qr) {
      return NextResponse.json(
        {
          success: false,
          age_verified: false,
          error:
            "Aadhaar Secure QR could not be detected. Make sure the entire large QR, including all four finder corners, is visible.",
        },
        { status: 400 }
      );
    }

    /*
     * STEP 2
     * Parse decimal QR payload -> binary -> gzip
     * -> signed data + RSA signature.
     */
    const parsed =
      parseAadhaarSecureQR(qr.data);

    signedData = parsed.signedData;
    signature = parsed.signature;

    /*
     * STEP 3
     * Verify UIDAI signature.
     *
     * Never continue to the age decision if
     * signature validation fails.
     */
    const signatureValid =
      verifyUIDAISignature(
        signedData,
        signature
      );

    if (!signatureValid) {
      return NextResponse.json(
        {
          success: false,
          age_verified: false,
          error:
            "Aadhaar Secure QR signature verification failed.",
        },
        { status: 401 }
      );
    }

    /*
     * STEP 4
     * Evaluate the age predicate.
     */
    const ageVerified =
      isAdult(parsed.birthYear);

    if (!ageVerified) {
      return NextResponse.json(
        {
          success: false,
          age_verified: false,
          error:
            "Age requirement of 18 years was not met.",
        },
        { status: 403 }
      );
    }

    /*
     * STEP 5
     * Generate an opaque verification token.
     *
     * Do NOT include:
     * - Aadhaar number
     * - name
     * - DOB
     * - QR payload
     * - image
     */
    const proofToken = crypto
      .createHash("sha256")
      .update(
        crypto.randomBytes(32)
      )
      .digest("hex");

    return NextResponse.json(
      {
        success: true,
        age_verified: true,
        proof_token: proofToken,
        qr_decoder: qr.method,
        message:
          "Age verified successfully.",
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error: any) {
    console.error(
      "[ZeroAssert] ephemeral verification failed:",
      error?.message
    );

    return NextResponse.json(
      {
        success: false,
        age_verified: false,
        error:
          error?.message ||
          "Ephemeral verification failed.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      }
    );
  } finally {
    /*
     * Best-effort cleanup.
     */
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
