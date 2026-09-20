import type { ReactNode } from 'react';
import './globals.css';
import { DesignPanel } from './design-panel';
import { DevInspector } from './dev-inspector';
import { fontVariables } from './fonts';
import { Providers } from './providers';
import { SiteNav } from './site-nav';

export const metadata = { title: 'TasteCult' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <Providers>
          {/* Mobile-first: a phone-width column (430px ≈ a large phone), centred on wider screens */}
          {/* No bottom padding, so the menu bar sits flush with the bottom of the screen */}
          <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center px-4 pt-4 text-center *:w-full [&_img]:mx-auto">
            {children}
            <SiteNav />
          </div>
          {/* Design tools live outside the app column and only in development */}
          {process.env.NODE_ENV === 'development' ? (
            <>
              <DesignPanel />
              <DevInspector />
            </>
          ) : null}
        </Providers>
      </body>
    </html>
  );
}
