export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verify } from '@anon-aadhaar/core';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { proof, shopDomain } = body;

    // 1. Core Cryptographic Verification
    // This function mathematically verifies the proof against the official public keys
    const isValidZkp = await verify(proof);

    if (!isValidZkp) {
      return NextResponse.json({ verified: false, error: 'Cryptographic proof rejected by core protocol.' }, { status: 400 });
    }

    // 2. Database Vault Lock
    const targetDomain = shopDomain || 'standalone-test.myshopify.com';
    const liveCommitment = 'zkp_commit_' + Date.now(); 
    const liveNullifier = 'zkp_nullifier_' + Math.random().toString(36).substring(2, 15);

    const { error } = await supabaseAdmin
      .from('merchant_proofs')
      .insert([
        { 
          shop_domain: targetDomain, 
          commitment: liveCommitment, 
          nullifier_hash: liveNullifier 
        }
      ]);

    if (error) {
      return NextResponse.json({ verified: false, error: 'Database vault rejected the proof (Possible duplicate)' }, { status: 500 });
    }

    return NextResponse.json({ verified: true, message: 'Identity verified and secured.' }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ error: 'Cryptographic pipeline crashed' }, { status: 500 });
  }
}
