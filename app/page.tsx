'use client';

import { useState, useEffect } from 'react';
import { LogInWithAnonAadhaar, useAnonAadhaar } from '@anon-aadhaar/react';

export default function CheckoutVerificationGate() {
  const [anonAadhaar] = useAnonAadhaar();
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const checkoutId = "chk_live_session_9823"; 

  useEffect(() => {
    if (anonAadhaar.status === 'logged-in') {
      verifyAndSyncBackend(true);
    }
  }, [anonAadhaar.status]);

  const verifyAndSyncBackend = async (status: boolean) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/zkp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          checkout_id: checkoutId, 
          age_verified: status,
          shop_domain: 'standalone-test.myshopify.com'
        }),
      });
      const data = await res.json();
      if (data.success && data.age_verified) {
        setIsVerified(true);
      }
    } catch (err) {
      console.error('Backend sync failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      maxWidth: '420px',
      margin: '32px auto',
      padding: '24px',
      borderRadius: '16px',
      backgroundColor: '#ffffff',
      boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)',
      border: '1px solid #eaeaea',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxSizing: 'border-box'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', margin: '0 0 8px 0' }}>
          Age Verification Required
        </h2>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0', lineHeight: '1.4' }}>
          Restricted goods detected. Please verify your age securely via ZeroAssert before selecting your payment method.
        </p>
      </div>

      {!isVerified ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px 0',
          gap: '8px'
        }}>
          <div style={{ display: 'inline-block' }}>
            <LogInWithAnonAadhaar useTestAadhaar={false} />
          </div>
          {anonAadhaar.status === 'logged-in' && (
            <p style={{ fontSize: '12px', color: '#4f46e5', fontWeight: '500', margin: '0' }}>
              Processing zero-knowledge proof...
            </p>
          )}
        </div>
      ) : (
        <div style={{
          backgroundColor: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: '8px',
          padding: '12px',
          textAlign: 'center',
          marginBottom: '16px'
        }}>
          <p style={{ fontSize: '13px', fontWeight: '600', color: '#065f46', margin: '0 0 2px 0' }}>
            Age Verified Successfully (18+)
          </p>
          <p style={{ fontSize: '11px', color: '#047857', margin: '0' }}>
            Payment methods unlocked.
          </p>
        </div>
      )}

      {/* Payment Gateway Buttons */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        marginTop: '12px',
        opacity: isVerified ? 1 : 0.35,
        pointerEvents: isVerified ? 'auto' : 'none',
        transition: 'opacity 0.2s ease'
      }}>
        <button 
          disabled={!isVerified}
          style={{
            width: '100%',
            backgroundColor: '#000000',
            color: '#ffffff',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            border: 'none',
            cursor: isVerified ? 'pointer' : 'not-allowed',
            outline: 'none'
          }}
        >
          Pay via UPI (Instant Intent)
        </button>

        <button 
          disabled={!isVerified}
          style={{
            width: '100%',
            backgroundColor: '#f3f4f6',
            color: '#1f2937',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            border: '1px solid #e5e7eb',
            cursor: isVerified ? 'pointer' : 'not-allowed',
            outline: 'none'
          }}
        >
          Pay via Credit / Debit Card
        </button>
      </div>
    </div>
  );
}
