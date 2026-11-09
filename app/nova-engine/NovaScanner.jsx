// app/nova-engine/NovaScanner.jsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';

export default function NovaScanner({ onVerified }) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [devices, setDevices] = useState([]);
  const [activeDeviceIndex, setActiveDeviceIndex] = useState(0);
  
  const videoRef = useRef(null);
  const codeReader = useRef(new BrowserQRCodeReader());
  const workerRef = useRef(null);

  // Load available camera devices on mount
  useEffect(() => {
    BrowserQRCodeReader.listVideoInputDevices()
      .then((videoInputDevices) => {
        setDevices(videoInputDevices);
        // Prefer back-facing camera by default if available
        const backCameraIndex = videoInputDevices.findIndex(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('rear') || 
          d.label.toLowerCase().includes('environment')
        );
        if (backCameraIndex !== -1) {
          setActiveDeviceIndex(backCameraIndex);
        }
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

  const startScanning = useCallback(async (deviceIndex) => {
    setError('');
    setScanning(true);
    setProgress(5);
    setStatusText('Initializing camera stream...');

    try {
      codeReader.current.reset();
      const currentDevices = devices.length > 0 ? devices : await BrowserQRCodeReader.listVideoInputDevices();
      const targetDevice = currentDevices[deviceIndex] || currentDevices[0];
      const deviceId = targetDevice?.deviceId;

      await codeReader.current.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (result) => {
          if (result) {
            const rawText = result.getText();
            codeReader.current.reset();
            
            // Camera work is done! Hand off to worker for ZK proof generation
            setStatusText('QR captured! Generating ZK proof in background...');
            workerRef.current.postMessage({ qrData: rawText });
          }
        }
      );
    } catch (err) {
      setError('Camera access denied or device unavailable.');
      setScanning(false);
    }
  }, [devices]);

  const toggleCamera = () => {
    if (devices.length < 2) return;
    const nextIndex = (activeDeviceIndex + 1) % devices.length;
    setActiveDeviceIndex(nextIndex);
    codeReader.current.reset();
    startScanning(nextIndex);
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
          onClick={() => startScanning(activeDeviceIndex)}
          style={{ width: '100%', background: '#2563EB', color: '#fff', padding: '0.75rem', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer' }}
        >
          Scan Physical Card (Camera)
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <video ref={videoRef} style={{ width: '100%', height: '240px', background: '#000', borderRadius: '8px', objectFit: 'cover' }} />
            
            {devices.length > 1 && (
              <button
                onClick={toggleCamera}
                style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
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
