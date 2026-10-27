
'use client';

import { useState, useEffect } from 'react';
import { LogInWithAnonAadhaar, useAnonAadhaar } from '@anon-aadhaar/react';

export default function CheckoutVerificationGate() {
  const [anonAadhaar] = useAnonAadhaar();
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const checkoutId = "chk_live_session_9823"; 

  useEffect(() => {
    if (anonAadhaar.status === 'logged-in') {
      verifyAndSyncBackend(true);
    } else if (anonAadhaar.status === 'logging-in') {
      setErrorMsg(null);
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
      } else if (data.error) {
        setErrorMsg(data.error);
      }
    } catch (err: any) {
      setErrorMsg('Verification failed. Please retry.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Surgical CSS overrides for third-party button and modal */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* Hide the broken third-party image */
        button img {
          display: none !important;
        }
        /* Style the Anon Aadhaar login button to look professional */
        button[data-testid="login-button"], 
        .anon-aadhaar-login-button,
        div:has(> button) > button {
          background-color: #0f172a !important;
          color: #ffffff !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          padding: 12px 20px !important;
          border-radius: 8px !important;
          border: none !important;
          cursor: pointer !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
          transition: background-color 0.2s ease !important;
          width: 100% !important;
        }
        div:has(> button) > button:hover {
          background-color: #1e293b !important;
        }
      `}} />

      <main style={{
        minHeight: '100dvh',
        backgroundColor: '#f1f5f9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 16px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        boxSizing: 'border-box'
      }}>
        <div style={{
          maxWidth: '400px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '24px 20px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
          border: '1px solid #e2e8f0',
          textAlign: 'center'
        }}>
          {/* Header */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '44px',
            height: '44px',
            backgroundColor: '#e0e7ff',
            color: '#4338ca',
            borderRadius: '50%',
            marginBottom: '12px',
            fontSize: '20px'
          }}>
            🛡️
          </div>

          <h2 style={{
            fontSize: '18px',
            fontWeight: '700',
            color: '#0f172a',
            margin: '0 0 6px 0'
          }}>
            Age Verification Required
          </h2>
          
          <p style={{
            fontSize: '12px',
            color: '#64748b',
            lineHeight: '1.4',
            margin: '0 0 18px 0'
          }}>
            This order contains age-restricted items. Complete a 100% private Zero-Knowledge age check to unlock payment.
          </p>

          {errorMsg && (
            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              fontSize: '12px',
              padding: '8px 12px',
              borderRadius: '8px',
              marginBottom: '16px'
            }}>
              {errorMsg}
            </div>
          )}

          {/* Verification Box */}
          {!isVerified ? (
            <div style={{
              padding: '16px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              marginBottom: '20px'
            }}>
              <LogInWithAnonAadhaar 
                nullifierSeed={1234}
                fieldsToReveal={['revealAgeAbove18']}
                useTestAadhaar={true}
              />

              <p style={{
                fontSize: '11px',
                color: '#94a3b8',
                marginTop: '10px',
                lineHeight: '1.3'
              }}>
                Upload an e-Aadhaar QR screenshot or PDF.<br/>
                <em>Do not use live camera capture.</em>
              </p>

              {anonAadhaar.status === 'logging-in' && (
                <p style={{ fontSize: '12px', color: '#4f46e5', fontWeight: '500', marginTop: '10px' }}>
                  Generating cryptographic proof...
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
                ✅ Age Verified (18+)
              </p>
              <p style={{ fontSize: '11px', color: '#15803d', margin: 0 }}>
                Payment methods unlocked.
              </p>
            </div>
          )}

          {/* Payment Gate */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            opacity: isVerified ? 1 : 0.35,
            pointerEvents: isVerified ? 'auto' : 'none',
            transition: 'opacity 0.2s ease'
          }}>
            <button style={{
              width: '100%',
              backgroundColor: '#0f172a',
              color: '#ffffff',
              padding: '12px',
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
              backgroundColor: '#ffffff',
              color: '#334155',
              padding: '12px',
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
      </main>
    </>
  );
}
