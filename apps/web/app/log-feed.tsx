'use client';

import type { RouterOutputs } from '@tastecult/api-client';
import { isTier, tierLabel, TIERS } from '@tastecult/shared-types';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogSocial } from './log-social';

type LogItem = RouterOutputs['rating']['forDish']['items'][number];
type LogSummary = RouterOutputs['rating']['forDish']['summary'];

export interface LogFeedPage {
  items: LogItem[];
  summary?: LogSummary;
  limited?: boolean;
}

interface LogFeedProps {
  pages: LogFeedPage[] | undefined;
  status: 'pending' | 'error' | 'success';
  error: string | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  /** The page the feed sits on, so its own subject isn't repeated and linked on every log. */
  on: 'restaurant' | 'dish' | 'user' | 'feed';
  emptyMessage?: ReactNode;
}

// Unstyled on purpose — shared by explore pages, profiles and the feed.
export function LogFeed({
  pages,
  status,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  on,
  emptyMessage,
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

      {summary && summary.logCount > 0 ? (
        <>
          <p>
            {summary.logCount} {summary.logCount === 1 ? 'log' : 'logs'}
            {on === 'user'
              ? ''
              : ` from ${summary.peopleCount} ${summary.peopleCount === 1 ? 'person' : 'people'}`}
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
      ) : null}

      {items.length === 0 ? <p>{emptyMessage ?? 'No logs yet.'}</p> : null}

      <ul>
        {items.map((log) => {
          const { dish, restaurant, alias } = log.menuItem;
          const dishName = alias ?? dish.name;
          return (
            <li key={log.id}>
              {log.photoUrl ? (
                <img src={log.photoUrl} alt={`${dishName} at ${restaurant.name}`} width={240} />
              ) : null}
              <p>
                <strong>
                  {on === 'dish' ? (
                    dishName
                  ) : (
                    <Link href={`/explore/dish/${dish.id}`}>{dishName}</Link>
                  )}
                </strong>
                {alias ? ` (${dish.name})` : ''}
                {on === 'restaurant' ? null : (
                  <>
                    {' '}
                    at <Link href={`/explore/restaurant/${restaurant.id}`}>{restaurant.name}</Link>
                  </>
                )}
              </p>
              <p>
                {isTier(log.tier) ? tierLabel(log.tier) : log.tier} · {log.visitedAt}
                {on === 'user' ? null : (
                  <>
                    {' '}
                    · by{' '}
                    <Link href={`/u/${log.user.username}`}>
                      {log.user.displayName ?? log.user.username}
                    </Link>
                  </>
                )}
                {log.cuisine ? ` · ${log.cuisine.name}` : ''}
              </p>
              {log.note ? <p>{log.note}</p> : null}
              <LogSocial ratingId={log.id} social={log.social} />
            </li>
          );
        })}
      </ul>

      {limited && summary ? (
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
