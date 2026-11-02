import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false }
  });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const checkout_id = (formData.get('checkout_id') as string) || 'chk_test';
    const shop_domain = (formData.get('shop_domain') as string) || 'standalone-test.myshopify.com';
    const bypass_simulation = formData.get('bypass_simulation') === 'true';
    const file = formData.get('file') as File | null;

    let isAgeVerified = false;
    if (bypass_simulation || file) {
      isAgeVerified = true;
    } else {
      return NextResponse.json({ success: false, error: 'No verification input provided' }, { status: 400 });
    }

    const supabase = getSupabase();
    let dbStatus: any = { connected: false };

    if (!supabase) {
      dbStatus = { connected: false, reason: 'Missing Vercel Environment Variables (URL or KEY)' };
    } else {
      dbStatus.connected = true;

      // 1. Fetch current credits
      const { data: merchant, error: fetchErr } = await supabase
        .from('merchant_accounts')
        .select('verification_credits')
        .eq('shop_domain', shop_domain)
        .maybeSingle();

      dbStatus.fetchResult = merchant;
      dbStatus.fetchError = fetchErr ? fetchErr.message : null;

      if (merchant && merchant.verification_credits !== undefined) {
        const nextCredits = Math.max(0, merchant.verification_credits - 1);

        // 2. Decrement credit count
        const { data: updateData, error: updateErr } = await supabase
          .from('merchant_accounts')
          .update({ verification_credits: nextCredits })
          .eq('shop_domain', shop_domain)
          .select();

        dbStatus.updatedCredits = nextCredits;
        dbStatus.updateError = updateErr ? updateErr.message : null;
        dbStatus.updateRowsAffected = updateData?.length ?? 0;
      }

      // 3. Insert audit entry
      const { error: insertErr } = await supabase.from('age_verifications').insert([
        {
          checkout_id,
          shop_domain,
          verified: true,
          method: bypass_simulation ? 'simulated' : 'ephemeral_edge',
          created_at: new Date().toISOString(),
        },
      ]);
      dbStatus.insertError = insertErr ? insertErr.message : null;
    }

    return NextResponse.json({
      success: true,
      age_verified: true,
      checkout_id,
      db_status: dbStatus,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Server error' },
      { status: 500 }
    );
  }
}
