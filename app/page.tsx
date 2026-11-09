'use client';

import React, { useState, useRef } from 'react';
import NovaScanner from '../../nova-engine/NovaScanner';

export default function CheckoutVerificationGateway() {
  // Engine Toggle: 'nova' (Client-side WASM/Worker) vs 'ephemeral' (Server RAM fallback)
  const [engineMode, setEngineMode] = useState<'nova' | 'ephemeral'>('nova');
  
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Server-Side Ephemeral Processing
  const handleEphemeralUpload = async (file: File | null, bypass = false) => {
    if (!file && !bypass) return;
    
    setLoading(true);
    setError('');

    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      fd.append('bypass_simulation', bypass.toString());
      fd.append('checkout_id', 'chk_live_session_9823');
      fd.append('shop_domain', 'standalone-test.myshopify.com');

      const res = await fetch('/api/verify-ephemeral', { 
        method: 'POST', 
        body: fd 
      });

      const data = await res.json();

      if (data.success && data.age_verified) {
        setIsVerified(true);
        setError('');
      } else {
        setError(data.error || 'Server verification failed.');
        setIsVerified(false);
      }
    } catch (err) {
      setError('Network error connecting to verification server.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Successful Nova Client-Side Proof Generation
  const handleNovaVerified = (proof: any) => {
    setIsVerified(true);
    setError('');
    console.log('Nova Client Proof Generated Successfully:', proof);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', padding: '2rem', maxWidth: '420px', width: '100%', textAlign: 'center' }}>
        
        {/* Branding & Header */}
        <div style={{ marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.05em', color: '#2563EB', textTransform: 'uppercase' }}>
            BRAINSDATA LABS • ZeroAssert
          </span>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginTop: '0.25rem', color: '#111827' }}>
            Age Verification Required
          </h2>
          <p style={{ fontSize: '0.8125rem', color: '#6B7280', marginTop: '0.2rem' }}>
            Complete 18+ verification to unlock Shopify checkout.
          </p>
        </div>

        {/* Engine Switcher Tabs */}
        <div style={{ display: 'flex', background: '#E5E7EB', padding: '4px', borderRadius: '8px', marginBottom: '1.5rem' }}>
          <button
            onClick={() => { setEngineMode('nova'); setIsVerified(false); setError(''); }}
            style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem', fontWeight: '600', border: 'none', borderRadius: '6px', cursor: 'pointer', background: engineMode === 'nova' ? '#ffffff' : 'transparent', color: engineMode === 'nova' ? '#111827' : '#4B5563', boxShadow: engineMode === 'nova' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
          >
            ⚡ Nova Client Engine
          </button>
          <button
            onClick={() => { setEngineMode('ephemeral'); setIsVerified(false); setError(''); }}
            style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem', fontWeight: '600', border: 'none', borderRadius: '6px', cursor: 'pointer', background: engineMode === 'ephemeral' ? '#ffffff' : 'transparent', color: engineMode === 'ephemeral' ? '#111827' : '#4B5563', boxShadow: engineMode === 'ephemeral' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
          >
            🛡️ Server RAM Engine
          </button>
        </div>

        {error && (
          <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #F87171', color: '#B91C1C', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            {error}
          </div>
        )}

        {!isVerified ? (
          <div>
            {/* CONDITIONAL RENDER: Engine A (Nova Client-Side) vs Engine B (Server Ephemeral) */}
            {engineMode === 'nova' ? (
              <NovaScanner onVerified={handleNovaVerified} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileInputRef}
                  onChange={(e) => e.target.files?.[0] && handleEphemeralUpload(e.target.files[0], false)}
                  style={{ display: 'none' }}
                />
                
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  style={{ width: '100%', backgroundColor: '#111827', color: '#ffffff', padding: '0.75rem', borderRadius: '8px', fontWeight: '500', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? 'Processing in RAM...' : 'Upload Secure QR (Server RAM)'}
                </button>
                
                <p style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>Zero PII stored. Ephemeral backend decryption.</p>
                
                {process.env.NODE_ENV !== 'production' && (
                  <button 
                    onClick={() => handleEphemeralUpload(null, true)}
                    disabled={loading}
                    style={{ width: '100%', backgroundColor: '#ffffff', color: '#6B7280', border: '1px dashed #D1D5DB', padding: '0.4rem', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    ⚡ [Dev Test: Simulate Server Route]
                  </button>
                )}
              </div>
            )}

            <hr style={{ margin: '1.25rem 0', borderColor: '#E5E7EB' }} />
            
            <button disabled style={{ width: '100%', backgroundColor: '#9CA3AF', color: '#ffffff', padding: '0.75rem', borderRadius: '8px', fontWeight: '500', border: 'none', cursor: 'not-allowed' }}>Pay via UPI (Locked)</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ backgroundColor: '#ECFDF5', border: '1px solid #10B981', color: '#047857', padding: '1rem', borderRadius: '8px', fontWeight: '500', fontSize: '0.9rem' }}>
              ✓ 18+ Age Verification Confirmed ({engineMode.toUpperCase()} Engine)
            </div>
            
            <button style={{ width: '100%', backgroundColor: '#10B981', color: '#ffffff', padding: '0.75rem', borderRadius: '8px', fontWeight: '600', border: 'none', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)' }}>
              Pay via UPI (Instant Intent)
            </button>
            
            <button style={{ width: '100%', backgroundColor: '#ffffff', color: '#374151', padding: '0.75rem', borderRadius: '8px', fontWeight: '500', border: '1px solid #D1D5DB', cursor: 'pointer' }}>
              Pay via Credit / Debit Card
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
