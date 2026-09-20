'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTRPC } from '../trpc';

export interface PickedDish {
  id: string;
  name: string;
  status: string;
  cuisines: { id: string; name: string }[];
}

export function DishStep({
  value,
  onChange,
  /** Keeps field ids unique when a visit has several dish pickers on the page. */
  idPrefix = 'dish',
  legend = 'Dish',
}: {
  value: PickedDish | null;
  onChange: (dish: PickedDish | null) => void;
  idPrefix?: string;
  legend?: string;
}) {
  const trpc = useTRPC();
  const [query, setQuery] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [cuisineId, setCuisineId] = useState('');
  const q = query.trim();
  const searching = q.length >= 2;

  const search = useQuery(trpc.dish.search.queryOptions({ q, limit: 10 }, { enabled: searching }));
  const cuisines = useQuery(trpc.cuisine.list.queryOptions(undefined, { enabled: requesting }));
  const request = useMutation(trpc.dish.request.mutationOptions());

  if (value) {
    return (
      <fieldset>
        <legend>{legend}</legend>
        <p>
          {value.name}
          {value.status === 'PENDING' ? ' (requested — awaiting approval)' : ''}{' '}
          <button type="button" onClick={() => onChange(null)}>
            Change
          </button>
        </p>
      </fieldset>
    );
  }

  function submitRequest() {
    request.mutate(
      { name: q, cuisineId },
      {
        onSuccess: ({ dish }) => {
          onChange({ id: dish.id, name: dish.name, status: dish.status, cuisines: dish.cuisines });
          setRequesting(false);
          setQuery('');
        },
      },
    );
  }

  return (
    <fieldset>
      <legend>{legend}</legend>
      <p>
        <label htmlFor={`${idPrefix}-search`}>What did you eat?</label>{' '}
        <input
          id={`${idPrefix}-search`}
          type="search"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setRequesting(false);
          }}
        />
      </p>
      {search.isError ? (
        <p role="alert">Couldn&apos;t search dishes: {search.error.message}</p>
      ) : null}
      <ul>
        {search.data?.map((dish) => (
          <li key={dish.id}>
            <button
              type="button"
              onClick={() =>
                onChange({
                  id: dish.id,
                  name: dish.name,
                  status: dish.status,
                  cuisines: dish.cuisines,
                })
              }
            >
              {dish.name}
              {dish.cuisines.length > 0 ? ` — ${dish.cuisines.map((c) => c.name).join(', ')}` : ''}
              {dish.status === 'PENDING' ? ' (your request)' : ''}
            </button>
          </li>
        ))}
      </ul>

      {searching && search.isSuccess && !requesting ? (
        <p>
          <button type="button" onClick={() => setRequesting(true)}>
            Not listed? Request &ldquo;{q}&rdquo;
          </button>
        </p>
      ) : null}

      {searching && requesting ? (
        <div>
          <p>
            Request &ldquo;{q}&rdquo; as a new dish. You can log it now; it&apos;s reviewed before
            others see it.
          </p>
          <label htmlFor={`${idPrefix}-request-cuisine`}>Cuisine</label>{' '}
          <select
            id={`${idPrefix}-request-cuisine`}
            value={cuisineId}
            onChange={(event) => setCuisineId(event.target.value)}
          >
            <option value="">Choose a cuisine</option>
            {cuisines.data?.map((cuisine) => (
              <option key={cuisine.id} value={cuisine.id}>
                {cuisine.name}
              </option>
            ))}
          </select>{' '}
          <button type="button" disabled={!cuisineId || request.isPending} onClick={submitRequest}>
            {request.isPending ? 'Requesting…' : 'Request and use this dish'}
          </button>{' '}
          <button type="button" onClick={() => setRequesting(false)}>
            Cancel
          </button>
          {request.isError ? (
            <p role="alert">Couldn&apos;t request the dish: {request.error.message}</p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
