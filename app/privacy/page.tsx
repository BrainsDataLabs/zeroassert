export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: '1.6', color: '#333' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '10px' }}>Privacy Policy</h1>
      <p style={{ color: '#666', marginBottom: '40px' }}><strong>Last Updated: October 25, 2026</strong></p>

      <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px' }}>1. Data Collection</h2>
      <p style={{ marginBottom: '30px' }}>
        ZeroAssert Identity ("we", "our", or "us") operates on a strict zero-trust data model. We extract the Shopify <code>shop</code> domain strictly for the purpose of generating a one-time cryptographic hash. We do not collect names, email addresses, physical addresses, or any other Personal Identifiable Information (PII) during the identity verification process.
      </p>

      <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px' }}>2. Data Storage & Zero-Knowledge Architecture</h2>
      <p style={{ marginBottom: '30px' }}>
        We store <strong>zero</strong> raw PII. All merchant identities are converted into mathematical proofs locally on the user's device using the Groth16 cryptographic protocol before transmission. Our cloud infrastructure only retains cryptographic commitments and nullifier hashes, which are mathematically impossible to reverse-engineer into personal data.
      </p>

      <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px' }}>3. GDPR, CCPA, and CPRA Compliance</h2>
      <p style={{ marginBottom: '30px' }}>
        Because our architecture mathematically prevents the storage of raw PII, there is no merchant data to redact, export, or delete. We are natively compliant with major data protection regulations by design. Shopify's mandatory privacy webhooks are implemented and will instantly return successful resolutions, as no actionable PII exists on our servers.
      </p>

      <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px' }}>4. Contact Us</h2>
      <p>
        For any privacy-related inquiries, compliance verification, or cryptographic audits, please contact our security team at: <strong>brainsdatalabs@gmail.com</strong>
      </p>
    </div>
  );
}

