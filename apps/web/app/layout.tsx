import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';
import { SiteNav } from './site-nav';

export const metadata = { title: 'TasteCult' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="app">
            <SiteNav />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
