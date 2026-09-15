'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@tastecult/api-client';
import { isTier, londonDateString, tierLabel, TIERS } from '@tastecult/shared-types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTRPC } from '../trpc';
import { DishStep, type PickedDish } from './dish-step';
import { resizeToJpeg } from './resize-image';
import { RestaurantStep, type PickedRestaurant } from './restaurant-step';

type SavedLog = RouterOutputs['rating']['create'];
export type EditableLog = RouterOutputs['rating']['mineById'];

const OTHER_CUISINE = '__other__';

// Unstyled on purpose: a working version of the logging form, to replace with the real design.
// Without `existing` it logs a new dish; with it, it edits that log.
export function LogForm({
  existing,
  onLogAnother,
  children,
}: {
  existing?: EditableLog;
  onLogAnother?: () => void;
  /** Extra controls at the end of the page, such as a delete button. */
  children?: ReactNode;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const existingDish = existing?.menuItem.dish;
  const existingCuisineIsOther = Boolean(
    existing?.cuisine &&
    !existingDish?.cuisines.some(({ cuisine }) => cuisine.id === existing.cuisine?.id),
  );

  const [photo, setPhoto] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  // The photo the log already has, until it's removed or replaced
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState(existing?.photoUrl ?? null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<PickedRestaurant | null>(
    existing ? existing.menuItem.restaurant : null,
  );
  const [dish, setDish] = useState<PickedDish | null>(
    existingDish
      ? { ...existingDish, cuisines: existingDish.cuisines.map(({ cuisine }) => cuisine) }
      : null,
  );
  const [tier, setTier] = useState<number | null>(existing?.tier ?? null);
  const [alias, setAlias] = useState(existing?.menuItem.alias ?? '');
  const [visitedAt, setVisitedAt] = useState(() => existing?.visitedAt ?? londonDateString());
  const [cuisineId, setCuisineId] = useState(existing?.cuisine?.id ?? '');
  const [showAllCuisines, setShowAllCuisines] = useState(existingCuisineIsOther);
  const [note, setNote] = useState(existing?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedLog | null>(null);

  const allCuisines = useQuery(
    trpc.cuisine.list.queryOptions(undefined, { enabled: showAllCuisines }),
  );
  const createUploadUrl = useMutation(trpc.photo.createUploadUrl.mutationOptions());
  const createRating = useMutation(trpc.rating.create.mutationOptions());
  const updateRating = useMutation(trpc.rating.update.mutationOptions());

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
      setCurrentPhotoUrl(null);
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
      // Undefined keeps an edited log's current photo; null removes it
      let photoPath: string | null | undefined = existing && !currentPhotoUrl ? null : undefined;
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

      const fields = {
        restaurantId: restaurant.id,
        dishId: dish.id,
        tier,
        visitedAt,
        alias: alias.trim() || null,
        cuisineId: cuisineId || null,
        note: note.trim() || null,
        photoPath,
      };

      if (existing) {
        await updateRating.mutateAsync({ id: existing.id, ...fields });
        await queryClient.invalidateQueries({ queryKey: trpc.rating.pathKey() });
        router.push('/me');
      } else {
        setSaved(await createRating.mutateAsync(fields));
      }
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
          {onLogAnother ? (
            <>
              <button type="button" onClick={onLogAnother}>
                Log another dish
              </button>{' '}
              ·{' '}
            </>
          ) : null}
          <Link href="/me">My logs</Link>
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
  const shownPhotoUrl = photo?.previewUrl ?? currentPhotoUrl;

  return (
    <main>
      <h1>{existing ? 'Edit log' : 'Log a dish'}</h1>

      <form onSubmit={(event) => void save(event)}>
        <fieldset>
          <legend>Photo (optional)</legend>
          <p>
            <label htmlFor="photo-camera">
              {shownPhotoUrl ? 'Take a new photo' : 'Take a photo'}
            </label>{' '}
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
          {shownPhotoUrl ? (
            <p>
              <img src={shownPhotoUrl} alt="The photo for this log" width={240} />
              <br />
              <button
                type="button"
                onClick={() => {
                  setPhoto(null);
                  setCurrentPhotoUrl(null);
                }}
              >
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
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Save log'}
        </button>
        {existing ? (
          <>
            {' '}
            <Link href="/me">Cancel</Link>
          </>
        ) : null}
      </form>

      {children}
    </main>
  );
}
