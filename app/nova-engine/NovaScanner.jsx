// app/nova-engine/NovaScanner.jsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';

export default function NovaScanner({ onVerified }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  
  const workerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    // Initialize Web Worker
    workerRef.current = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    workerRef.current.onmessage = (event) => {
      const { progress, status, success, proof, error } = event.data;
      if (progress !== undefined) setProgress(progress);
      if (status) setStatusText(status);

      if (success) {
        setLoading(false);
        onVerified(proof);
      } else if (error) {
        setError(error);
        setLoading(false);
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, [onVerified]);

  const handleImageCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setLoading(true);
    setProgress(10);
    setStatusText('Processing captured image frame...');

    try {
      // Create image bitmap or element to extract pixels for ZXing browser reader
      const reader = new BrowserQRCodeReader();
      const imageUrl = URL.createObjectURL(file);
      
      setStatusText('Scanning QR matrix on client device...');
      setProgress(30);

      const result = await reader.decodeFromImageUrl(imageUrl);
      
      if (result) {
        const rawText = result.getText();
        setStatusText('QR successfully decoded! Generating ZK proof...');
        setProgress(50);

        // Hand off payload to Web Worker for client-side proving
        workerRef.current.postMessage({ qrData: rawText });
      } else {
        throw new Error('No QR code detected in the captured photo.');
      }
    } catch (err) {
      console.error(err);
      setError('Could not read QR code from photo. Ensure the QR code is clearly visible and well-lit.');
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', padding: '1.5rem', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
      <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem', textAlign: 'center' }}>
        Nova Client-Side Verifier
      </h3>

      {error && (
        <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Hidden native file input with environment camera capture hook */}
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" 
        ref={fileInputRef}
        onChange={handleImageCapture}
        style={{ display: 'none' }}
      />

      {!loading ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ width: '100%', background: '#2563EB', color: '#fff', padding: '0.75rem', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer' }}
        >
          📷 Open Camera & Snap QR Code
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'center' }}>
          <div style={{ padding: '1rem', background: '#F3F4F6', borderRadius: '8px', fontSize: '0.9rem', color: '#374151' }}>
            {statusText}
          </div>
          
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.3rem', color: '#4B5563' }}>
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div style={{ width: '100%', background: '#E5E7EB', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, background: '#2563EB', height: '100%', transition: 'width 0.3s ease' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
