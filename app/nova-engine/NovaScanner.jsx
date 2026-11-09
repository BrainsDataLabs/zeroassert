// nova-engine/NovaScanner.jsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';

export default function NovaScanner({ onVerified }) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  
  const videoRef = useRef(null);
  const codeReader = useRef(new BrowserQRCodeReader());
  const workerRef = useRef(null);

  useEffect(() => {
    // Initialize Web Worker
    workerRef.current = new Worker(new URL('./worker.js', import.meta.url));
    workerRef.current.onmessage = (event) => {
      const { progress, status, success, proof, error } = event.data;
      if (progress) setProgress(progress);
      if (status) setStatusText(status);

      if (success) {
        setScanning(false);
        onVerified(proof);
      } else if (error) {
        setError(error);
        setScanning(false);
      }
    };

    return () => {
      workerRef.current?.terminate();
      codeReader.current.reset();
    };
  }, [onVerified]);

  const startPhysicalScan = async () => {
    setError('');
    setScanning(true);
    setProgress(5);
    setStatusText('Initializing camera stream...');

    try {
      const videoInputDevices = await BrowserQRCodeReader.listVideoInputDevices();
      const activeDeviceId = videoInputDevices[0]?.deviceId;

      // Decode continuously from physical camera stream
      await codeReader.current.decodeFromVideoDevice(
        activeDeviceId,
        videoRef.current,
        (result, err) => {
          if (result) {
            const rawText = result.getText();
            codeReader.current.reset();
            
            // Hand off raw QR payload to Worker for Nova ZKP proving
            setStatusText('QR detected! Spawning browser prover...');
            workerRef.current.postMessage({ qrData: rawText });
          }
        }
      );
    } catch (err) {
      setError('Camera access denied or hardware unavailable.');
      setScanning(false);
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

      {!scanning ? (
        <button
          onClick={startPhysicalScan}
          style={{ width: '100%', background: '#2563EB', color: '#fff', padding: '0.75rem', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer' }}
        >
          Scan Physical Card (Camera)
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <video ref={videoRef} style={{ width: '100%', height: '220px', background: '#000', borderRadius: '8px', objectFit: 'cover' }} />
          
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.3rem', color: '#4B5563' }}>
              <span>{statusText}</span>
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
