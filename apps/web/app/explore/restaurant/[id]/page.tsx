'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTRPC } from '../../../trpc';
import { LogFeed } from '../../../log-feed';

// Unstyled on purpose — a working restaurant page to replace with the real design.
export default function RestaurantPage() {
  const { id } = useParams<{ id: string }>();
  const trpc = useTRPC();
  const restaurant = useQuery(trpc.restaurant.byId.queryOptions({ id }));
  const logs = useInfiniteQuery(
    trpc.rating.forRestaurant.infiniteQueryOptions(
      { restaurantId: id, limit: 20 },
      { getNextPageParam: (page) => page.nextCursor },
    ),
  );

  if (restaurant.isError) {
    return (
      <main>
        <p>
          <Link href="/explore">Explore</Link>
        </p>
        <p role="alert">
          {restaurant.error.data?.code === 'NOT_FOUND'
            ? "This restaurant doesn't exist."
            : `Couldn't load this restaurant: ${restaurant.error.message}`}
        </p>
      </main>
    );
  }

  if (!restaurant.data) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  const place = restaurant.data;

  return (
    <main>
      <p>
        <Link href="/explore">Explore</Link> · <Link href="/log">Log a dish</Link>
      </p>
      <h1>{place.name}</h1>
      <p>{[place.address, place.postcode].filter(Boolean).join(', ') || 'No address listed'}</p>
      <p>
        Food hygiene rating: {place.hygieneRating ?? 'not rated'}
        {place.closedAt ? ' · Closed' : ''}
      </p>

      <LogFeed
        pages={logs.data?.pages}
        status={logs.status}
        error={logs.error?.message ?? null}
        hasNextPage={logs.hasNextPage}
        isFetchingNextPage={logs.isFetchingNextPage}
        onLoadMore={() => void logs.fetchNextPage()}
        on="restaurant"
      />
    </main>
  );
}
