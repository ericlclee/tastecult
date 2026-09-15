'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '../session';
import { useTRPC } from '../trpc';
import { LogForm } from './log-form';
import { ProfileSetup } from './profile-setup';

// Unstyled on purpose: a working version of the logging flow, to replace with the real design.
export default function LogPage() {
  const trpc = useTRPC();
  const { session, ready } = useSession();
  const me = useQuery(trpc.user.me.queryOptions(undefined, { enabled: Boolean(session) }));
  // Bumping the key remounts the form, clearing it for the next dish
  const [formKey, setFormKey] = useState(0);

  if (!ready) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main>
        <h1>Log a dish</h1>
        <p>
          <Link href="/sign-in">Sign in</Link> to log a dish.
        </p>
      </main>
    );
  }

  if (me.isError) {
    return (
      <main>
        <h1>Log a dish</h1>
        <p role="alert">Couldn&apos;t load your profile: {me.error.message}</p>
      </main>
    );
  }

  if (!me.data) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  if (!me.data.profile) {
    return (
      <main>
        <h1>Log a dish</h1>
        <ProfileSetup email={me.data.email} />
      </main>
    );
  }

  return <LogForm key={formKey} onLogAnother={() => setFormKey((key) => key + 1)} />;
}
