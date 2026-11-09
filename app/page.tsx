'use client';

import { useState } from 'react';
import NovaScanner from '@/nova-engine/NovaScanner';

export default function CheckoutVerificationModal() {
  const [useNova, setUseNova] = useState(false);
  const [verifiedStatus, setVerifiedStatus] = useState(false);

  // Handle successful client-side Nova ZKP proof generation
  const handleNovaVerified = async (proof) => {
    console.log("Nova ZKP proof generated locally:", proof);
    
    // Send the succinct proof token to your backend or Shopify session
    const res = await fetch('/api/verify-ephemeral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proofData: JSON.stringify(proof) })
    });

    const data = await res.json();
    if (data.success) {
      setVerifiedStatus(true);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '420px', margin: '0 auto', background: '#fff', borderRadius: '12px' }}>
      <h2>Age Verification Gateway</h2>
      
      {/* Engine Toggle Switch */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button 
          onClick={() => setUseNova(false)}
          style={{ flex: 1, padding: '0.5rem', background: !useNova ? '#2563EB' : '#E5E7EB', color: !useNova ? '#fff' : '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          Server Ephemeral Path
        </button>
        <button 
          onClick={() => setUseNova(true)}
          style={{ flex: 1, padding: '0.5rem', background: useNova ? '#2563EB' : '#E5E7EB', color: useNova ? '#fff' : '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          Client Nova ZKP 🛡️
        </button>
      </div>

      {!verifiedStatus ? (
        useNova ? (
          /* Render the modular Nova Engine */
          <NovaScanner onVerified={handleNovaVerified} />
        ) : (
          /* Fallback Server-Side Upload Form */
          <div>
            <p>Upload a secure document screenshot for RAM-only processing.</p>
            {/* Your existing file upload form code */}
          </div>
        )
      ) : (
        <div style={{ background: '#ECFDF5', color: '#047857', padding: '1rem', borderRadius: '8px', textAlign: 'center', fontWeight: '600' }}>
          ✓ Age Verified via Nova Protocol. Checkout Unlocked.
        </div>
      )}
    </div>
  );
}
