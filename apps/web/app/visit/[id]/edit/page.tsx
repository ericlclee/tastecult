'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { DeleteVisitButton } from '../../../log/delete-visit-button';
import { VisitForm } from '../../../log/visit-form';
import { useSession } from '../../../session';
import { useTRPC } from '../../../trpc';

// Unstyled on purpose — editing one of your visits, to replace with the real design.
export default function EditVisitPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const trpc = useTRPC();
  const { session, ready } = useSession();
  const visit = useQuery(trpc.visit.mineById.queryOptions({ id }, { enabled: Boolean(session) }));

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
        <h1>Edit visit</h1>
        <p>
          <Link href="/sign-in">Sign in</Link> to edit your visits.
        </p>
      </main>
    );
  }

  if (visit.isError) {
    return (
      <main>
        <h1>Edit visit</h1>
        <p role="alert">
          {visit.error.data?.code === 'NOT_FOUND'
            ? "This visit doesn't exist, or isn't yours."
            : `Couldn't load this visit: ${visit.error.message}`}
        </p>
      </main>
    );
  }

  if (!visit.data) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    // Keyed so the form's fields are filled from this visit only once, not reset by refetches
    <VisitForm key={visit.data.id} existing={visit.data}>
      <p>
        <DeleteVisitButton id={visit.data.id} onDeleted={() => router.push('/me')} />
      </p>
    </VisitForm>
  );
}
