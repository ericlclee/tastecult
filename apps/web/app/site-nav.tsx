'use client';

import Link from 'next/link';
import { useSession } from './session';

// Unstyled on purpose — the one menu shown on every page, to replace with the real design.
export function SiteNav() {
  const { session, ready } = useSession();

  return (
    <nav>
      <Link href="/explore">Explore</Link> · <Link href="/feed">Feed</Link> ·{' '}
      <Link href="/log">Log a dish</Link> · <Link href="/me">My logs</Link> ·{' '}
      {/* Hidden until the session is known, so it doesn't flash "Sign in" for signed-in people */}
      {ready ? <Link href="/sign-in">{session ? 'Account' : 'Sign in'}</Link> : null}
    </nav>
  );
}
