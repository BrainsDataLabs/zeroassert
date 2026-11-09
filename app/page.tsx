'use client';

import { useState } from 'react';
import NovaScanner from './nova-engine/NovaScanner';

export default function AgeVerificationGateway() {
  const [mode, setMode] = useState<'ephemeral' | 'nova'>('ephemeral');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const apiUrl = '/api/verify-ephemeral';

  async function handleEphemeralUpload(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    setLoading(true);
    setVerified(false);
    setError('');
    setStatusMessage('Connecting to ZeroAssert verification API...');

    try {
      if (!file.type.startsWith('image/')) {
        throw new Error('Please select an image file.');
      }

      const formData = new FormData();
      formData.append('file', file);

      /*
       * IMPORTANT:
       * Do not manually set Content-Type here.
       * The browser generates the multipart boundary.
       */
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
        },
      });

      const contentType =
        response.headers.get('content-type') || '';

      const text = await response.text();

      if (!response.ok) {
        throw new Error(
          `API returned HTTP ${response.status}. ` +
          `${text.substring(0, 300)}`
        );
      }

      if (!contentType.includes('application/json')) {
        throw new Error(
          `API returned ${contentType || 'unknown content type'} instead of JSON. ` +
          `Response: ${text.substring(0, 300)}`
        );
      }

      let data: any;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `API returned invalid JSON: ${text.substring(0, 300)}`
        );
      }

      if (!data.success) {
        throw new Error(
          data.error || 'Aadhaar verification failed.'
        );
      }

      setVerified(true);
      setStatusMessage(
        'Age verified (18+). Checkout unlocked.'
      );
    } catch (error: unknown) {
      console.error(
        '[ZeroAssert] Verification request failed:',
        error
      );

      if (
        error instanceof TypeError &&
        error.message === 'Failed to fetch'
      ) {
        setError(
          'Cannot reach the ZeroAssert verification API. ' +
          'The browser could not establish the connection to ' +
          window.location.origin +
          apiUrl +
          '.'
        );
      } else {
        setError(
          error instanceof Error
            ? error.message
            : 'Verification failed.'
        );
      }

      setStatusMessage('');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  }

  function reset() {
    setVerified(false);
    setError('');
    setStatusMessage('');
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F9FAFB',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: '#FFFFFF',
          borderRadius: '16px',
          padding: '32px',
          boxShadow:
            '0 10px 30px rgba(0,0,0,0.06)',
        }}
      >
        <h1
          style={{
            textAlign: 'center',
            fontSize: '24px',
            fontWeight: 700,
            marginBottom: '24px',
          }}
        >
          Age Verification Gateway
        </h1>

        <div
          style={{
            display: 'flex',
            gap: '4px',
            background: '#F3F4F6',
            padding: '4px',
            borderRadius: '8px',
            marginBottom: '24px',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode('ephemeral');
              reset();
            }}
            style={{
              flex: 1,
              padding: '10px',
              border: 0,
              borderRadius: '6px',
              background:
                mode === 'ephemeral'
                  ? '#2563EB'
                  : 'transparent',
              color:
                mode === 'ephemeral'
                  ? '#FFFFFF'
                  : '#4B5563',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Server Ephemeral
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('nova');
              reset();
            }}
            style={{
              flex: 1,
              padding: '10px',
              border: 0,
              borderRadius: '6px',
              background:
                mode === 'nova'
                  ? '#2563EB'
                  : 'transparent',
              color:
                mode === 'nova'
                  ? '#FFFFFF'
                  : '#4B5563',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Client Nova
          </button>
        </div>

        {verified ? (
          <div
            style={{
              padding: '24px',
              background: '#ECFDF5',
              border:
                '1px solid #A7F3D0',
              borderRadius: '12px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '32px',
                marginBottom: '8px',
              }}
            >
              ✅
            </div>

            <h2
              style={{
                color: '#065F46',
                fontSize: '18px',
              }}
            >
              Age Verified — 18+
            </h2>

            <p
              style={{
                color: '#047857',
                fontSize: '14px',
              }}
            >
              {statusMessage}
            </p>

            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: '12px',
                padding: '10px 16px',
                border: 0,
                borderRadius: '8px',
                background: '#065F46',
                color: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              Verify another document
            </button>
          </div>
        ) : mode === 'nova' ? (
          <NovaScanner
            onVerified={(proof: unknown) => {
              console.log(
                '[ZeroAssert] Nova proof:',
                proof
              );

              setVerified(true);
              setStatusMessage(
                'Proof generated locally via Nova.'
              );
            }}
          />
        ) : (
          <div>
            <p
              style={{
                textAlign: 'center',
                color: '#4B5563',
                fontSize: '14px',
                lineHeight: 1.5,
                marginBottom: '20px',
              }}
            >
              Upload an Aadhaar QR image for
              ephemeral verification.
            </p>

            {error && (
              <div
                style={{
                  background: '#FEF2F2',
                  border:
                    '1px solid #FECACA',
                  color: '#B91C1C',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                  fontSize: '13px',
                  overflowWrap: 'break-word',
                }}
              >
                {error}
              </div>
            )}

            <label
              style={{
                display: 'block',
                padding: '24px',
                border:
                  '2px dashed #D1D5DB',
                borderRadius: '12px',
                textAlign: 'center',
                cursor: loading
                  ? 'not-allowed'
                  : 'pointer',
              }}
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={
                  handleEphemeralUpload
                }
                disabled={loading}
                style={{
                  display: 'none',
                }}
              />

              <div
                style={{
                  fontSize: '32px',
                  marginBottom: '8px',
                }}
              >
                📄
              </div>

              <div
                style={{
                  fontWeight: 600,
                  color: '#111827',
                }}
              >
                {loading
                  ? 'Connecting...'
                  : 'Choose Aadhaar Image'}
              </div>

              <div
                style={{
                  fontSize: '12px',
                  color: '#6B7280',
                  marginTop: '5px',
                }}
              >
                PNG, JPG or WebP · Maximum 10 MB
              </div>
            </label>

            {loading && (
              <div
                style={{
                  marginTop: '16px',
                  textAlign: 'center',
                  color: '#2563EB',
                  fontSize: '13px',
                }}
              >
                ⏳ {statusMessage}
              </div>
            )}

            <div
              style={{
                marginTop: '20px',
                padding: '10px',
                background: '#F3F4F6',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#6B7280',
                wordBreak: 'break-all',
              }}
            >
              API:
              <br />
              {typeof window !== 'undefined'
                ? window.location.origin
                : ''}
              {apiUrl}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
