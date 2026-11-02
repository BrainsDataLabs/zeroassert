'use client';

import { useState, useEffect, useRef } from 'react';
import { processAadhaarArgs } from '@anon-aadhaar/core';

export const dynamic = 'force-dynamic';

export default function CheckoutVerificationGate() {
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const workerRef = useRef<Worker | null>(null);
  const checkoutId = "chk_live_session_9823";
  const shopDomain = "standalone-test.myshopify.com";

  // Clean up worker on unmount to free RAM immediately
  useEffect(() => {
    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setErrorMsg(null);
    setStatusText('Extracting Secure QR data...');

    try {
      // 1. Read the image file and extract Aadhaar arguments (No heavy ZKP math yet)
      const inputData = await file.text(); // Assuming Secure XML, or you can use a QR parser here
      
      // Note: In a production build, you use `@anon-aadhaar/core` utility `processAadhaarArgs` 
      // on the raw QR string. We assume you have the raw text/QR string extracted here.
      const circuitInputs = await processAadhaarArgs(inputData, false); 

      setStatusText('Initiating low-memory prover. This may take 60-120 seconds...');
      
      // 2. Initialize the isolated worker
      workerRef.current = new Worker('/low-mem-prover.worker.js');
      
      workerRef.current.onmessage = async (e) => {
        const { status, proof, publicSignals, error } = e.data;
        
        if (status === 'generating_proof') {
          setStatusText('Computing cryptographic math safely...');
        } else if (status === 'success') {
          setStatusText('Proof generated! Syncing with server...');
          workerRef.current?.terminate(); // Free memory immediately
          await syncZkpProof(proof, publicSignals);
        } else if (status === 'error') {
          setErrorMsg(error);
          setLoading(false);
          workerRef.current?.terminate();
        }
      };

      // 3. Pass URLs to trigger chunked streaming
      workerRef.current.postMessage({
        input: circuitInputs,
        wasmUrl: 'https://anon-aadhaar-artifacts.s3.eu-west-1.amazonaws.com/v2.0.0/aadhaar-verifier.wasm',
        zkeyUrl: 'https://anon-aadhaar-artifacts.s3.eu-west-1.amazonaws.com/v2.0.0/circuit_final.zkey'
      });

    } catch (err: any) {
      setErrorMsg('Failed to read QR file: ' + err.message);
      setLoading(false);
    }
  };

  const syncZkpProof = async (proof: any, publicSignals: any) => {
    try {
      const res = await fetch('/api/zkp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkout_id: checkoutId,
          age_verified: true, // You would pass proof/signals for backend validation here
          shop_domain: shopDomain
        }),
      });
      const data = await res.json();
      if (data.success && data.age_verified) {
        setIsVerified(true);
      } else {
        setErrorMsg(data.error || 'Backend verification failed.');
      }
    } catch {
      setErrorMsg('Network error syncing proof.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: '100dvh', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ maxWidth: '400px', width: '100%', backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        
        <h2 style={{ fontSize: '18px', fontWeight: '700', textAlign: 'center', marginBottom: '16px' }}>
          Age Verification Required
        </h2>

        {errorMsg && (
          <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', fontSize: '12px', padding: '8px', borderRadius: '8px', marginBottom: '14px' }}>
            {errorMsg}
          </div>
        )}

        {!isVerified ? (
          <div style={{ padding: '16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', textAlign: 'center' }}>
            
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
              Upload your official e-Aadhaar QR or ZIP file.
            </p>

            <input 
              type="file" 
              accept=".zip,.xml,image/*" 
              onChange={handleFileUpload}
              disabled={loading}
              style={{ fontSize: '12px', width: '100%', marginBottom: '10px' }}
            />

            {loading && (
              <div style={{ marginTop: '10px' }}>
                <p style={{ fontSize: '12px', color: '#4f46e5', fontWeight: '600' }}>{statusText}</p>
                <div style={{ width: '100%', height: '4px', backgroundColor: '#e0e7ff', borderRadius: '2px', overflow: 'hidden', marginTop: '6px' }}>
                   <div style={{ width: '50%', height: '100%', backgroundColor: '#4f46e5', animation: 'pulse 2s infinite' }} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ backgroundColor: '#f0fdf4', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', fontWeight: '600', color: '#166534' }}>✅ Age Verified (18+)</p>
          </div>
        )}
      </div>
    </main>
  );
}
