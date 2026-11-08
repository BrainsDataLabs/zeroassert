import { verify } from "@anon-aadhaar/core";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase using secure environment variables
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const { proofData } = req.body;

    // 1. STRICT NULL CHECK: If no proof payload exists (e.g., random image uploaded)
    if (!proofData || Object.keys(proofData).length === 0) {
      return res.status(400).json({ verified: false, error: "Invalid payload: No QR data detected." });
    }

    // 2. CRYPTOGRAPHIC VERIFICATION: 'false' disables Anon Aadhaar test mode
    const isSignatureValid = await verify(proofData, false);
    if (!isSignatureValid) {
      return res.status(401).json({ verified: false, error: "Cryptographic signature rejected." });
    }

    // 3. REPLAY PROTECTION: Attempt to insert the unique nullifier
    const nullifier = proofData.nullifier;
    const { error: dbError } = await supabase
      .from("zeroassert_proofs")
      .insert([{ nullifier: nullifier, status: "used" }]);

    // If the insert fails because the nullifier already exists, reject the request
    if (dbError && dbError.code === '23505') { // 23505 is Postgres unique violation
      return res.status(403).json({ verified: false, error: "Proof has already been used." });
    }

    // 4. FINAL ASSERTION
    return res.status(200).json({ verified: true, message: "18+ Verified Successfully." });

  } catch (error) {
    // CATCH-ALL: Force a fail-closed state if ANY exception occurs
    console.error("Verification Error:", error);
    return res.status(500).json({ verified: false, error: "Internal processing error." });
  }
}
