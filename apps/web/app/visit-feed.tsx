'use client';

import type { RouterOutputs } from '@tastecult/api-client';
import { isTier, tierLabel } from '@tastecult/shared-types';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogSocial } from './log-social';

type VisitItem = RouterOutputs['visit']['feed']['items'][number];

export interface VisitFeedPage {
  items: VisitItem[];
  limited?: boolean;
}

interface VisitFeedProps {
  pages: VisitFeedPage[] | undefined;
  status: 'pending' | 'error' | 'success';
  error: string | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  /** The page the feed sits on, so its own subject isn't repeated on every visit. */
  on: 'user' | 'feed' | 'mine';
  emptyMessage?: ReactNode;
}

// Unstyled on purpose — shared by the feed, your own logs and public profiles.
// One entry per visit, with every dish eaten on it listed inside.
export function VisitFeed({
  pages,
  status,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  on,
  emptyMessage,
}: VisitFeedProps) {
  if (status === 'pending') return <p>Loading visits…</p>;
  if (status === 'error' || !pages?.[0]) {
    return <p role="alert">Couldn&apos;t load visits: {error ?? 'unknown error'}</p>;
  }

  const { limited } = pages[0];
  const items = pages.flatMap((page) => page.items);

  return (
    <section>
      <h2>Visits</h2>

      {items.length === 0 ? <p>{emptyMessage ?? 'No visits yet.'}</p> : null}

      <ul>
        {items.map((visit) => (
          <li key={visit.id}>
            <p>
              <strong>
                <Link href={`/explore/restaurant/${visit.restaurant.id}`}>
                  {visit.restaurant.name}
                </Link>
              </strong>{' '}
              · {visit.visitedAt}
              {on === 'feed' ? (
                <>
                  {' '}
                  · by{' '}
                  <Link href={`/u/${visit.user.username}`}>
                    {visit.user.displayName ?? visit.user.username}
                  </Link>
                </>
              ) : null}
            </p>

            {/* Photos of the visit as a whole; a dish's own photo shows with that dish */}
            {visit.photos
              .filter((photo) => photo.dishIndex === null)
              .map((photo) => (
                <img
                  key={photo.id}
                  src={photo.url}
                  alt={`A photo from ${visit.restaurant.name}`}
                  width={240}
                />
              ))}

            {visit.note ? <p>{visit.note}</p> : null}

            <ul>
              {visit.dishes.map((log) => {
                const { dish, alias } = log.menuItem;
                const dishName = alias ?? dish.name;
                return (
                  <li key={log.id}>
                    {log.photoUrl ? (
                      <img
                        src={log.photoUrl}
                        alt={`${dishName} at ${visit.restaurant.name}`}
                        width={240}
                      />
                    ) : null}
                    <p>
                      <strong>
                        <Link href={`/explore/dish/${dish.id}`}>{dishName}</Link>
                      </strong>
                      {alias ? ` (${dish.name})` : ''}
                      {dish.status === 'PENDING' ? ' — dish awaiting approval' : ''}
                    </p>
                    <p>
                      {isTier(log.tier) ? tierLabel(log.tier) : log.tier}
                      {log.cuisine ? ` · ${log.cuisine.name}` : ''}
                    </p>
                    {log.note ? <p>{log.note}</p> : null}
                    <LogSocial ratingId={log.id} social={log.social} />
                  </li>
                );
              })}
            </ul>

            {on === 'mine' ? (
              <p>
                <Link href={`/visit/${visit.id}/edit`}>Edit visit</Link>
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {limited ? (
        <p>
          Showing the most recent visits. <Link href="/sign-in">Sign in</Link> to see them all.
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
