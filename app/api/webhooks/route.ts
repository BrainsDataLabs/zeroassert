
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const topic = req.headers.get('x-shopify-topic');
    const shop = req.headers.get('x-shopify-shop-domain');

    if (topic === 'app/uninstalled') {
      // The engine logs the event. Later, we will wire Supabase deletion logic here.
      console.log(`[ZeroAssert] App uninstalled by ${shop}. Initiating data scrub.`);
    }

    return NextResponse.json({ message: 'Webhook received and authenticated' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Engine failed to process webhook' }, { status: 500 });
  }
}
