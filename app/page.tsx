'use client';

import { useState, useEffect, useRef } from 'react';

export const dynamic = 'force-dynamic';

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export default function CheckoutGate() {
  const [isVerified, setIsVerified] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [passkeySaved, setPasskeySaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const checkoutId = 'chk_live_session_9823';
  const shopDomain = 'standalone-test.myshopify.com';

  useEffect(() => {
    if (localStorage.getItem('zeroassert_passkey_id')) setHasPasskey(true);
  }, []);

  const sendPayload = async (file?: File, isSim = false) => {
    setLoading(true);
    setErrorMsg(null);
    setStatusText(isSim ? 'Simulating check...' : 'Streaming to edge...');

    try {
      const fd = new FormData();
      fd.append('checkout_id', checkoutId);
      fd.append('shop_domain', shopDomain);
      if (isSim) fd.append('bypass_simulation', 'true');
      if (file) fd.append('file', file);

      const res = await fetch('/api/verify-ephemeral', { method: 'POST', body: fd });
      const data = await res.json();

      if (data.success && data.age_verified) {
        setIsVerified(true);
        setStatusText('');
      } else {
        setErrorMsg(data.error || 'Verification failed. Try a clearer image.');
      }
    } catch {
      setErrorMsg('Network error connecting to verification engine.');
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleCreatePasskey = async () => {
    if (!window.PublicKeyCredential) return setErrorMsg('Passkeys not supported.');
    setLoading(true);
    setErrorMsg(null);
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = crypto.getRandomValues(new Uint8Array(16));
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'ZeroAssert' },
          user: { id: userId, name: 'buyer', displayName: 'Verified Buyer' },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
          timeout: 60000,
        },
      })) as PublicKeyCredential;

      if (cred) {
        localStorage.setItem('zeroassert_passkey_id', bufferToBase64(cred.rawId));
        setPasskeySaved(true);
      }
    } catch {
      setErrorMsg('Passkey enrollment cancelled.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPasskey = async () => {
    const credId = localStorage.getItem('zeroassert_passkey_id');
    if (!credId) return setHasPasskey(false);
    setLoading(true);
    setErrorMsg(null);
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const assertion = await navigator.credentials.get({
        publicKey: { challenge, timeout: 60000, userVerification: 'required' },
      });
      if (assertion) setIsVerified(true);
    } catch {
      setErrorMsg('Biometric authentication cancelled.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: '100dvh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '380px', width: '100%', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', textAlign: 'center' }}>
        <div style={{ fontSize: '28px', marginBottom: '8px' }}>🛡️</div>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 6px 0' }}>Age Verification Required</h2>
        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px 0' }}>Restricted items detected. Complete verification to unlock payment.</p>

        {errorMsg && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '12px', padding: '8px', borderRadius: '8px', marginBottom: '12px' }}>{errorMsg}</div>}

        {!isVerified ? (
          <div style={{ padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', marginBottom: '16px' }}>
            {hasPasskey ? (
              <>
                <button type="button" onClick={handleVerifyPasskey} disabled={loading} style={{ width: '100%', background: '#2563eb', color: '#fff', padding: '12px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', border: 'none', cursor: 'pointer' }}>⚡ 1-Click Biometric Verification</button>
                <button type="button" onClick={() => setHasPasskey(false)} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '11px', marginTop: '8px', cursor: 'pointer', textDecoration: 'underline' }}>Verify using QR instead</button>
              </>
            ) : (
              <>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && sendPayload(e.target.files[0])} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={loading} style={{ width: '100%', background: '#0f172a', color: '#fff', fontWeight: 600, fontSize: '13px', padding: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Upload Secure QR Screenshot</button>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '8px 0 0 0' }}>Processed ephemerally in RAM. Zero data stored.</p>
              </>
            )}

            {loading && <p style={{ fontSize: '12px', color: '#4f46e5', fontWeight: '500', margin: '10px 0 0 0' }}>{statusText || 'Processing...'}</p>}

            <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #e2e8f0' }}>
              <button type="button" onClick={() => sendPayload(undefined, true)} style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#64748b', fontSize: '11px', padding: '4px 8px', cursor: 'pointer' }}>⚡ [Dev Test: Simulate Verification]</button>
            </div>
          </div>
        ) : (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '12px', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', fontWeight: '600', color: '#166534', margin: '0 0 2px 0' }}>✅ Age Verified (18+)</p>
            <p style={{ fontSize: '11px', color: '#15803d', margin: 0 }}>Payment methods unlocked.</p>
            {!passkeySaved ? (
              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #dcfce7' }}>
                <button type="button" onClick={handleCreatePasskey} disabled={loading} style={{ background: '#15803d', color: '#fff', fontSize: '12px', fontWeight: '600', padding: '8px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}>🔐 Enable 1-Click Passkey for Next Time</button>
              </div>
            ) : (
              <p style={{ fontSize: '11px', color: '#166534', marginTop: '6px' }}>⚡ Passkey enrolled! Future checkouts verify in 1 click.</p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: isVerified ? 1 : 0.35, pointerEvents: isVerified ? 'auto' : 'none' }}>
          <button type="button" style={{ width: '100%', background: '#0f172a', color: '#fff', padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', border: 'none', cursor: isVerified ? 'pointer' : 'not-allowed' }}>Pay via UPI (Instant Intent)</button>
          <button type="button" style={{ width: '100%', background: '#fff', color: '#334155', padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', border: '1px solid #cbd5e1', cursor: isVerified ? 'pointer' : 'not-allowed' }}>Pay via Credit / Debit Card</button>
        </div>
      </div>
    </main>
  );
}
