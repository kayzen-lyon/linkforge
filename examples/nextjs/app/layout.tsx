import type { ReactNode } from 'react';

import { ogImageUrl } from '@omnillink/react';

const baseUrl = process.env.OMNILLINK_URL ?? 'https://omnillink.kayzen-lyon.com';

export const metadata = {
  title: 'Omnillink + Next.js',
  // A social card built from text by the instance: a URL, computed on the server, no request made here.
  openGraph: { images: [{ url: ogImageUrl(baseUrl, { title: 'Omnillink + Next.js', site: 'Example', template: 'gradient' }), width: 1200, height: 630 }] },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
