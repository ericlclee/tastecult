'use client';

import Link from 'next/link';

const ITEMS = [
  { href: '/explore', label: 'Explore' },
  { href: '/feed', label: 'Feed' },
  { href: '/log', label: 'Log a dish' },
  // Account settings (sign in / out) are reached from the Settings button on the profile
  { href: '/me', label: 'Profile' },
];

// The one menu on every page: a bottom bar across the column, like a phone app's tab bar.
export function SiteNav() {
  return (
    // Stays at the bottom of the screen while the page scrolls; white so content passes under it.
    // Each link is as wide as its text plus padding, and the leftover space is split evenly
    // between them, so the gaps between labels are all the same
    <nav className="sticky bottom-0 mt-auto flex w-full justify-between bg-white">
      {ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className="px-2 py-3 whitespace-nowrap">
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
