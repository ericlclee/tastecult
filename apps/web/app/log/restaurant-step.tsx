'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTRPC } from '../trpc';

export interface PickedRestaurant {
  id: string;
  name: string;
  postcode: string | null;
}

const NEARBY_RADIUS_KM = 0.5;

export function RestaurantStep({
  value,
  onChange,
}: {
  value: PickedRestaurant | null;
  onChange: (restaurant: PickedRestaurant | null) => void;
}) {
  const trpc = useTRPC();
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const q = query.trim();
  const searching = q.length >= 2;

  const nearby = useQuery(
    trpc.restaurant.nearby.queryOptions(
      { lat: coords?.lat ?? 0, lng: coords?.lng ?? 0, radiusKm: NEARBY_RADIUS_KM, limit: 15 },
      { enabled: coords !== null && !searching },
    ),
  );
  const search = useQuery(
    trpc.restaurant.search.queryOptions(
      { q, near: coords ?? undefined, limit: 10 },
      { enabled: searching },
    ),
  );

  function locate() {
    if (!('geolocation' in navigator)) {
      setLocationError("Location isn't available in this browser — search by name instead.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
      },
      (error) => {
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was turned down — search by name instead.'
            : "Couldn't find your location — search by name instead.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  if (value) {
    return (
      <fieldset>
        <legend>Restaurant</legend>
        <p>
          {value.name}
          {value.postcode ? ` (${value.postcode})` : ''}{' '}
          <button type="button" onClick={() => onChange(null)}>
            Change
          </button>
        </p>
      </fieldset>
    );
  }

  const active = searching ? search : nearby;

  return (
    <fieldset>
      <legend>Restaurant</legend>
      <p>
        <button type="button" onClick={locate} disabled={locating}>
          {locating ? 'Finding you…' : 'Show restaurants near me'}
        </button>
      </p>
      {locationError ? <p role="alert">{locationError}</p> : null}
      <p>
        <label htmlFor="restaurant-search">Or search by name</label>{' '}
        <input
          id="restaurant-search"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </p>
      {active.isError ? (
        <p role="alert">Couldn&apos;t load restaurants: {active.error.message}</p>
      ) : null}
      <ul>
        {active.data?.map((restaurant) => (
          <li key={restaurant.id}>
            <button
              type="button"
              onClick={() =>
                onChange({
                  id: restaurant.id,
                  name: restaurant.name,
                  postcode: restaurant.postcode,
                })
              }
            >
              {restaurant.name}
              {restaurant.postcode ? ` (${restaurant.postcode})` : ''}
              {restaurant.distanceKm !== null ? ` — ${formatDistance(restaurant.distanceKm)}` : ''}
            </button>
          </li>
        ))}
      </ul>
      {!searching && coords && nearby.isSuccess && nearby.data.length === 0 ? (
        <p>No restaurants found within 500 m — try searching by name.</p>
      ) : null}
    </fieldset>
  );
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
