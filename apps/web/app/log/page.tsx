'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { RouterOutputs } from '@tastecult/api-client';
import { isTier, londonDateString, tierLabel, TIERS } from '@tastecult/shared-types';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useSession } from '../session';
import { useTRPC } from '../trpc';
import { DishStep, type PickedDish } from './dish-step';
import { ProfileSetup } from './profile-setup';
import { resizeToJpeg } from './resize-image';
import { RestaurantStep, type PickedRestaurant } from './restaurant-step';

type SavedLog = RouterOutputs['rating']['create'];

const OTHER_CUISINE = '__other__';

// Unstyled on purpose: a working version of the logging flow, to replace with the real design.
export default function LogPage() {
  const trpc = useTRPC();
  const { session, ready } = useSession();
  const me = useQuery(trpc.user.me.queryOptions(undefined, { enabled: Boolean(session) }));
  // Bumping the key remounts the form, clearing it for the next dish
  const [formKey, setFormKey] = useState(0);

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
        <h1>Log a dish</h1>
        <p>
          <Link href="/sign-in">Sign in</Link> to log a dish.
        </p>
      </main>
    );
  }

  if (me.isError) {
    return (
      <main>
        <h1>Log a dish</h1>
        <p role="alert">Couldn&apos;t load your profile: {me.error.message}</p>
      </main>
    );
  }

  if (!me.data) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  if (!me.data.profile) {
    return (
      <main>
        <h1>Log a dish</h1>
        <ProfileSetup email={me.data.email} />
      </main>
    );
  }

  return <LogForm key={formKey} onLogAnother={() => setFormKey((key) => key + 1)} />;
}

function LogForm({ onLogAnother }: { onLogAnother: () => void }) {
  const trpc = useTRPC();

  const [photo, setPhoto] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<PickedRestaurant | null>(null);
  const [dish, setDish] = useState<PickedDish | null>(null);
  const [tier, setTier] = useState<number | null>(null);
  const [alias, setAlias] = useState('');
  const [visitedAt, setVisitedAt] = useState(() => londonDateString());
  const [cuisineId, setCuisineId] = useState('');
  const [showAllCuisines, setShowAllCuisines] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedLog | null>(null);

  const allCuisines = useQuery(
    trpc.cuisine.list.queryOptions(undefined, { enabled: showAllCuisines }),
  );
  const createUploadUrl = useMutation(trpc.photo.createUploadUrl.mutationOptions());
  const createRating = useMutation(trpc.rating.create.mutationOptions());

  // Free the preview image's memory when the photo is replaced or the form closes
  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.previewUrl);
    };
  }, [photo]);

  async function choosePhoto(file: File | undefined) {
    setPhotoError(null);
    if (!file) return;
    setPreparingPhoto(true);
    try {
      const blob = await resizeToJpeg(file);
      setPhoto({ blob, previewUrl: URL.createObjectURL(blob) });
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Couldn't read that photo.");
    } finally {
      setPreparingPhoto(false);
    }
  }

  // Cuisine choices come from the dish, so a different dish resets them
  function chooseDish(next: PickedDish | null) {
    setDish(next);
    setCuisineId('');
    setShowAllCuisines(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!restaurant || !dish || tier === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      let photoPath: string | undefined;
      if (photo) {
        // The photo goes straight to Supabase Storage; only its path goes to the API
        const upload = await createUploadUrl.mutateAsync();
        const response = await fetch(upload.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: photo.blob,
        });
        if (!response.ok) {
          throw new Error(
            `The photo didn't upload (error ${response.status}). Try again, or remove the photo to save without it.`,
          );
        }
        photoPath = upload.path;
      }

      const log = await createRating.mutateAsync({
        restaurantId: restaurant.id,
        dishId: dish.id,
        tier,
        visitedAt,
        alias: alias.trim() || undefined,
        cuisineId: cuisineId || undefined,
        note: note.trim() || undefined,
        photoPath,
      });
      setSaved(log);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Couldn't save your log.");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    const dishName = saved.menuItem.alias ?? saved.menuItem.dish.name;
    return (
      <main>
        <h1>Saved</h1>
        {saved.photoUrl ? (
          <img
            src={saved.photoUrl}
            alt={`${dishName} at ${saved.menuItem.restaurant.name}`}
            width={320}
          />
        ) : null}
        <p>
          <strong>{dishName}</strong> at {saved.menuItem.restaurant.name}
        </p>
        <p>
          {isTier(saved.tier) ? tierLabel(saved.tier) : saved.tier} · {saved.visitedAt}
          {saved.cuisine ? ` · ${saved.cuisine.name}` : ''}
        </p>
        {saved.note ? <p>{saved.note}</p> : null}
        <p>
          <button type="button" onClick={onLogAnother}>
            Log another dish
          </button>{' '}
          · <Link href="/me">My logs</Link>
        </p>
      </main>
    );
  }

  const today = londonDateString();
  const cuisineOptions = showAllCuisines ? (allCuisines.data ?? []) : (dish?.cuisines ?? []);
  const missing = [
    !restaurant && 'a restaurant',
    !dish && 'a dish',
    tier === null && 'a rating',
  ].filter(Boolean);
  const canSave = missing.length === 0 && visitedAt !== '' && !saving && !preparingPhoto;

  return (
    <main>
      <h1>Log a dish</h1>

      <form onSubmit={(event) => void save(event)}>
        <fieldset>
          <legend>Photo (optional)</legend>
          <p>
            <label htmlFor="photo-camera">Take a photo</label>{' '}
            {/* capture opens the camera on phones; desktop browsers show a file picker */}
            <input
              id="photo-camera"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => void choosePhoto(event.target.files?.[0])}
            />
          </p>
          <p>
            <label htmlFor="photo-upload">Or choose one</label>{' '}
            <input
              id="photo-upload"
              type="file"
              accept="image/*"
              onChange={(event) => void choosePhoto(event.target.files?.[0])}
            />
          </p>
          {preparingPhoto ? <p>Preparing photo…</p> : null}
          {photoError ? <p role="alert">{photoError}</p> : null}
          {photo ? (
            <p>
              <img src={photo.previewUrl} alt="The photo you chose" width={240} />
              <br />
              <button type="button" onClick={() => setPhoto(null)}>
                Remove photo
              </button>
            </p>
          ) : null}
        </fieldset>

        <RestaurantStep value={restaurant} onChange={setRestaurant} />
        <DishStep value={dish} onChange={chooseDish} />

        <fieldset>
          <legend>Rating</legend>
          {TIERS.map((option) => (
            <div key={option.value}>
              <label>
                <input
                  type="radio"
                  name="tier"
                  value={option.value}
                  checked={tier === option.value}
                  onChange={() => setTier(option.value)}
                />{' '}
                {option.label}
              </label>
            </div>
          ))}
        </fieldset>

        <fieldset>
          <legend>Optional details</legend>
          <p>
            <label htmlFor="alias">Name on the menu</label>{' '}
            <input
              id="alias"
              maxLength={120}
              placeholder="e.g. Tonkotsu ramen"
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
            />
          </p>
          <p>
            <label htmlFor="visited-at">Date</label>{' '}
            <input
              id="visited-at"
              type="date"
              required
              max={today}
              value={visitedAt}
              onChange={(event) => setVisitedAt(event.target.value)}
            />
          </p>
          <p>
            <label htmlFor="cuisine">Cuisine</label>{' '}
            <select
              id="cuisine"
              disabled={!dish}
              value={cuisineId}
              onChange={(event) => {
                if (event.target.value === OTHER_CUISINE) {
                  setShowAllCuisines(true);
                  setCuisineId('');
                } else {
                  setCuisineId(event.target.value);
                }
              }}
            >
              <option value="">{dish ? 'Not specified' : 'Choose a dish first'}</option>
              {cuisineOptions.map((cuisine) => (
                <option key={cuisine.id} value={cuisine.id}>
                  {cuisine.name}
                </option>
              ))}
              {dish && !showAllCuisines ? <option value={OTHER_CUISINE}>Other…</option> : null}
            </select>
          </p>
          <p>
            <label htmlFor="note">Note</label>
            <br />
            <textarea
              id="note"
              rows={4}
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </p>
        </fieldset>

        {saveError ? <p role="alert">{saveError}</p> : null}
        {missing.length > 0 ? <p>To save, choose {missing.join(', ')}.</p> : null}
        <button type="submit" disabled={!canSave}>
          {saving ? 'Saving…' : 'Save log'}
        </button>
      </form>
    </main>
  );
}
