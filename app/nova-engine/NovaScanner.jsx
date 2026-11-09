// app/nova-engine/NovaScanner.jsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';

export default function NovaScanner({ onVerified }) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' = rear, 'user' = front
  
  const videoRef = useRef(null);
  const codeReader = useRef(new BrowserQRCodeReader());
  const workerRef = useRef(null);

  useEffect(() => {
    // Check available devices to see if flip button should be shown
    BrowserQRCodeReader.listVideoInputDevices()
      .then((devices) => {
        if (devices.length > 1) setHasMultipleCameras(true);
      })
      .catch(() => {});

    // Initialize Web Worker
    workerRef.current = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    workerRef.current.onmessage = (event) => {
      const { progress, status, success, proof, error } = event.data;
      if (progress !== undefined) setProgress(progress);
      if (status) setStatusText(status);

      if (success) {
        setScanning(false);
        codeReader.current.reset();
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

  const startCameraScan = async (targetFacingMode = 'environment') => {
    setError('');
    setScanning(true);
    setProgress(5);
    setStatusText('Requesting camera permission...');

    try {
      codeReader.current.reset();

      // 1. Force native browser permission popup via standard getUserMedia
      const constraints = {
        video: { facingMode: targetFacingMode }
      };
      
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }

      setStatusText('Align QR code within frame...');
      setProgress(10);

      // 2. Decode from the active video stream element
      await codeReader.current.decodeFromStream(
        mediaStream,
        videoRef.current,
        (result) => {
          if (result) {
            const rawText = result.getText();
            codeReader.current.reset();
            
            // Stop media tracks
            mediaStream.getTracks().forEach(track => track.stop());

            setStatusText('QR captured! Generating ZK proof...');
            workerRef.current.postMessage({ qrData: rawText });
          }
        }
      );
    } catch (err) {
      console.error('Camera error:', err);
      if (window.location.protocol !== 'https:') {
        setError('Security Error: Camera requires an HTTPS connection.');
      } else {
        setError('Camera access denied. Please allow camera permissions in your browser settings.');
      }
      setScanning(false);
    }
  };

  const toggleCamera = () => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    codeReader.current.reset();
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject;
      stream.getTracks().forEach(track => track.stop());
    }
    startCameraScan(newMode);
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
          onClick={() => startCameraScan('environment')}
          style={{ width: '100%', background: '#2563EB', color: '#fff', padding: '0.75rem', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer' }}
        >
          Scan Physical Card (Camera)
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <video 
              ref={videoRef} 
              muted 
              playsInline 
              style={{ width: '100%', height: '240px', background: '#000', borderRadius: '8px', objectFit: 'cover' }} 
            />
            
            {hasMultipleCameras && (
              <button
                onClick={toggleCamera}
                style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                🔄 Flip Camera
              </button>
            )}
          </div>
          
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
