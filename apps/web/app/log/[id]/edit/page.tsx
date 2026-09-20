'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '../../../session';
import { useTRPC } from '../../../trpc';

/**
 * A dish is edited as part of the visit it belongs to, so this old per-log link
 * forwards to that visit's editor. Links to it exist in the wild and in bookmarks.
 */
export default function EditLogPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const trpc = useTRPC();
  const { session, ready } = useSession();
  const log = useQuery(trpc.rating.mineById.queryOptions({ id }, { enabled: Boolean(session) }));
  const visitId = log.data?.visitId;

  useEffect(() => {
    if (visitId) router.replace(`/visit/${visitId}/edit`);
  }, [visitId, router]);

  if (!ready || (session && log.isPending)) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main>
        <h1>Edit log</h1>
        <p>
          <Link href="/sign-in">Sign in</Link> to edit your logs.
        </p>
      </main>
    );
  }

  if (log.isError) {
    return (
      <main>
        <h1>Edit log</h1>
        <p role="alert">
          {log.error.data?.code === 'NOT_FOUND'
            ? "This log doesn't exist, or isn't yours."
            : `Couldn't load this log: ${log.error.message}`}
        </p>
      </main>
    );
  }

  return (
    <main>
      <p>Taking you to this visit…</p>
    </main>
  );
}
