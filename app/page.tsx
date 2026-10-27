"use client";
import { useEffect, useState } from "react";
import { AnonAadhaarProvider, LogInWithAnonAadhaar, useAnonAadhaar } from "@anon-aadhaar/react";

function VerificationLogic() {
  const [anonAadhaar] = useAnonAadhaar();
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (anonAadhaar.status === "logged-in") {
      setStatusMessage("Proof generated locally. Securing to vault...");
      
      // Extract the merchant's domain (Shopify or Standalone)
      const urlParams = new URLSearchParams(window.location.search);
      const shopDomain = urlParams.get('shop') || 'standalone-merchant';
      const orderId = urlParams.get('order') || 'test-order-999';
      fetch("/api/zkp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof: anonAadhaar.anonAadhaarProofs,
          shopDomain: shopDomain,
          orderId: orderId
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.verified) {
          setStatusMessage("✅ Merchant identity securely validated & locked in vault.");
        } else {
          setStatusMessage("❌ Vault rejected: " + data.error);
        }
      })
      .catch(() => setStatusMessage("❌ Network error connecting to vault."));
    }
  }, [anonAadhaar]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
      <LogInWithAnonAadhaar nullifierSeed={1234} />
      {statusMessage && (
        <div style={{ padding: '15px', background: '#e6ffe6', color: '#006600', borderRadius: '8px', fontWeight: 'bold', textAlign: 'center', border: '1px solid #00cc00' }}>
          {statusMessage}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    // We set _useTestAadhaar to true so you can test it right now with dummy data
    <AnonAadhaarProvider _useTestAadhaar={true}>
      <main style={{ maxWidth: '600px', margin: '0 auto', padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '24px', borderBottom: '2px solid #000', paddingBottom: '10px' }}>ZeroAssert Identity Engine</h1>
        <p style={{ color: '#555', marginBottom: '30px' }}>Verify your merchant identity via Zero-Knowledge Proofs. Zero raw PII is stored.</p>
        
        <div style={{ padding: '30px', border: '1px solid #eaeaea', borderRadius: '12px', background: '#fafafa', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
          <VerificationLogic />
        </div>

        <div style={{ marginTop: '40px', textAlign: 'center' }}>
          <a href="/privacy" target="_blank" style={{ color: '#005bd3', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>Read our Zero-Liability Privacy Policy</a>
        </div>
      </main>
    </AnonAadhaarProvider>
  );
}
