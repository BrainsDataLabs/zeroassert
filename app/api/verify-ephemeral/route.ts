import { NextResponse } from "next/server";
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

function jsonError(
  message: string,
  stage: string,
  status: number,
  started: number
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      stage,
      elapsedMs:
        Date.now() -
        started,
    },
    {
      status,
    }
  );
}

export async function GET() {
  return NextResponse.json({
    success: true,
    service:
      "ZeroAssert ephemeral verification API",
    route:
      "/api/verify-ephemeral",
    method: "POST",
    status: "ready",
  });
}

export async function POST(
  request: Request
) {
  const started =
    Date.now();

  try {
    /*
     * -------------------------------------------------------
     * 1. Read upload
     * -------------------------------------------------------
     */
    let formData: FormData;

    try {
      formData =
        await request.formData();
    } catch {
      return jsonError(
        "Could not read uploaded form data.",
        "multipart",
        400,
        started
      );
    }

    const file =
      formData.get(
        "file"
      );

    if (
      !(file instanceof File)
    ) {
      return jsonError(
        "No image file was uploaded.",
        "upload",
        400,
        started
      );
    }

    if (
      file.size >
      10 * 1024 * 1024
    ) {
      return jsonError(
        "Image exceeds the 10 MB limit.",
        "upload",
        413,
        started
      );
    }

    /*
     * -------------------------------------------------------
     * 2. Read image
     * -------------------------------------------------------
     */
    let imageBuffer: Buffer;

    try {
      imageBuffer =
        Buffer.from(
          await file.arrayBuffer()
        );
    } catch {
      return jsonError(
        "Could not read uploaded image.",
        "upload",
        400,
        started
      );
    }

    /*
     * -------------------------------------------------------
     * 3. Detect QR
     * -------------------------------------------------------
     */
    let qr;

    try {
      qr =
        await decodeAadhaarQR(
          imageBuffer
        );
    } catch (error) {
      console.error(
        "QR decoder exception:",
        error
      );

      return jsonError(
        "QR decoder failed.",
        "qr_detection",
        422,
        started
      );
    }

    if (!qr) {
      return jsonError(
        "No supported QR code was detected in the image.",
        "qr_detection",
        400,
        started
      );
    }

    /*
     * We deliberately do NOT return or log
     * the QR payload.
     */
    console.log(
      "QR detected:",
      {
        engine:
          qr.engine,
        attempt:
          qr.attempt,
        width:
          qr.width,
        height:
          qr.height,
        payloadLength:
          qr.payload.length,
        numeric:
          /^\d+$/.test(
            qr.payload
          ),
      }
    );

    /*
     * -------------------------------------------------------
     * 4. Parse Aadhaar Secure QR
     * -------------------------------------------------------
     */
    let parsed;

    try {
      parsed =
        parseAadhaarSecureQR(
          qr.payload
        );
    } catch (error) {
      console.error(
        "Aadhaar QR parser exception:",
        error
      );

      return jsonError(
        "QR was detected but could not be parsed as an Aadhaar Secure QR.",
        "qr_parse",
        422,
        started
      );
    }

    if (!parsed) {
      return jsonError(
        "QR was detected, but it is not a supported Aadhaar Secure QR.",
        "qr_parse",
        422,
        started
      );
    }

    /*
     * -------------------------------------------------------
     * 5. UIDAI public-key verification
     * -------------------------------------------------------
     */
    const publicKey =
      process.env
        .UIDAI_PUBLIC_KEY;

    if (!publicKey) {
      console.error(
        "UIDAI_PUBLIC_KEY is missing."
      );

      return jsonError(
        "Verification service is not configured.",
        "signature_config",
        500,
        started
      );
    }

    let signatureValid =
      false;

    try {
      const verifier =
        crypto.createVerify(
          "RSA-SHA256"
        );

      verifier.update(
        parsed.signedData
      );

      verifier.end();

      signatureValid =
        verifier.verify(
          publicKey,
          parsed.signature
        );
    } catch (error) {
      console.error(
        "Signature verification exception:",
        error
      );

      return jsonError(
        "Cryptographic signature verification failed.",
        "signature",
        422,
        started
      );
    }

    if (
      !signatureValid
    ) {
      return jsonError(
        "Aadhaar QR signature is invalid.",
        "signature",
        403,
        started
      );
    }

    /*
     * -------------------------------------------------------
     * 6. Age verification
     * -------------------------------------------------------
     */
    if (
      !parsed.birthDate &&
      !parsed.birthYear
    ) {
      return jsonError(
        "Verified QR does not contain a usable date of birth.",
        "dob",
        422,
        started
      );
    }

    const adult =
      isAdult(
        parsed.birthDate ??
          parsed.birthYear!
      );

    /*
     * -------------------------------------------------------
     * 7. Ephemeral opaque token
     * -------------------------------------------------------
     *
     * Do not put Aadhaar data into this token.
     */
    const proofToken =
      crypto
        .randomBytes(
          32
        )
        .toString(
          "base64url"
        );

    return NextResponse.json({
      success: true,

      age_verified:
        adult,

      status:
        adult
          ? "18_plus"
          : "under_18",

      proof_token:
        proofToken,

      elapsedMs:
        Date.now() -
        started,
    });
  } catch (error) {
    console.error(
      "ZeroAssert verification route crashed:",
      error
    );

    return jsonError(
      "Verification service failed unexpectedly.",
      "internal",
      500,
      started
    );
  }
}
