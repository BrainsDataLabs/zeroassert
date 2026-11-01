import type { Metadata } from 'next';

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
      <body style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
