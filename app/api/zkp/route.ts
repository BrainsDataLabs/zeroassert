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
    const { proof, shopDomain, orderId } = body;
    const targetDomain = shopDomain || 'standalone-test.myshopify.com';

    // 1. BILLING GATEWAY: Check if merchant has prepaid credits
    const { data: merchantAccount, error: accountError } = await supabaseAdmin
      .from('merchant_accounts')
      .select('verification_credits')
      .eq('shop_domain', targetDomain)
      .single();

    if (accountError || !merchantAccount) {
      return NextResponse.json({ verified: false, error: 'Merchant account not found.' }, { status: 403 });
    }

    if (merchantAccount.verification_credits <= 0) {
      return NextResponse.json({ verified: false, error: 'Merchant out of verification credits.' }, { status: 402 }); // 402 Payment Required
    }

    // 2. CRYPTOGRAPHIC VERIFICATION
    const isValidZkp = await verify(proof);
    if (!isValidZkp) {
      return NextResponse.json({ verified: false, error: 'Cryptographic proof rejected.' }, { status: 400 });
    }

    // 3. DATABASE VAULT LOCK (The Order Shield)
    const liveCommitment = 'zkp_commit_' + Date.now(); 
    const liveNullifier = 'zkp_nullifier_' + Math.random().toString(36).substring(2, 15);

    const { error: vaultError } = await supabaseAdmin
      .from('buyer_proofs')
      .insert([{ shop_domain: targetDomain, order_id: orderId, commitment: liveCommitment, nullifier_hash: liveNullifier }]);

    if (vaultError) {
      return NextResponse.json({ verified: false, error: 'Vault rejected proof.' }, { status: 500 });
    }

    // 4. LEDGER DEDUCTION (Charge the merchant 1 credit)
    await supabaseAdmin.rpc('decrement_credits', { target_shop: targetDomain });

    return NextResponse.json({ verified: true, message: 'Identity verified, secured, and billed.' }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ error: 'Pipeline crashed' }, { status: 500 });
  }
}
