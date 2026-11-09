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
    setStatusText('Processing high-density matrix...');

    try {
      const imageBitmap = await createImageBitmap(file);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      let width = imageBitmap.width;
      let height = imageBitmap.height;

      // Preserve more pixels for dense matrices (bumped from 1200 to 2000)
      const maxDim = 2000;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      // 1. ADD VIRTUAL QUIET ZONE
      // Inject a 120px pure white border around the image so finder patterns don't touch the edge
      const pad = 120;
      canvas.width = width + (pad * 2);
      canvas.height = height + (pad * 2);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(imageBitmap, pad, pad, width, height);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      setStatusText('Scanning padded QR matrix...');
      setProgress(35);

      // PASS 1: Standard read on padded, high-res image
      let code = jsQR(imgData.data, imgData.width, imgData.height, {
        inversionAttempts: 'attemptBoth',
      });

      // PASS 2: Aggressive Binary Thresholding
      // Fixes camera glare and shadows by forcing pixels to absolute black or white
      if (!code) {
        setStatusText('Applying binary thresholding...');
        setProgress(40);
        
        const thresholdData = new Uint8ClampedArray(imgData.data.length);
        for (let i = 0; i < imgData.data.length; i += 4) {
          // Standard grayscale luminance formula
          const lum = (imgData.data[i] * 0.299) + (imgData.data[i + 1] * 0.587) + (imgData.data[i + 2] * 0.114);
          // Hard threshold at 128
          const val = lum < 128 ? 0 : 255;
          
          thresholdData[i] = val;     // R
          thresholdData[i + 1] = val; // G
          thresholdData[i + 2] = val; // B
          thresholdData[i + 3] = 255; // Alpha
        }
        
        code = jsQR(thresholdData, imgData.width, imgData.height, {
          inversionAttempts: 'attemptBoth',
        });
      }

      if (!code || !code.data) {
        throw new Error('No QR code detected. Ensure all four corners are visible and glare-free.');
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

      <input 
        type="file" 
        accept="image/*" 
        ref={fileInputRef}
        onChange={(e) => processImageFile(e.target.files?.[0])}
        style={{ display: 'none' }}
      />

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
