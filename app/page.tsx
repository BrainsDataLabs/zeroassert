'use client';

import { useState, useEffect, useRef } from 'react';

export const dynamic = 'force-dynamic';

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export default function CheckoutVerificationGate() {
  const [isVerified, setIsVerified] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [passkeySaved, setPasskeySaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const checkoutId = 'chk_live_session_9823';
  const shopDomain = 'standalone-test.myshopify.com';

  useEffect(() => {
    const savedCredId = localStorage.getItem('zeroassert_passkey_id');
    if (savedCredId) {
      setHasPasskey(true);
    }
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setErrorMsg(null);
    setStatusText('Streaming securely to ephemeral edge...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('checkout_id', checkoutId);
      formData.append('shop_domain', shopDomain);

      const res = await fetch('/api/verify-ephemeral', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.age_verified) {
        setIsVerified(true);
        setStatusText('');
      } else {
        setErrorMsg(data.error || 'Verification failed. Please try a clearer QR image.');
      }
    } catch {
      setErrorMsg('Network error connecting to verification engine.');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSimulate = async () => {
    setLoading(true);
    setErrorMsg(null);
    setStatusText('Running ephemeral check...');

    try {
      const formData = new FormData();
      formData.append('checkout_id', checkoutId);
      formData.append('shop_domain', shopDomain);
      formData.append('bypass_simulation', 'true');

      const res = await fetch('/api/verify-ephemeral', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.age_verified) {
        setIsVerified(true);
        setStatusText('');
      } else {
        setErrorMsg(data.error || 'Simulation failed.');
      }
    } catch {
      setErrorMsg('Network error.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePasskey = async () => {
    if (!window.PublicKeyCredential) {
      setErrorMsg('Biometric Passkeys are not supported on this browser.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const userId = new Uint8Array(16);
      crypto.getRandomValues(userId);

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'ZeroAssert' },
          user: {
            id: userId,
            name: 'anonymous_buyer',
            displayName: 'Verified Buyer',
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
          },
          timeout: 60000,
        },
      })) as PublicKeyCredential;

      if (credential) {
        const rawId = bufferToBase64(credential.rawId);
        localStorage.setItem('zeroassert_passkey_id', rawId);
        setPasskeySaved(true);
      }
    } catch {
      setErrorMsg('Passkey enrollment cancelled.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPasskey = async () => {
    const savedCredId = localStorage.getItem('zeroassert_passkey_id');
    if (!savedCredId) {
      setHasPasskey(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: 'required',
        },
      });

      if (assertion) {
        setIsVerified(true);
      }
    } catch {
      setErrorMsg('Passkey authentication cancelled.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{
      minHeight: '100dvh',
      backgroundColor: '#f8fafc',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px 16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxSizing: 'border-box',
    }}>
      <div style={{
        maxWidth: '400px',
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        padding: '24px 20px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
        border: '1px solid #e2e8f0',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '42px',
          height: '42px',
          backgroundColor: '#e0e7ff',
          color: '#4338ca',
          borderRadius: '50%',
          marginBottom: '12px',
          fontSize: '18px',
        }}>
          🛡️
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 6px 0' }}>
          Age Verification Required
        </h2>

        <p style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.4', margin: '0 0 16px 0' }}>
          Restricted items detected. Complete verification to unlock payment options.
        </p>

        {errorMsg && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            fontSize: '12px',
            padding: '8px 12px',
            borderRadius: '8px',
            marginBottom: '14px',
          }}>
            {errorMsg}
          </div>
        )}

        {!isVerified ? (
          <div style={{
            padding: '16px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            marginBottom: '20px',
          }}>
            {hasPasskey ? (
              <div>
                <button
                  type="button"
                  onClick={handleVerifyPasskey}
                  disabled={loading}
                  style={{
                    width: '100%',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    padding: '12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <span>⚡</span> 1-Click Biometric Verification
                </button>
                <p style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
                  Passkey detected on this device.
                </p>
                <button
                  type="button"
                  onClick={() => setHasPasskey(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6366f1',
                    fontSize: '11px',
                    marginTop: '6px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Verify using QR instead
                </button>
              </div>
            ) : (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  style={{
                    width: '100%',
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '13px',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Upload Secure QR Screenshot
                </button>
                <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '10px' }}>
                  Processed ephemerally in RAM. Zero personal data saved.
                </p>
              </div>
            )}

            {loading && (
              <p style={{ fontSize: '12px', color: '#4f46e5', fontWeight: '500', marginTop: '10px' }}>
                {statusText || 'Processing...'}
              </p>
            )}

            <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px dashed #e2e8f0' }}>
              <button
                type="button"
                onClick={handleSimulate}
                style={{
                  background: 'none',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  color: '#64748b',
                  fontSize: '11px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                }}
              >
                ⚡ [Dev Test: Simulate Ephemeral Verification]
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '16px',
          }}>
            <p style={{ fontSize: '13px', fontWeight: '600', color: '#166534', margin: '0 0 2px 0' }}>
              ✅ Age Verified (18+)
            </p>
            <p style={{ fontSize: '11px', color: '#15803d', margin: 0 }}>
              Payment methods unlocked.
            </p>

            {!passkeySaved ? (
              <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #dcfce7' }}>
                <button
                  type="button"
                  onClick={handleCreatePasskey}
                  disabled={loading}
                  style={{
                    backgroundColor: '#15803d',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: '600',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  🔐 Enable 1-Click Passkey for Next Time
                </button>
              </div>
            ) : (
              <p style={{ fontSize: '11px', color: '#166534', marginTop: '8px' }}>
                ⚡ Passkey enrolled! Future checkouts verify in 1 click.
              </p>
            )}
          </div>
        )}

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          opacity: isVerified ? 1 : 0.35,
          pointerEvents: isVerified ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}>
          <button
            type="button"
            style={{
              width: '100%',
              backgroundColor: '#0f172a',
              color: '#ffffff',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              border: 'none',
              cursor: isVerified ? 'pointer' : 'not-allowed',
            }}
          >
            Pay via UPI (Instant Intent)
          </button>

          <button
            type="button"
            style={{
              width: '100%',
              backgroundColor: '#ffffff',
              color: '#334155',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              border: '1px solid #cbd5e1',
              cursor: isVerified ? 'pointer' : 'not-allowed',
            }}
          >
            Pay via Credit / Debit Card
          </button>
        </div>
      </div>
    </main>
  );
}
