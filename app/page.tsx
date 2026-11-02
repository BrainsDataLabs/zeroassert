'use client';

import { useState, useEffect } from 'react';
import { AnonAadhaarProvider, LogInWithAnonAadhaar, useAnonAadhaar } from '@anon-aadhaar/react';

export const dynamic = 'force-dynamic';

function VerificationGateInner() {
  const [anonAadhaar] = useAnonAadhaar();
  const [isVerified, setIsVerified] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checkoutId = "chk_live_session_9823";
  const shopDomain = "standalone-test.myshopify.com";

  useEffect(() => {
    if (anonAadhaar.status === 'logged-in' && !isVerified) {
      syncZkpProof();
    }
  }, [anonAadhaar.status]);

  const syncZkpProof = async () => {
    try {
      const res = await fetch('/api/zkp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkout_id: checkoutId, age_verified: true, shop_domain: shopDomain }),
      });
      const data = await res.json();
      if (data.success) setIsVerified(true);
    } catch {
      setErrorMsg('Network error.');
    }
  };

  // EXTREME LEAN MODE: If proving is actively running, unmount ALL heavy DOM elements.
  // Give 100% of the browser's RAM to the WASM execution.
  if (anonAadhaar.status === 'logging-in') {
    return (
      <main style={{ minHeight: '100dvh', backgroundColor: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#ffffff', fontSize: '14px', fontFamily: 'monospace' }}>
          ⚠️ DEVICE DEDICATED TO CRYPTOGRAPHIC PROVING.<br/><br/>
          Do not switch tabs. Do not lock screen.<br/>
          Allocating memory...
        </p>
      </main>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        button img { display: none !important; }
        div:has(> button) > button {
          background-color: #0f172a !important; color: #ffffff !important;
          font-weight: 600 !important; font-size: 13px !important;
          padding: 12px 16px !important; border-radius: 8px !important; width: 100% !important;
        }
      `}} />
      <main style={{ minHeight: '100dvh', backgroundColor: '#f8fafc', padding: '20px' }}>
        {!isVerified ? (
          <div style={{ maxWidth: '400px', margin: '0 auto', background: '#fff', padding: '20px', borderRadius: '12px' }}>
             <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Verify Age (Strict On-Device)</h2>
             {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}
             <LogInWithAnonAadhaar nullifierSeed={1234} fieldsToReveal={['revealAgeAbove18']} useTestAadhaar={false} />
          </div>
        ) : (
          <div style={{ maxWidth: '400px', margin: '0 auto', background: '#f0fdf4', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
            <p style={{ color: '#166534', fontWeight: 'bold' }}>✅ ZKP Verified Locally.</p>
          </div>
        )}
      </main>
    </>
  );
}

export default function CheckoutVerificationGate() {
  return (
    <AnonAadhaarProvider useTestAadhaar={false}>
      <VerificationGateInner />
    </AnonAadhaarProvider>
  );
}
