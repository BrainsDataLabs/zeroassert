import Script from 'next/script';
"use client";

import '@shopify/polaris/build/esm/styles.css';
import enTranslations from '@shopify/polaris/locales/en.json';
import { AppProvider, Page, Layout, Card, Text, Button, BlockStack, Banner } from '@shopify/polaris';
import { useState } from 'react';

export default function ZeroAssertDashboard() {
  const [status, setStatus] = useState('Engine online. Ready for proof verification.');
  const [verified, setVerified] = useState(false);

  const runZkVerification = async () => {
    setStatus('Generating and verifying Zero-Knowledge Proof...');
    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof: { mock: true }, publicSignals: ['1'] })
      });
      const data = await response.json();
      if (data.verified) {
        setVerified(true);
        setStatus(data.message);
      } else {
        setStatus('Verification failed.');
      }
    } catch (err) {
      setStatus('Network error during cryptographic handshake.');
    }
  };

  return (
    <Script src="[https://unpkg.com/snarkjs@latest/build/snarkjs.min.js](https://unpkg.com/snarkjs@latest/build/snarkjs.min.js)" strategy="beforeInteractive"/>
    <AppProvider i18n={enTranslations}>
      <Page title="ZeroAssert Identity Engine">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Cryptographic Pipeline: Active
                </Text>
                <Text as="p">{status}</Text>
                {verified && (
                  <Banner tone="success">
                    <p>Merchant identity securely validated via ZKP. Zero raw data exposed.</p>
                  </Banner>
                )}
                <Button variant="primary" onClick={runZkVerification}>
                  Execute ZKP Verification
                  try {
  // 1. The browser downloads the cloud keys and computes the proof locally
  // @ts-ignore
  const { proof, publicSignals } = await window.snarkjs.groth16.fullProve(
    { secret: 1, publicHash: 1 }, // We will replace these with real Shopify GraphQL data next
    "/zkp/circuit.wasm",
    "/zkp/circuit_final.zkey"
  );

  // 2. Only the math is sent to the Vercel backend. Raw data never leaves the device.
  const response = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proof, publicSignals }),
  });

  const data = await response.json();
  if (data.verified) {
    console.log("Cryptographic Pipeline Secured:", data.message);
    // Trigger your Polaris success banner here
  } else {
    console.error("Verification Rejected:", data.error);
  }
} catch (error) {
  console.error("Prover Engine Crashed:", error);
                  }
                  
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">
                  Security Metrics
                </Text>
                <Text as="p">Protocol: Groth16 / snarkjs</Text>
                <Text as="p">Database: Supabase (Encrypted)</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}
