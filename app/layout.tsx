import type { Metadata } from 'next';
import { AnonAadhaarProvider } from '@anon-aadhaar/react';

export const metadata: Metadata = {
  title: 'ZeroAssert | Age Verification Gate',
  description: 'Cryptographic Zero-Knowledge Age Verification',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AnonAadhaarProvider useTestAadhaar={false}>
          {children}
        </AnonAadhaarProvider>
      </body>
    </html>
  );
}
