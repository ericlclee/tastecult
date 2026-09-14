'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { isTier, tierLabel } from '@tastecult/shared-types';
import Link from 'next/link';
import { useSession } from '../session';
import { useTRPC } from '../trpc';

// Unstyled on purpose — a working list of your logs to replace with the real design.
export default function MyLogsPage() {
  const trpc = useTRPC();
  const { session, ready } = useSession();
  const me = useQuery(trpc.user.me.queryOptions(undefined, { enabled: Boolean(session) }));
  const logs = useInfiniteQuery(
    trpc.rating.mine.infiniteQueryOptions(
      { limit: 20 },
      { enabled: Boolean(me.data?.profile), getNextPageParam: (page) => page.nextCursor },
    ),
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
        <h1>My logs</h1>
        <p>
          <Link href="/sign-in">Sign in</Link> to see your logs.
        </p>
      </main>
    );
  }

  if (me.isSuccess && !me.data.profile) {
    return (
      <main>
        <h1>My logs</h1>
        <p>
          Nothing logged yet. <Link href="/log">Log your first dish</Link>.
        </p>
      </main>
    );
  }

  const items = logs.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <main>
      <h1>My logs</h1>
      {me.data?.profile ? (
        <p>
          <Link href={`/u/${me.data.profile.username}`}>Your public profile</Link>
        </p>
      ) : null}

      {me.isError ? <p role="alert">Couldn&apos;t load your profile: {me.error.message}</p> : null}
      {logs.isError ? <p role="alert">Couldn&apos;t load your logs: {logs.error.message}</p> : null}
      {logs.isSuccess && items.length === 0 ? <p>Nothing logged yet.</p> : null}

      <ul>
        {items.map((log) => (
          <li key={log.id}>
            {log.photoUrl ? (
              <img
                src={log.photoUrl}
                alt={`${log.menuItem.dish.name} at ${log.menuItem.restaurant.name}`}
                width={240}
              />
            ) : null}
            <p>
              <strong>{log.menuItem.alias ?? log.menuItem.dish.name}</strong>
              {log.menuItem.alias ? ` (${log.menuItem.dish.name})` : ''}
              {log.menuItem.dish.status === 'PENDING' ? ' — dish awaiting approval' : ''}
            </p>
            <p>
              {log.menuItem.restaurant.name} · {isTier(log.tier) ? tierLabel(log.tier) : log.tier} ·{' '}
              {log.visitedAt}
              {log.cuisine ? ` · ${log.cuisine.name}` : ''}
            </p>
            {log.note ? <p>{log.note}</p> : null}
          </li>
        ))}
      </ul>

      {logs.hasNextPage ? (
        <button
          type="button"
          onClick={() => void logs.fetchNextPage()}
          disabled={logs.isFetchingNextPage}
        >
          {logs.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </main>
  );
}
