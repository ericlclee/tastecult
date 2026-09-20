'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { VisitFeed } from '../visit-feed';
import { useSession } from '../session';
import { useTRPC } from '../trpc';

// Unstyled on purpose — a working feed to replace with the real design.
export default function FeedPage() {
  const trpc = useTRPC();
  const { session, ready } = useSession();
  const me = useQuery(trpc.user.me.queryOptions(undefined, { enabled: Boolean(session) }));
  const feed = useInfiniteQuery(
    trpc.visit.feed.infiniteQueryOptions(
      { limit: 20 },
      { enabled: Boolean(me.data?.profile), getNextPageParam: (page) => page.nextCursor },
    ),
  );

  if (!ready || (session && !me.data && !me.isError)) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main>
        <h1>Feed</h1>
        <p>
          <Link href="/sign-in">Sign in</Link> to see visits from people you follow.
        </p>
      </main>
    );
  }

  if (me.isError) {
    return (
      <main>
        <h1>Feed</h1>
        <p role="alert">Couldn&apos;t load your profile: {me.error.message}</p>
      </main>
    );
  }

  if (!me.data?.profile) {
    return (
      <main>
        <h1>Feed</h1>
        <p>
          <Link href="/log">Choose a username</Link> to start following people.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Feed</h1>
      <VisitFeed
        pages={feed.data?.pages}
        status={feed.status}
        error={feed.error?.message ?? null}
        hasNextPage={feed.hasNextPage}
        isFetchingNextPage={feed.isFetchingNextPage}
        onLoadMore={() => void feed.fetchNextPage()}
        on="feed"
        emptyMessage={
          <>
            Nothing here yet. Find people through their logs on <Link href="/explore">Explore</Link>{' '}
            and follow them.
          </>
        }
      />
    </main>
  );
}
