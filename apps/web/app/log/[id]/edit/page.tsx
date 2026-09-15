'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from '../../../session';
import { useTRPC } from '../../../trpc';
import { DeleteLogButton } from '../../delete-log-button';
import { LogForm } from '../../log-form';

// Unstyled on purpose — editing one of your logs, to replace with the real design.
export default function EditLogPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const trpc = useTRPC();
  const { session, ready } = useSession();
  const log = useQuery(trpc.rating.mineById.queryOptions({ id }, { enabled: Boolean(session) }));

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

  if (!log.data) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    // Keyed so the form's fields are filled from this log only once, not reset by refetches
    <LogForm key={log.data.id} existing={log.data}>
      <p>
        <DeleteLogButton id={log.data.id} onDeleted={() => router.push('/me')} />
      </p>
    </LogForm>
  );
}
