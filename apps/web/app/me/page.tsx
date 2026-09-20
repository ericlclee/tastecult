'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSession } from '../session';
import { useTRPC } from '../trpc';
import { VisitFeed } from '../visit-feed';

// Unstyled on purpose — a working list of your logs to replace with the real design.
export default function MyLogsPage() {
  const trpc = useTRPC();
  const { session, ready } = useSession();
  const me = useQuery(trpc.user.me.queryOptions(undefined, { enabled: Boolean(session) }));
  const visits = useInfiniteQuery(
    trpc.visit.mine.infiniteQueryOptions(
      { limit: 20 },
      { enabled: Boolean(me.data?.profile), getNextPageParam: (page) => page.nextCursor },
    ),
  );

  // Settings is where you sign in or out (the account page)
  const header = (
    <div className="flex items-center justify-between">
      <h1>Profile</h1>
      <Link href="/sign-in">Settings</Link>
    </div>
  );

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
        {header}
        <p>
          <Link href="/sign-in">Sign in</Link> to see your logs.
        </p>
      </main>
    );
  }

  if (me.isSuccess && !me.data.profile) {
    return (
      <main>
        {header}
        <p>
          Nothing logged yet. <Link href="/log">Log your first visit</Link>.
        </p>
      </main>
    );
  }

  return (
    <main>
      {header}
      {me.data?.profile ? (
        <p>
          <Link href={`/u/${me.data.profile.username}`}>Your public profile</Link>
        </p>
      ) : null}

      {me.isError ? <p role="alert">Couldn&apos;t load your profile: {me.error.message}</p> : null}

      <VisitFeed
        pages={visits.data?.pages}
        status={visits.status}
        error={visits.error?.message ?? null}
        hasNextPage={visits.hasNextPage}
        isFetchingNextPage={visits.isFetchingNextPage}
        onLoadMore={() => void visits.fetchNextPage()}
        on="mine"
        emptyMessage={
          <>
            Nothing logged yet. <Link href="/log">Log your first visit</Link>.
          </>
        }
      />
    </main>
  );
}
