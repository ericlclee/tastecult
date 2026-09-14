'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useTRPC } from './trpc';

// Unstyled placeholder that proves the web app reaches the API end to end.
// Deliberately no design — replace this page with the real UI.
export default function Home() {
  const trpc = useTRPC();
  const [query, setQuery] = useState('');
  const q = query.trim();
  const searchable = q.length >= 2;

  const health = useQuery(trpc.health.queryOptions());
  const dishes = useQuery(trpc.dish.search.queryOptions({ q }, { enabled: searchable }));
  const restaurants = useQuery(trpc.restaurant.search.queryOptions({ q }, { enabled: searchable }));

  return (
    <main>
      <h1>TasteCult</h1>
      <p>
        <Link href="/explore">Explore</Link> · <Link href="/log">Log a dish</Link> ·{' '}
        <Link href="/me">My logs</Link> · <Link href="/sign-in">Sign in</Link>
      </p>
      <p>
        API:{' '}
        {health.isSuccess ? 'connected' : health.isError ? `error: ${health.error.message}` : '…'}
      </p>

      <input
        aria-label="Search dishes and restaurants"
        placeholder="Search dishes and restaurants"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <h2>Dishes</h2>
      <ul>
        {dishes.data?.map((dish) => (
          <li key={dish.id}>
            {dish.name} — {dish.cuisines.map((c) => c.name).join(', ')}
          </li>
        ))}
      </ul>

      <h2>Restaurants</h2>
      <ul>
        {restaurants.data?.map((restaurant) => (
          <li key={restaurant.id}>
            {restaurant.name}
            {restaurant.postcode ? ` (${restaurant.postcode})` : ''}
          </li>
        ))}
      </ul>
    </main>
  );
}
