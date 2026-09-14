import type { ReactNode } from 'react';
import { Providers } from './providers';
import { SiteNav } from './site-nav';

export const metadata = { title: 'TasteCult' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <SiteNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
