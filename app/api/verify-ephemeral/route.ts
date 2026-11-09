import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

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
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function GET() {
  return jsonResponse({
    success: true,
    service: "ZeroAssert ephemeral verification API",
    route: "/api/verify-ephemeral",
    method: "POST",
    status: "ready",
    diagnostic: "minimal-route",
  });
}

export async function POST(req: NextRequest) {
  try {
    console.log("[ZeroAssert] POST started");

    const contentType =
      req.headers.get("content-type") || "";

    console.log(
      "[ZeroAssert] content-type:",
      contentType
    );

    if (!contentType.includes("multipart/form-data")) {
      return jsonResponse(
        {
          success: false,
          error: "Request must use multipart/form-data.",
          diagnostic_step: "content-type",
        },
        400
      );
    }

    console.log("[ZeroAssert] parsing formData");

    const formData = await req.formData();

    console.log("[ZeroAssert] formData parsed");

    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonResponse(
        {
          success: false,
          error: "No image supplied.",
          diagnostic_step: "file",
        },
        400
      );
    }

    console.log("[ZeroAssert] file received:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    if (!file.type || !file.type.startsWith("image/")) {
      return jsonResponse(
        {
          success: false,
          error: "Uploaded file is not an image.",
          diagnostic_step: "image-type",
        },
        400
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return jsonResponse(
        {
          success: false,
          error: "Image exceeds the 10 MB limit.",
          diagnostic_step: "file-size",
        },
        413
      );
    }

    console.log("[ZeroAssert] reading image");

    const imageBuffer = Buffer.from(
      await file.arrayBuffer()
    );

    console.log(
      "[ZeroAssert] image loaded:",
      imageBuffer.length,
      "bytes"
    );

    /*
     * IMPORTANT:
     * We intentionally do NOT import or execute:
     *
     * decodeAadhaarQR()
     * parseAadhaarSecureQR()
     * isAdult()
     * UIDAI signature verification
     *
     * This tells us whether the problem is inside
     * those modules or somewhere earlier.
     */

    const diagnosticToken = crypto
      .createHash("sha256")
      .update(crypto.randomBytes(32))
      .digest("hex");

    imageBuffer.fill(0);

    console.log(
      "[ZeroAssert] diagnostic POST completed"
    );

    return jsonResponse({
      success: true,
      diagnostic: "minimal-route-working",
      file_received: true,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      proof_token: diagnosticToken,
      message:
        "Vercel POST, multipart parsing, File handling and Node crypto are working.",
    });
  } catch (error: any) {
    console.error(
      "[ZeroAssert] diagnostic POST failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        diagnostic: "minimal-route-failed",
        error:
          error?.message ||
          String(error) ||
          "Unknown server error",
        error_name:
          error?.name || "UnknownError",
        stack:
          process.env.NODE_ENV !== "production"
            ? error?.stack
            : undefined,
      },
      500
    );
  }
}
