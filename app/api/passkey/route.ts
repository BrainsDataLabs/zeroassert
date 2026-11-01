import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, credential_id, public_key, checkout_id, shop_domain } = body;
    const targetShop = shop_domain || 'standalone-test.myshopify.com';

    // 1. Merchant Credit Pre-Check
    const { data: merchant, error: merchantError } = await supabase
      .from('merchant_accounts')
      .select('verification_credits')
      .eq('shop_domain', targetShop)
      .single();

    if (merchantError || !merchant) {
      return NextResponse.json({ error: 'Merchant account not found' }, { status: 404 });
    }

    if (merchant.verification_credits <= 0) {
      return NextResponse.json({ error: 'Merchant verification credits exhausted' }, { status: 403 });
    }

    // ACTION: REGISTER NEW PASSKEY (Post-Genesis ZKP)
    if (action === 'register') {
      if (!credential_id || !public_key) {
        return NextResponse.json({ error: 'Missing credential registration details' }, { status: 400 });
      }

      const { error: insertError } = await supabase
        .from('passkey_credentials')
        .upsert({
          credential_id,
          public_key,
          created_at: new Date().toISOString(),
          last_used_at: new Date().toISOString()
        }, { onConflict: 'credential_id' });

      if (insertError) throw insertError;

      return NextResponse.json({ success: true, message: 'Passkey registered successfully' });
    }

    // ACTION: AUTHENTICATE RETURNING BUYER VIA PASSKEY
    if (action === 'authenticate') {
      if (!credential_id || !checkout_id) {
        return NextResponse.json({ error: 'Missing authentication parameters' }, { status: 400 });
      }

      // Verify the credential exists
      const { data: cred, error: credError } = await supabase
        .from('passkey_credentials')
        .select('credential_id')
        .eq('credential_id', credential_id)
        .single();

      if (credError || !cred) {
        return NextResponse.json({ error: 'Passkey not recognized. Please verify with Aadhaar.' }, { status: 401 });
      }

      // Deduct 1 merchant credit
      const { error: updateError } = await supabase
        .from('merchant_accounts')
        .update({ verification_credits: merchant.verification_credits - 1 })
        .eq('shop_domain', targetShop);

      if (updateError) throw updateError;

      // Record ephemeral verification session
      await supabase
        .from('age_verifications')
        .upsert({
          checkout_id,
          age_verified: true,
          attempts: 1,
          created_at: new Date().toISOString()
        }, { onConflict: 'checkout_id' });

      // Update credential last used timestamp
      await supabase
        .from('passkey_credentials')
        .update({ last_used_at: new Date().toISOString() })
        .eq('credential_id', credential_id);

      return NextResponse.json({
        success: true,
        age_verified: true,
        method: 'passkey',
        remaining_credits: merchant.verification_credits - 1
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

