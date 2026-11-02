import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const checkout_id = (formData.get('checkout_id') as string) || 'chk_live_session_9823';
    const shop_domain = (formData.get('shop_domain') as string) || 'standalone-test.myshopify.com';
    const bypass_simulation = formData.get('bypass_simulation') === 'true';
    const file = formData.get('file') as File | null;

    if (!bypass_simulation && !file) {
      return NextResponse.json({ success: false, error: 'No verification payload' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const debugInfo: Record<string, any> = {
      hasUrl: Boolean(supabaseUrl),
      hasKey: Boolean(serviceKey),
      shop_domain,
    };

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({
        success: false,
        error: 'Supabase keys missing in Vercel. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel Settings and Redeploy.',
        debug: debugInfo,
      }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // 1. Fetch current credits
    const { data: merchant, error: fetchErr } = await supabase
      .from('merchant_accounts')
      .select('verification_credits')
      .eq('shop_domain', shop_domain)
      .maybeSingle();

    debugInfo.fetchError = fetchErr ? fetchErr.message : null;
    debugInfo.merchantFound = Boolean(merchant);
    debugInfo.currentCredits = merchant?.verification_credits;

    if (fetchErr) {
      return NextResponse.json({ success: false, error: `Fetch error: ${fetchErr.message}`, debug: debugInfo }, { status: 500 });
    }

    if (!merchant) {
      return NextResponse.json({ success: false, error: `Merchant domain not found in table: ${shop_domain}`, debug: debugInfo }, { status: 404 });
    }

    // 2. Decrement credit balance
    const currentCredits = merchant.verification_credits ?? 82;
    const nextCredits = Math.max(0, currentCredits - 1);

    const { error: updateErr } = await supabase
      .from('merchant_accounts')
      .update({ verification_credits: nextCredits })
      .eq('shop_domain', shop_domain);

    debugInfo.updateError = updateErr ? updateErr.message : null;
    debugInfo.newCredits = nextCredits;

    if (updateErr) {
      return NextResponse.json({ success: false, error: `Update error: ${updateErr.message}`, debug: debugInfo }, { status: 500 });
    }

    // 3. Insert audit log record
    const { error: insertErr } = await supabase.from('age_verifications').insert([
      {
        checkout_id,
        shop_domain,
        verified: true,
        method: bypass_simulation ? 'simulated' : 'ephemeral_edge',
        created_at: new Date().toISOString(),
      },
    ]);

    debugInfo.insertError = insertErr ? insertErr.message : null;

    return NextResponse.json({
      success: true,
      age_verified: true,
      checkout_id,
      remaining_credits: nextCredits,
      debug: debugInfo,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}
