'use client';

import { useState, useRef } from 'react';

export default function ZeroAssert() {
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File | null, bypass = false) => {
    if (!file && !bypass) return;
    
    setLoading(true);
    setError('');

    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      fd.append('bypass_simulation', bypass.toString());
      
      // Shopify simulated params
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
        // Directly display the detailed educational error from the API
        setError(data.error || 'Verification failed. Please try again.');
        setIsVerified(false);
      }
    } catch (err: any) {
      setError('Network error. Unable to reach verification engine.');
    } finally {
      setLoading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files[0], false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', padding: '2rem', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
        
        <div style={{ marginBottom: '1.5rem' }}>
          <svg style={{ width: '48px', height: '48px', margin: '0 auto', color: '#3B82F6' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginTop: '0.5rem', color: '#111827' }}>Age Verification Required</h2>
          <p style={{ fontSize: '0.875rem', color: '#6B7280', marginTop: '0.25rem' }}>Restricted items detected. Complete verification to unlock payment.</p>
        </div>

        {error && (
          <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #F87171', color: '#B91C1C', padding: '0.75rem', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            {error}
          </div>
        )}

        {!isVerified ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef}
              onChange={onFileChange}
              style={{ display: 'none' }}
            />
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              style={{ width: '100%', backgroundColor: '#111827', color: '#ffffff', padding: '0.75rem', borderRadius: '8px', fontWeight: '500', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Processing Securely...' : 'Upload Secure QR Screenshot'}
            </button>
            
            <p style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>Processed ephemerally in RAM. Zero data stored.</p>
            
            {process.env.NODE_ENV !== 'production' && (
              <button 
                onClick={() => handleUpload(null, true)}
                disabled={loading}
                style={{ width: '100%', backgroundColor: '#ffffff', color: '#6B7280', border: '1px dashed #D1D5DB', padding: '0.5rem', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer' }}
              >
                ⚡ [Dev Test: Simulate Verification]
              </button>
            )}

            <hr style={{ margin: '1rem 0', borderColor: '#E5E7EB' }} />
            
            <button disabled style={{ width: '100%', backgroundColor: '#9CA3AF', color: '#ffffff', padding: '0.75rem', borderRadius: '8px', fontWeight: '500', border: 'none', cursor: 'not-allowed' }}>Pay via UPI (Instant Intent)</button>
            <button disabled style={{ width: '100%', backgroundColor: '#F3F4F6', color: '#9CA3AF', padding: '0.75rem', borderRadius: '8px', fontWeight: '500', border: '1px solid #E5E7EB', cursor: 'not-allowed' }}>Pay via Credit / Debit Card</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ backgroundColor: '#ECFDF5', border: '1px solid #10B981', color: '#047857', padding: '1rem', borderRadius: '8px', fontWeight: '500' }}>
              ✓ 18+ Age Verified Successfully
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
