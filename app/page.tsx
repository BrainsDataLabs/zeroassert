// app/page.tsx
'use client';

import { useState } from 'react';
import NovaScanner from './nova-engine/NovaScanner';

export default function AgeVerificationGateway() {
  const [mode, setMode] = useState<'ephemeral' | 'nova'>('ephemeral');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');

  const handleEphemeralUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setLoading(true);
    setStatusMessage('Uploading to RAM for ephemeral assertion...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('checkout_id', 'chk_live_' + Math.random().toString(36).substring(2, 9));
      formData.append('shop_domain', 'standalone-test.myshopify.com');

      const res = await fetch('/api/verify-ephemeral', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Verification rejected');
      }

      setVerified(true);
      setStatusMessage('Age verified (18+). Checkout unlocked.');
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleNovaVerified = (proof: any) => {
    setVerified(true);
    setStatusMessage('Proof successfully verified client-side via Nova.');
  };

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB', padding: '1.5rem' }}>
      <div style={{ width: '100%', maxWidth: '420px', background: '#FFFFFF', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', padding: '2rem' }}>
        
        <h1 style={{ fontSize: '1.4rem', fontWeight: '700', textAlign: 'center', marginBottom: '1.5rem', color: '#111827' }}>
          Age Verification Gateway
        </h1>

        {/* Engine Toggle */}
        <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: '8px', padding: '4px', marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={() => { setMode('ephemeral'); setError(''); }}
            style={{
              flex: 1,
              padding: '0.6rem 0.5rem',
              fontSize: '0.85rem',
              fontWeight: '600',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: mode === 'ephemeral' ? '#2563EB' : 'transparent',
              color: mode === 'ephemeral' ? '#FFFFFF' : '#4B5563',
              transition: 'all 0.2s',
            }}
          >
            Server Ephemeral Path
          </button>
          <button
            type="button"
            onClick={() => { setMode('nova'); setError(''); }}
            style={{
              flex: 1,
              padding: '0.6rem 0.5rem',
              fontSize: '0.85rem',
              fontWeight: '600',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: mode === 'nova' ? '#2563EB' : 'transparent',
              color: mode === 'nova' ? '#FFFFFF' : '#4B5563',
              transition: 'all 0.2s',
            }}
          >
            Client Nova ZKP 🛡️
          </button>
        </div>

        {verified ? (
          <div style={{ padding: '1.5rem', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#065F46', marginBottom: '0.25rem' }}>Age Verified (18+)</h3>
            <p style={{ fontSize: '0.85rem', color: '#047857' }}>{statusMessage}</p>
          </div>
        ) : mode === 'nova' ? (
          <NovaScanner onVerified={handleNovaVerified} />
        ) : (
          <div>
            <p style={{ fontSize: '0.875rem', color: '#4B5563', textAlign: 'center', marginBottom: '1.5rem', lineHeight: '1.4' }}>
              Upload an e-document or screenshot. Demographics are evaluated strictly in transient RAM and never stored.
            </p>

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', padding: '0.75rem', borderRadius: '8px', fontSize: '0.825rem', marginBottom: '1.25rem' }}>
                {error}
              </div>
            )}

            <label
              style={{
                display: 'block',
                width: '100%',
                padding: '1.5rem 1rem',
                border: '2px dashed #D1D5DB',
                borderRadius: '12px',
                textAlign: 'center',
                cursor: loading ? 'not-allowed' : 'pointer',
                background: '#F9FAFB',
              }}
            >
              <input
                type="file"
                accept="image/*"
                onChange={handleEphemeralUpload}
                disabled={loading}
                style={{ display: 'none' }}
              />
              <span style={{ display: 'block', fontSize: '1.8rem', marginBottom: '0.5rem' }}>📄</span>
              <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#1F2937' }}>
                {loading ? 'Processing in memory...' : 'Choose File or Screenshot'}
              </span>
              <span style={{ display: 'block', fontSize: '0.75rem', color: '#6B7280', marginTop: '0.25rem' }}>
                PNG, JPG up to 10MB
              </span>
            </label>

            {loading && (
              <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.85rem', color: '#2563EB', fontWeight: '500' }}>
                ⏳ {statusMessage}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
