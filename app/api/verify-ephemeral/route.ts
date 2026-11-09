import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

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
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "No file uploaded",
        },
        { status: 400 }
      );
    }

    const size = file.size;

    // Read the file but DO NOT decode it.
    const buffer = await file.arrayBuffer();

    return NextResponse.json({
      success: true,
      diagnostic: true,
      message: "Upload reached Vercel successfully.",
      filename: file.name,
      mimeType: file.type,
      sizeBytes: size,
      bytesRead: buffer.byteLength,
      elapsedMs: Date.now() - started,
    });
  } catch (error) {
    console.error("Diagnostic POST failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Diagnostic POST failed",
        message: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - started,
      },
      { status: 500 }
    );
  }
}
