// app/nova-engine/NovaScanner.jsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';

export default function NovaScanner({ onVerified }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  
  const workerRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const canvasRef = useRef(null);

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

  const processImageFile = async (file) => {
    if (!file) return;

    setError('');
    setLoading(true);
    setProgress(15);
    setStatusText('Processing selected image...');

    try {
      const imageBitmap = await createImageBitmap(file);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      let width = imageBitmap.width;
      let height = imageBitmap.height;

      const maxDim = 1200;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(imageBitmap, 0, 0, width, height);

      const imgData = ctx.getImageData(0, 0, width, height);

      setStatusText('Scanning QR matrix...');
      setProgress(35);

      let code = jsQR(imgData.data, imgData.width, imgData.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (!code) {
        setStatusText('Optimizing image contrast...');
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          const enhanced = avg < 140 ? 0 : 255;
          data[i] = enhanced;
          data[i + 1] = enhanced;
          data[i + 2] = enhanced;
        }
        code = jsQR(data, imgData.width, imgData.height, {
          inversionAttempts: 'attemptBoth',
        });
      }

      if (!code || !code.data) {
        throw new Error('No QR code detected. Ensure all four corners are fully visible.');
      }

      setStatusText('QR decoded! Generating ZK proof...');
      setProgress(50);

      workerRef.current.postMessage({ qrData: code.data });

    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not read QR code from image.');
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

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Standard file picker */}
      <input 
        type="file" 
        accept="image/*" 
        ref={fileInputRef}
        onChange={(e) => processImageFile(e.target.files?.[0])}
        style={{ display: 'none' }}
      />

      {/* Native camera snapper */}
      <input 
        type="file" 
        accept="image/*" 
        capture="environment"
        ref={cameraInputRef}
        onChange={(e) => processImageFile(e.target.files?.[0])}
        style={{ display: 'none' }}
      />

      {!loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            onClick={() => cameraInputRef.current?.click()}
            style={{ width: '100%', background: '#2563EB', color: '#fff', padding: '0.75rem', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer' }}
          >
            📷 Snap Photo with Camera
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ width: '100%', background: '#4B5563', color: '#fff', padding: '0.75rem', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer' }}
          >
            📁 Upload from Gallery / Files
          </button>
        </div>
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
