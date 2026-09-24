import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'EMEFast | Emergency Medical Fast Response System',
  description: 'Emergency medical coordination, hospital intelligence and rapid response.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'EMEFast', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0B0D12', viewportFit: 'cover' };

import AppSplashProvider from '@/components/AppSplashProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: `(() => { try { const t=localStorage.getItem('emefast-theme'); const l=t==='light'; document.documentElement.classList.toggle('theme-light',l); document.documentElement.classList.toggle('theme-dark',!l); document.documentElement.setAttribute('data-theme', l ? 'light' : 'dark'); } catch(e) {} })()` }} />
      </head>
      <body>
        <AppSplashProvider>{children}</AppSplashProvider>
      </body>
    </html>
  );
}
