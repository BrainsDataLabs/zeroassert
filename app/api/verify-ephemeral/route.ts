import { NextResponse } from "next/server";
import {
  decodeAadhaarQR,
} from "@/app/lib/image-qr";

export const dynamic =
  "force-dynamic";

export const runtime =
  "nodejs";

export const revalidate = 0;

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
    const formData =
      await request.formData();

    const file =
      formData.get("file");

    if (
      !(file instanceof File)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No image file was uploaded.",
          stage:
            "upload",
          elapsedMs:
            Date.now() -
            started,
        },
        {
          status: 400,
        }
      );
    }

    if (
      file.size >
      10 * 1024 * 1024
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Image is larger than 10 MB.",
          stage:
            "upload",
        },
        {
          status: 413,
        }
      );
    }

    const buffer =
      Buffer.from(
        await file.arrayBuffer()
      );

    console.log(
      `ZeroAssert image received: ${file.size} bytes`
    );

    const result =
      await decodeAadhaarQR(
        buffer
      );

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No QR code detected.",
          stage:
            "qr_detection",
          elapsedMs:
            Date.now() -
            started,
        },
        {
          status: 400,
        }
      );
    }

    /*
     * SECURITY:
     * Do NOT return the QR payload.
     * Do NOT log the QR payload.
     *
     * We only expose metadata needed
     * to diagnose QR detection.
     */
    return NextResponse.json({
      success: true,
      diagnostic: true,

      message:
        "QR code detected. Aadhaar parsing has not yet been performed.",

      qrDetected:
        true,

      engine:
        result.engine,

      qrPayloadLength:
        result.payload.length,

      qrPayloadIsNumeric:
        /^\d+$/.test(
          result.payload
        ),

      imageWidth:
        result.width,

      imageHeight:
        result.height,

      elapsedMs:
        Date.now() -
        started,
    });
  } catch (error) {
    console.error(
      "QR diagnostic failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "QR detection request failed.",
        stage:
          "internal",
        message:
          error instanceof Error
            ? error.message
            : String(error),
        elapsedMs:
          Date.now() -
          started,
      },
      {
        status: 500,
      }
    );
  }
}
