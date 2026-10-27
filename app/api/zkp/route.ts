import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(request: Request) {
  try {
    const { checkout_id, age_verified, shop_domain } = await request.json();

    if (!checkout_id) {
      return NextResponse.json({ error: 'Missing checkout identifier' }, { status: 400 });
    }

    const targetShop = shop_domain || 'standalone-test.myshopify.com';

    // 1. Check merchant credits before allowing verification
    const { data: merchant, error: merchantError } = await supabase
      .from('merchant_accounts')
      .select('verification_credits')
      .eq('shop_domain', targetShop)
      .single();

    if (merchantError || !merchant) {
      return NextResponse.json({ error: 'Merchant account not found' }, { status: 404 });
    }

    if (merchant.verification_credits <= 0) {
      return NextResponse.json({ error: 'Merchant verification credits exhausted.' }, { status: 403 });
    }

    // 2. Check existing verification attempts for rate-limiting
    const { data: existing } = await supabase
      .from('age_verifications')
      .select('attempts, age_verified')
      .eq('checkout_id', checkout_id)
      .single();

    if (existing && existing.attempts >= 3 && !existing.age_verified) {
      return NextResponse.json(
        { error: 'Maximum verification attempts exceeded for this session.' },
        { status: 429 }
      );
    }

    // 3. If verification is successful, decrement merchant credits by 1
    if (age_verified) {
      const { error: updateError } = await supabase
        .from('merchant_accounts')
        .update({ verification_credits: merchant.verification_credits - 1 })
        .eq('shop_domain', targetShop);

      if (updateError) throw updateError;
    }

    // 4. Upsert ephemeral token record
    const { error: logError } = await supabase
      .from('age_verifications')
      .upsert({
        checkout_id,
        age_verified: Boolean(age_verified),
        attempts: existing ? existing.attempts + 1 : 1,
        created_at: new Date().toISOString(),
      }, { onConflict: 'checkout_id' });

    if (logError) throw logError;

    return NextResponse.json({ 
      success: true, 
      age_verified, 
      remaining_credits: merchant.verification_credits - (age_verified ? 1 : 0) 
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
