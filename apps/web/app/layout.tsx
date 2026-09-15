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
          {/* Mobile-first: a phone-width column (430px ≈ a large phone), centred on wider screens */}
          <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center p-4 text-center *:w-full [&_img]:mx-auto">
            <SiteNav />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
