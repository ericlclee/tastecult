import type { ReactNode } from 'react';
import './globals.css';
import { DevInspector } from './dev-inspector';
import { Providers } from './providers';
import { SiteNav } from './site-nav';

export const metadata = { title: 'TasteCult' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {/* Mobile-first: a phone-width column (430px ≈ a large phone), centred on wider screens */}
          {/* No bottom padding, so the menu bar sits flush with the bottom of the screen */}
          <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center px-4 pt-4 text-center *:w-full [&_img]:mx-auto">
            {children}
            <SiteNav />
          </div>
          {process.env.NODE_ENV === 'development' ? <DevInspector /> : null}
        </Providers>
      </body>
    </html>
  );
}
