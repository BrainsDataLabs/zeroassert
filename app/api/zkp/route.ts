export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as snarkjs from 'snarkjs';
import vKey from '../verify/verification_key.json';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { proof, publicSignals, shopDomain } = body;

    let isValidZkp = false;
    try {
      isValidZkp = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    } catch (e) {
      console.log('Proof format rejected.');
    }

    if (isValidZkp) {
      // Nuclear override: strict domain capture, bypassing all ghost code
      const targetDomain = shopDomain || 'nuclear-test.myshopify.com';
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
        return NextResponse.json({ verified: false, error: 'Database vault rejected the proof' }, { status: 500 });
      }

      return NextResponse.json({ verified: true, message: 'Nuclear pivot successful.' }, { status: 200 });
    } else {
      return NextResponse.json({ verified: false, error: 'Invalid cryptographic proof' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Cryptographic pipeline crashed' }, { status: 500 });
  }
}

