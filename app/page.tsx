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
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    }}>
      <div style={{
        maxWidth: '400px',
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
        border: '1px solid #e2e8f0',
        textAlign: 'center'
      }}>
        <h2 style={{
          fontSize: '20px',
          fontWeight: '700',
          color: '#0f172a',
          margin: '0 0 8px 0'
        }}>
          Age Verification Required
        </h2>
        
        <p style={{
          fontSize: '13px',
          color: '#64748b',
          lineHeight: '1.5',
          margin: '0 0 20px 0'
        }}>
          Restricted goods detected. Please verify your age securely via ZeroAssert before selecting your payment method.
        </p>

        {!isVerified ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backgroundColor: '#f1f5f9',
            borderRadius: '12px',
            marginBottom: '20px'
          }}>
            <LogInWithAnonAadhaar useTestAadhaar={false} />
            {anonAadhaar.status === 'logged-in' && (
              <p style={{ fontSize: '12px', color: '#4f46e5', fontWeight: '500', marginTop: '10px' }}>
                Processing zero-knowledge proof...
              </p>
            )}
          </div>
        ) : (
          <div style={{
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '20px'
          }}>
            <p style={{ fontSize: '13px', fontWeight: '600', color: '#166534', margin: '0 0 2px 0' }}>
              ✅ Age Verified Successfully (18+)
            </p>
            <p style={{ fontSize: '11px', color: '#15803d', margin: 0 }}>
              Payment gateway unlocked.
            </p>
          </div>
        )}

        {/* Payment Gate: Unlocks automatically when isVerified is true */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          opacity: isVerified ? 1 : 0.4,
          pointerEvents: isVerified ? 'auto' : 'none',
          transition: 'opacity 0.2s ease'
        }}>
          <button style={{
            width: '100%',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            border: 'none',
            cursor: isVerified ? 'pointer' : 'not-allowed'
          }}>
            Pay via UPI (Instant Intent)
          </button>
          
          <button style={{
            width: '100%',
            backgroundColor: '#f8fafc',
            color: '#334155',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            border: '1px solid #cbd5e1',
            cursor: isVerified ? 'pointer' : 'not-allowed'
          }}>
            Pay via Credit / Debit Card
          </button>
        </div>
      </div>
    </div>
  );
}
