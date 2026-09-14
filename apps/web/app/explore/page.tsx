'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useTRPC } from '../trpc';

// Unstyled on purpose — a working explore page to replace with the real design.
export default function ExplorePage() {
  const trpc = useTRPC();
  const [query, setQuery] = useState('');
  const q = query.trim();
  const searching = q.length >= 2;

  const dishes = useQuery(trpc.dish.search.queryOptions({ q, limit: 10 }, { enabled: searching }));
  const restaurants = useQuery(
    trpc.restaurant.search.queryOptions({ q, limit: 10 }, { enabled: searching }),
  );

  return (
    <main>
      <h1>Explore</h1>

      <p>
        <label htmlFor="explore-search">Search restaurants and dishes</label>{' '}
        <input
          id="explore-search"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </p>
      {!searching ? <p>Type at least 2 letters to search.</p> : null}

      {searching ? (
        <>
          <h2>Dishes</h2>
          {dishes.isError ? (
            <p role="alert">Couldn&apos;t search dishes: {dishes.error.message}</p>
          ) : null}
          {dishes.isSuccess && dishes.data.length === 0 ? <p>No dishes match.</p> : null}
          <ul>
            {dishes.data?.map((dish) => (
              <li key={dish.id}>
                <Link href={`/explore/dish/${dish.id}`}>{dish.name}</Link>
                {dish.cuisines.length > 0
                  ? ` — ${dish.cuisines.map((c) => c.name).join(', ')}`
                  : ''}
                {dish.parent ? ` (a kind of ${dish.parent.name})` : ''}
              </li>
            ))}
          </ul>

          <h2>Restaurants</h2>
          {restaurants.isError ? (
            <p role="alert">Couldn&apos;t search restaurants: {restaurants.error.message}</p>
          ) : null}
          {restaurants.isSuccess && restaurants.data.length === 0 ? (
            <p>No restaurants match.</p>
          ) : null}
          <ul>
            {restaurants.data?.map((restaurant) => (
              <li key={restaurant.id}>
                <Link href={`/explore/restaurant/${restaurant.id}`}>{restaurant.name}</Link>
                {restaurant.postcode ? ` (${restaurant.postcode})` : ''}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </main>
  );
}
