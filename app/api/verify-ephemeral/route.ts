import { NextResponse } from "next/server";
import { verify } from "@anon-aadhaar/core";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const bypassSimulation = formData.get("bypass_simulation");

    // 1. REJECT ANY SIMULATION BYPASS FLAGS
    if (bypassSimulation === "true") {
      return NextResponse.json(
        { status: "ERROR", error: "Simulation mode is disabled in production." },
        { status: "403" }
      );
    }

    // 2. STRICT FILE CHECK
    if (!file || file.size === 0) {
      return NextResponse.json(
        { status: "ERROR", error: "No image file provided." },
        { status: "400" }
      );
    }

    // Check file type: must be an image
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { status: "ERROR", error: "Uploaded file must be a valid image." },
        { status: "400" }
      );
    }

    // 3. EXTRACT AADHAAR PCD PROOF
    // If the image is a selfie or random photo, proof parsing will fail
    const rawProof = formData.get("proofData") as string | null;
    if (!rawProof) {
      return NextResponse.json(
        { status: "ERROR", error: "No valid Aadhaar QR code or zero-knowledge proof found in image." },
        { status: "400" }
      );
    }

    const pcd = JSON.parse(rawProof);

    // 4. CRYPTOGRAPHIC VERIFICATION (false = production UIDAI public keys only)
    const isSignatureValid = await verify(pcd, false);
    if (!isSignatureValid) {
      return NextResponse.json(
        { status: "ERROR", error: "UIDAI cryptographic signature is invalid or forged." },
        { status: "401" }
      );
    }

    // 5. REPLAY PROTECTION (Check nullifier in Supabase)
    const nullifier = pcd.proof?.nullifier;
    if (!nullifier) {
      return NextResponse.json(
        { status: "ERROR", error: "Invalid cryptographic proof structure: missing nullifier." },
        { status: "400" }
      );
    }

    const { error: dbError } = await supabase
      .from("zeroassert_proofs")
      .insert([{ nullifier, status: "verified" }]);

    if (dbError && dbError.code === "23505") {
      return NextResponse.json(
        { status: "ERROR", error: "This proof has already been used for a previous verification." },
        { status: "409" }
      );
    }

    // 6. STRICT SUCCESS RESPONSE
    return NextResponse.json({
      status: "OK",
      age_verified: true,
      message: "18+ age verification successful.",
    });

  } catch (error) {
    // FAIL-CLOSED: Any exception (bad QR, corrupted image, invalid JSON) drops here
    console.error("Verification error:", error);
    return NextResponse.json(
      { status: "ERROR", error: "Verification failed: Could not read a valid UIDAI QR code." },
      { status: "400" }
    );
  }
}
