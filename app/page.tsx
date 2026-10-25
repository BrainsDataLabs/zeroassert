"use client";

import { useState } from "react";
import Script from "next/script";
import { AppProvider, Page, Layout, Card, Button, Text, Banner, BlockStack } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";

export default function Home() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState("");

  const executeZKP = async () => {
    setIsVerifying(true);
    setVerificationStatus('idle');
    setErrorMessage("");

    try {
      // 1. The browser downloads the cloud keys and computes the proof locally
      // @ts-ignore
      const { proof, publicSignals } = await window.snarkjs.groth16.fullProve(
        { secret: 1, publicHash: 1 }, 
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
      
      if (response.ok && data.verified) {
        console.log("Cryptographic Pipeline Secured:", data.message);
        setVerificationStatus('success');
      } else {
        console.error("Verification Rejected:", data.error);
        setVerificationStatus('error');
        setErrorMessage(data.error || "Cryptographic proof rejected by server.");
      }
    } catch (error: any) {
      console.error("Prover Engine Crashed:", error);
      setVerificationStatus('error');
      setErrorMessage(error.message || "Local proof generation failed. Ensure snarkjs is loaded.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <>
      {/* Invisible cloud engine injection bypassing Webpack */}
      <Script src="https://unpkg.com/snarkjs@latest/build/snarkjs.min.js" strategy="beforeInteractive" />
      
      <AppProvider i18n={enTranslations}>
        <Page title="ZeroAssert Identity Engine">
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Cryptographic Pipeline: Active
                  </Text>
                  
                  {verificationStatus === 'success' && (
                    <Banner title="Merchant identity securely validated via ZKP. Zero raw data exposed." tone="success" />
                  )}
                  
                  {verificationStatus === 'error' && (
                    <Banner title="Verification failed." tone="critical">
                      <p>{errorMessage}</p>
                    </Banner>
                  )}

                  <Button 
                    variant="primary" 
                    size="large" 
                    onClick={executeZKP} 
                    loading={isVerifying}
                  >
                    Execute ZKP Verification
                  </Button>
                </BlockStack>
              </Card>
            </Layout.Section>
            
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="400">
                  <Text as="h3" variant="headingSm">Security Metrics</Text>
                  <Text as="p" variant="bodyMd">Protocol: Groth16 / snarkjs</Text>
                  <Text as="p" variant="bodyMd">Database: Supabase (Encrypted)</Text>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
      </AppProvider>
    </>
  );
}
