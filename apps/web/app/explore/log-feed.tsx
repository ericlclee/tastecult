'use client';

import type { RouterOutputs } from '@tastecult/api-client';
import { isTier, tierLabel, TIERS } from '@tastecult/shared-types';
import Link from 'next/link';

type LogsPage = RouterOutputs['rating']['forDish'];

interface LogFeedProps {
  pages: LogsPage[] | undefined;
  status: 'pending' | 'error' | 'success';
  error: string | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  /** Which page the feed sits on, so each log links to the *other* side. */
  on: 'restaurant' | 'dish';
}

// Unstyled on purpose — shared by the restaurant and dish pages.
export function LogFeed({
  pages,
  status,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  on,
}: LogFeedProps) {
  if (status === 'pending') return <p>Loading logs…</p>;
  if (status === 'error' || !pages?.[0]) {
    return <p role="alert">Couldn&apos;t load logs: {error ?? 'unknown error'}</p>;
  }

  const { summary, limited } = pages[0];
  const items = pages.flatMap((page) => page.items);

  return (
    <section>
      <h2>Logs</h2>

      {summary.logCount === 0 ? (
        <p>No logs yet.</p>
      ) : (
        <>
          <p>
            {summary.logCount} {summary.logCount === 1 ? 'log' : 'logs'} from {summary.peopleCount}{' '}
            {summary.peopleCount === 1 ? 'person' : 'people'}
          </p>
          <ul>
            {[...TIERS].reverse().map((tier) => (
              <li key={tier.value}>
                {tier.label}: {summary.tierCounts[tier.value]}
              </li>
            ))}
          </ul>
          <p>The breakdown counts each person&apos;s latest log of each menu item.</p>
        </>
      )}

      <ul>
        {items.map((log) => {
          const dishName = log.menuItem.alias ?? log.menuItem.dish.name;
          return (
            <li key={log.id}>
              {log.photoUrl ? (
                <img
                  src={log.photoUrl}
                  alt={`${dishName} at ${log.menuItem.restaurant.name}`}
                  width={240}
                />
              ) : null}
              <p>
                <strong>{dishName}</strong>
                {log.menuItem.alias ? ` (${log.menuItem.dish.name})` : ''}
                {on === 'dish' ? (
                  <>
                    {' '}
                    at{' '}
                    <Link href={`/explore/restaurant/${log.menuItem.restaurant.id}`}>
                      {log.menuItem.restaurant.name}
                    </Link>
                  </>
                ) : (
                  <>
                    {' '}
                    · <Link href={`/explore/dish/${log.menuItem.dish.id}`}>see this dish</Link>
                  </>
                )}
              </p>
              <p>
                {isTier(log.tier) ? tierLabel(log.tier) : log.tier} · {log.visitedAt} · by{' '}
                {log.user.displayName ?? log.user.username}
                {log.cuisine ? ` · ${log.cuisine.name}` : ''}
              </p>
              {log.note ? <p>{log.note}</p> : null}
            </li>
          );
        })}
      </ul>

      {limited ? (
        <p>
          Showing {items.length} of {summary.logCount} logs. <Link href="/sign-in">Sign in</Link> to
          see them all.
        </p>
      ) : null}

      {hasNextPage ? (
        <button type="button" onClick={onLoadMore} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </section>
  );
}
