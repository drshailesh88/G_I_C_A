import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'GEM India — Conference Management Platform',
  description: 'Manage medical conferences end-to-end: registrations, programs, travel, accommodation, certificates, and communications.',
};

// viewport-fit=cover enables safe-area env() values on notched devices.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">
        <ClerkProvider>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
