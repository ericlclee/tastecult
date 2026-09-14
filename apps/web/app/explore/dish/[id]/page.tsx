'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTRPC } from '../../../trpc';
import { LogFeed } from '../../../log-feed';

// Unstyled on purpose — a working dish page to replace with the real design.
export default function DishPage() {
  const { id } = useParams<{ id: string }>();
  const trpc = useTRPC();
  const dish = useQuery(trpc.dish.byId.queryOptions({ id }));
  const logs = useInfiniteQuery(
    trpc.rating.forDish.infiniteQueryOptions(
      { dishId: id, limit: 20 },
      { getNextPageParam: (page) => page.nextCursor },
    ),
  );

  if (dish.isError) {
    return (
      <main>
        <p>
          <Link href="/explore">Explore</Link>
        </p>
        <p role="alert">
          {dish.error.data?.code === 'NOT_FOUND'
            ? "This dish doesn't exist."
            : `Couldn't load this dish: ${dish.error.message}`}
        </p>
      </main>
    );
  }

  if (!dish.data) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  const d = dish.data;

  return (
    <main>
      <p>
        <Link href="/explore">Explore</Link> · <Link href="/log">Log a dish</Link>
      </p>
      <h1>{d.name}</h1>
      <p>
        {d.cuisines.map((c) => c.name).join(', ') || 'No cuisine listed'}
        {d.category ? ` · ${d.category}` : ''}
        {d.status === 'PENDING' ? ' · requested by you, awaiting approval' : ''}
      </p>
      {d.parent ? (
        <p>
          A kind of <Link href={`/explore/dish/${d.parent.id}`}>{d.parent.name}</Link>
        </p>
      ) : null}
      {d.otherNames.length > 0 ? <p>Also known as {d.otherNames.join(', ')}</p> : null}
      {d.variants.length > 0 ? (
        <p>
          Includes logs of its {d.variantCount} {d.variantCount === 1 ? 'variant' : 'variants'}:{' '}
          {d.variants.slice(0, 8).map((variant, index) => (
            <span key={variant.id}>
              {index > 0 ? ', ' : ''}
              <Link href={`/explore/dish/${variant.id}`}>{variant.name}</Link>
            </span>
          ))}
          {d.variantCount > 8 ? ', …' : ''}
        </p>
      ) : null}

      <LogFeed
        pages={logs.data?.pages}
        status={logs.status}
        error={logs.error?.message ?? null}
        hasNextPage={logs.hasNextPage}
        isFetchingNextPage={logs.isFetchingNextPage}
        onLoadMore={() => void logs.fetchNextPage()}
        on="dish"
      />
    </main>
  );
}
