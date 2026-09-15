'use client';

import Link from 'next/link';
import { useSession } from './session';

// The one menu on every page: a bottom bar across the column, like a phone app's tab bar.
export function SiteNav() {
  const { session, ready } = useSession();

  const items = [
    { href: '/explore', label: 'Explore' },
    { href: '/feed', label: 'Feed' },
    { href: '/log', label: 'Log a dish' },
    { href: '/me', label: 'My logs' },
    // Blank until the session is known, so it doesn't flash "Sign in" for signed-in people
    { href: '/sign-in', label: ready ? (session ? 'Account' : 'Sign in') : '\u00a0' },
  ];

  return (
    // Stays at the bottom of the screen while the page scrolls; white so content passes under it
    <nav className="sticky bottom-0 mt-auto flex w-full bg-white">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="flex-1 py-3 text-center">
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
