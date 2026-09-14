'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useSession } from '../session';
import { getSupabase, isSupabaseConfigured } from '../supabase';

// Unstyled on purpose — a working sign-in to replace with the real design.
export default function SignInPage() {
  const { session, ready } = useSession();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function sendLink(event: FormEvent) {
    event.preventDefault();
    setStatus('sending');
    setError(null);
    const { error: sendError } = await getSupabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/log` },
    });
    if (sendError) {
      setError(sendError.message);
      setStatus('idle');
      return;
    }
    setStatus('sent');
  }

  async function signOut() {
    const { error: signOutError } = await getSupabase().auth.signOut();
    if (signOutError) setError(signOutError.message);
  }

  if (!isSupabaseConfigured) {
    return (
      <main>
        <h1>Sign in</h1>
        <p>
          Sign-in isn&apos;t set up yet: add NEXT_PUBLIC_SUPABASE_URL and
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the environment.
        </p>
      </main>
    );
  }

  if (!ready) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  if (session) {
    return (
      <main>
        <h1>Signed in</h1>
        <p>You&apos;re signed in as {session.user.email}.</p>
        <p>
          <Link href="/log">Log a dish</Link> · <Link href="/me">My logs</Link>
        </p>
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
        {error ? <p role="alert">Couldn&apos;t sign out: {error}</p> : null}
      </main>
    );
  }

  return (
    <main>
      <h1>Sign in</h1>
      {status === 'sent' ? (
        <p>
          Check {email.trim()} for a sign-in link. Opening it signs you in and takes you to logging
          a dish.
        </p>
      ) : (
        <form onSubmit={(event) => void sendLink(event)}>
          <label htmlFor="email">Email</label>{' '}
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />{' '}
          <button type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>
      )}
      {error ? <p role="alert">Couldn&apos;t send the link: {error}</p> : null}
      <p>
        <Link href="/">Home</Link>
      </p>
    </main>
  );
}
