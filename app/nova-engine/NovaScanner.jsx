// app/nova-engine/NovaScanner.jsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  GlobalHistogramBinarizer,
} from '@zxing/library';

export default function NovaScanner({ onVerified }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  
  const workerRef = useRef(null);
  const fileInputRef = useRef(null);
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

  // Client-side robust multi-pass ZXing decoder
  const decodeCanvasBitmap = (ctx, width, height) => {
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      const len = width * height;
      const luminances = new Uint8ClampedArray(len);

      for (let i = 0; i < len; i++) {
        const offset = i * 4;
        luminances[i] = (data[offset] * 77 + data[offset + 1] * 150 + data[offset + 2] * 29) >> 8;
      }

      const luminanceSource = new RGBLuminanceSource(luminances, width, height);
      const reader = new MultiFormatReader();
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      reader.setHints(hints);

      // Pass 1: HybridBinarizer
      try {
        const bitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
        return reader.decode(bitmap).getText();
      } catch {}

      // Pass 2: GlobalHistogramBinarizer (handles camera shadows and glare)
      try {
        const bitmap = new BinaryBitmap(new GlobalHistogramBinarizer(luminanceSource));
        return reader.decode(bitmap).getText();
      } catch {}

      return null;
    } catch {
      return null;
    }
  };

  const handleImageCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setLoading(true);
    setProgress(15);
    setStatusText('Loading photo into browser memory...');

    try {
      const imageBitmap = await createImageBitmap(file);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      // Normalize dimensions (cap max dimension at 2000px for optimal matrix decoding density)
      let width = imageBitmap.width;
      let height = imageBitmap.height;
      const maxDim = Math.max(width, height);
      if (maxDim > 2000) {
        const scale = 2000 / maxDim;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(imageBitmap, 0, 0, width, height);

      setStatusText('Scanning high-density QR matrix...');
      setProgress(35);

      // Pass A: Standard decode
      let qrText = decodeCanvasBitmap(ctx, width, height);

      // Pass B: Quiet zone padding (if cropped tightly)
      if (!qrText) {
        setStatusText('Applying virtual border padding...');
        const paddedCanvas = document.createElement('canvas');
        paddedCanvas.width = width + 120;
        paddedCanvas.height = height + 120;
        const pCtx = paddedCanvas.getContext('2d');
        pCtx.fillStyle = '#FFFFFF';
        pCtx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
        pCtx.drawImage(canvas, 60, 60);

        qrText = decodeCanvasBitmap(pCtx, paddedCanvas.width, paddedCanvas.height);
      }

      if (!qrText) {
        throw new Error('No QR code detected. Ensure all four corners of the QR code are fully visible.');
      }

      setStatusText('QR successfully decoded! Generating ZK proof...');
      setProgress(50);

      // Hand off payload to Web Worker for client-side proving
      workerRef.current.postMessage({ qrData: qrText });

    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not read QR code. Ensure good lighting and frame the QR code clearly.');
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

      {/* Hidden canvas used for pixel manipulation */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

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
