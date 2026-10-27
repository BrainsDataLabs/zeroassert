// LEAN INJECTION: Forces Vercel to drop the cache and run this dynamically on every request
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(request: Request) {
  try {
    const { checkout_id, age_verified } = await request.json();

    if (!checkout_id) {
      return NextResponse.json({ error: 'Missing checkout identifier' }, { status: 400 });
    }

    // Check existing attempts for rate-limiting
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

    // Upsert ephemeral token record
    const { error } = await supabase
      .from('age_verifications')
      .upsert({
        checkout_id,
        age_verified: Boolean(age_verified),
        attempts: existing ? existing.attempts + 1 : 1,
        created_at: new Date().toISOString(),
      }, { onConflict: 'checkout_id' });

    if (error) throw error;

    return NextResponse.json({ success: true, age_verified });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
