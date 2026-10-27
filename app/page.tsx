"use client";

import { AnonAadhaarProvider, LogInWithAnonAadhaar } from "@anon-aadhaar/react";

export default function Home() {
  return (
    // We set _useTestAadhaar to true so we can test the circuit without a real ID
    <AnonAadhaarProvider _useTestAadhaar={true}>
      <main style={{ maxWidth: '600px', margin: '0 auto', padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
        
        <h1 style={{ fontSize: '24px', borderBottom: '2px solid #000', paddingBottom: '10px' }}>
          ZeroAssert Identity Engine
        </h1>
        
        <p style={{ color: '#555', marginBottom: '30px' }}>
          Verify your merchant identity via Zero-Knowledge Proofs. Zero raw PII is stored.
        </p>

        {/* This component automatically loads the Wasm circuits and renders the UI */}
        <div style={{ padding: '20px', border: '1px solid #eaeaea', borderRadius: '8px', background: '#fafafa' }}>
          <LogInWithAnonAadhaar nullifierSeed={1234} />
        </div>

        {/* Your requested Privacy Policy Button */}
        <div style={{ marginTop: '40px', textAlign: 'center' }}>
          <a 
            href="/privacy" 
            target="_blank" 
            style={{ color: '#005bd3', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}
          >
            Read our Zero-Liability Privacy Policy
          </a>
        </div>

      </main>
    </AnonAadhaarProvider>
  );
}
