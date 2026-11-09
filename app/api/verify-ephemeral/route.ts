import {
  NextRequest,
  NextResponse,
} from "next/server";

import crypto from "crypto";

import {
  decodeAadhaarQR,
} from "@/app/lib/image-qr";

import {
  parseAadhaarSecureQR,
  isAdult,
} from "@/app/lib/aadhaar-qr";

export const dynamic =
  "force-dynamic";

export const runtime =
  "nodejs";

export const revalidate = 0;

function jsonResponse(
  body: Record<string, any>,
  status = 200
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store, no-cache, must-revalidate, max-age=0",

        Pragma: "no-cache",

        Expires: "0",
      },
    }
  );
}

function verifyUIDAISignature(
  signedData: Buffer,
  signature: Buffer
): boolean {
  const publicKey =
    process.env.UIDAI_PUBLIC_KEY;

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
      padding:
        crypto.constants
          .RSA_PKCS1_PADDING,
    },
    signature
  );
}

function cleanupBuffers(
  ...buffers: Array<
    Buffer | undefined | null
  >
) {
  for (const buffer of buffers) {
    if (buffer) {
      try {
        buffer.fill(0);
      } catch {
        // Best-effort memory cleanup.
      }
    }
  }
}

export async function GET() {
  /*
   * This endpoint is intentionally useful for
   * diagnosing deployment/routing problems.
   *
   * If:
   *
   * https://zeroassert.brainsdata.org/api/verify-ephemeral
   *
   * returns the ZeroAssert HTML page instead
   * of this JSON response, the custom-domain
   * deployment is not routing /api correctly.
   */
  return jsonResponse(
    {
      success: true,
      service:
        "ZeroAssert ephemeral verification API",
      route:
        "/api/verify-ephemeral",
      method:
        "POST",
      status:
        "ready",
    },
    200
  );
}

export async function POST(
  req: NextRequest
) {
  let imageBuffer:
    | Buffer
    | null = null;

  let signedData:
    | Buffer
    | null = null;

  let signature:
    | Buffer
    | null = null;

  try {
    const contentType =
      req.headers.get(
        "content-type"
      ) || "";

    if (
      !contentType.includes(
        "multipart/form-data"
      )
    ) {
      return jsonResponse(
        {
          success: false,
          age_verified: false,
          error:
            "Request must use multipart/form-data.",
        },
        400
      );
    }

    const formData =
      await req.formData();

    const file =
      formData.get("file");

    if (!(file instanceof File)) {
      return jsonResponse(
        {
          success: false,
          age_verified: false,
          error:
            "No image supplied.",
        },
        400
      );
    }

    if (
      !file.type ||
      !file.type.startsWith(
        "image/"
      )
    ) {
      return jsonResponse(
        {
          success: false,
          age_verified: false,
          error:
            "Uploaded file is not an image.",
        },
        400
      );
    }

    if (
      file.size >
      10 *
        1024 *
        1024
    ) {
      return jsonResponse(
        {
          success: false,
          age_verified: false,
          error:
            "Image exceeds the 10 MB limit.",
        },
        413
      );
    }

    imageBuffer =
      Buffer.from(
        await file.arrayBuffer()
      );

    /*
     * STEP 1
     *
     * Detect the Aadhaar Secure QR.
     *
     * The image remains in server memory
     * for the duration of this request.
     *
     * It is not written to disk.
     */
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
            "Aadhaar Secure QR could not be detected. Make sure the complete large QR and all four finder corners are visible.",
        },
        400
      );
    }

    /*
     * STEP 2
     *
     * Decimal QR payload
     * -> binary
     * -> gzip
     * -> signed data
     * -> RSA signature
     */
    const parsed =
      parseAadhaarSecureQR(
        qr.data
      );

    signedData =
      parsed.signedData;

    signature =
      parsed.signature;

    /*
     * STEP 3
     *
     * Cryptographic validation.
     */
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
        },
        401
      );
    }

    /*
     * STEP 4
     *
     * Age predicate.
     */
    const ageVerified =
      isAdult(
        parsed.birthYear
      );

    if (!ageVerified) {
      return jsonResponse(
        {
          success: false,
          age_verified: false,
          error:
            "Age requirement of 18 years was not met.",
        },
        403
      );
    }

    /*
     * STEP 5
     *
     * Return ONLY an opaque verification token.
     *
     * Never return:
     * - Aadhaar number
     * - name
     * - DOB
     * - QR payload
     * - image
     */
    const proofToken =
      crypto
        .createHash(
          "sha256"
        )
        .update(
          crypto.randomBytes(
            32
          )
        )
        .digest(
          "hex"
        );

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
      "[ZeroAssert] ephemeral verification failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        age_verified: false,
        error:
          error?.message ||
          "Ephemeral verification failed.",
      },
      500
    );
  } finally {
    /*
     * Best-effort clearing of sensitive
     * buffers before the request finishes.
     */
    cleanupBuffers(
      imageBuffer,
      signedData,
      signature
    );

    imageBuffer =
      null;

    signedData =
      null;

    signature =
      null;
  }
}
