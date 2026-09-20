'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@tastecult/api-client';
import { MAX_PHOTOS_PER_VISIT, isTier, londonDateString, tierLabel } from '@tastecult/shared-types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTRPC } from '../trpc';
import { DishEntry, newDishDraft, type DishDraft } from './dish-entry';
import { resizeToJpeg } from './resize-image';
import { RestaurantStep, type PickedRestaurant } from './restaurant-step';

type SavedVisit = RouterOutputs['visit']['create'];
export type EditableVisit = RouterOutputs['visit']['mineById'];

/**
 * A photo on the visit. One already saved has a `path` and no `blob`; a newly chosen one
 * has a `blob` to upload and gets its path on save. `dishKey` links it to a dish draft
 * rather than to an index, so removing a dish can't silently re-point it at another.
 */
interface PhotoDraft {
  key: string;
  path: string | null;
  blob: Blob | null;
  previewUrl: string;
  dishKey: string | null;
}

let nextKey = 0;
const makeKey = () => `k${nextKey++}`;

function draftsFrom(existing: EditableVisit | undefined): DishDraft[] {
  if (!existing) return [newDishDraft(makeKey())];
  return existing.dishes.map((log) => {
    const dish = log.menuItem.dish;
    const cuisines = dish.cuisines.map(({ cuisine }) => cuisine);
    return {
      key: makeKey(),
      id: log.id,
      dish: { id: dish.id, name: dish.name, status: dish.status, cuisines },
      tier: log.tier,
      alias: log.menuItem.alias ?? '',
      cuisineId: log.cuisine?.id ?? '',
      // An "Other" cuisine isn't among the dish's own, so the full list must stay open
      showAllCuisines: Boolean(
        log.cuisine && !cuisines.some((cuisine) => cuisine.id === log.cuisine?.id),
      ),
      note: log.note ?? '',
    };
  });
}

// Unstyled on purpose: a working version of the logging flow, to replace with the real design.
// Without `existing` it logs a new visit; with it, it edits that visit.
export function VisitForm({
  existing,
  onLogAnother,
  children,
}: {
  existing?: EditableVisit;
  onLogAnother?: () => void;
  /** Extra controls at the end of the page, such as a delete button. */
  children?: ReactNode;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [restaurant, setRestaurant] = useState<PickedRestaurant | null>(
    existing ? existing.restaurant : null,
  );
  const [visitedAt, setVisitedAt] = useState(() => existing?.visitedAt ?? londonDateString());
  const [note, setNote] = useState(existing?.note ?? '');
  const [initial] = useState(() => {
    const drafts = draftsFrom(existing);
    const photoDrafts = (existing?.photos ?? []).map((photo): PhotoDraft => ({
      key: makeKey(),
      path: photo.path,
      blob: null,
      previewUrl: photo.url,
      // The API links a photo to a dish by its index in the visit's dishes
      dishKey: photo.dishIndex != null ? (drafts[photo.dishIndex]?.key ?? null) : null,
    }));
    return { drafts, photoDrafts };
  });
  const [dishes, setDishes] = useState<DishDraft[]>(initial.drafts);
  const [photos, setPhotos] = useState<PhotoDraft[]>(initial.photoDrafts);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedVisit | null>(null);

  const createUploadUrl = useMutation(trpc.photo.createUploadUrl.mutationOptions());
  const createVisit = useMutation(trpc.visit.create.mutationOptions());
  const updateVisit = useMutation(trpc.visit.update.mutationOptions());

  // Read through a ref so the cleanup sees the photos as they are when the form
  // closes, without re-running every time the list changes
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => {
    return () => {
      // A saved photo's preview is a public URL; only the ones we made need revoking
      for (const photo of photosRef.current) {
        if (photo.blob) URL.revokeObjectURL(photo.previewUrl);
      }
    };
  }, []);

  async function addPhotos(files: FileList | null) {
    setPhotoError(null);
    if (!files || files.length === 0) return;
    const room = MAX_PHOTOS_PER_VISIT - photos.length;
    if (room <= 0) {
      setPhotoError(`A visit can have at most ${MAX_PHOTOS_PER_VISIT} photos.`);
      return;
    }
    setPreparingPhoto(true);
    try {
      const chosen = [...files].slice(0, room);
      const prepared = await Promise.all(
        chosen.map(async (file) => {
          const blob = await resizeToJpeg(file);
          return {
            key: makeKey(),
            path: null,
            blob,
            previewUrl: URL.createObjectURL(blob),
            dishKey: null,
          } satisfies PhotoDraft;
        }),
      );
      setPhotos((current) => [...current, ...prepared]);
      if (chosen.length < files.length) {
        setPhotoError(`Only ${room} more ${room === 1 ? 'photo' : 'photos'} fit on this visit.`);
      }
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Couldn't read that photo.");
    } finally {
      setPreparingPhoto(false);
    }
  }

  function removePhoto(key: string) {
    setPhotos((current) =>
      current.filter((photo) => {
        if (photo.key !== key) return true;
        if (photo.blob) URL.revokeObjectURL(photo.previewUrl);
        return false;
      }),
    );
  }

  function updateDish(key: string, next: DishDraft) {
    setDishes((current) => current.map((draft) => (draft.key === key ? next : draft)));
  }

  function removeDish(key: string) {
    setDishes((current) => current.filter((draft) => draft.key !== key));
    // Photos of that dish stay on the visit rather than disappearing with it
    setPhotos((current) =>
      current.map((photo) => (photo.dishKey === key ? { ...photo, dishKey: null } : photo)),
    );
  }

  const readyDishes = dishes.every((draft) => draft.dish && draft.tier !== null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!restaurant || !readyDishes) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Photos go straight to Supabase Storage; only their paths go to the API
      const uploaded = await Promise.all(
        photos.map(async (photo) => {
          if (!photo.blob) return { ...photo, path: photo.path! };
          const upload = await createUploadUrl.mutateAsync();
          const response = await fetch(upload.signedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: photo.blob,
          });
          if (!response.ok) {
            throw new Error(
              `A photo didn't upload (error ${response.status}). Try again, or remove it to save without it.`,
            );
          }
          return { ...photo, path: upload.path };
        }),
      );

      const fields = {
        restaurantId: restaurant.id,
        visitedAt,
        note: note.trim() || null,
        dishes: dishes.map((draft) => ({
          id: draft.id,
          dishId: draft.dish!.id,
          tier: draft.tier!,
          alias: draft.alias.trim() || null,
          cuisineId: draft.cuisineId || null,
          note: draft.note.trim() || null,
        })),
        photos: uploaded.map((photo) => {
          const at = dishes.findIndex((draft) => draft.key === photo.dishKey);
          return { path: photo.path, dishIndex: at === -1 ? null : at };
        }),
      };

      if (existing) {
        await updateVisit.mutateAsync({ id: existing.id, ...fields });
        await queryClient.invalidateQueries({ queryKey: trpc.visit.pathKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.rating.pathKey() });
        router.push('/me');
      } else {
        setSaved(await createVisit.mutateAsync(fields));
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Couldn't save your visit.");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <main>
        <h1>Saved</h1>
        {saved.photos.map((photo) => (
          <img
            key={photo.id}
            src={photo.url}
            alt={`A photo from ${saved.restaurant.name}`}
            width={320}
          />
        ))}
        <p>
          {saved.dishes.length} {saved.dishes.length === 1 ? 'dish' : 'dishes'} at{' '}
          <strong>{saved.restaurant.name}</strong> on {saved.visitedAt}
        </p>
        <ul>
          {saved.dishes.map((log) => (
            <li key={log.id}>
              {log.menuItem.alias ?? log.menuItem.dish.name} —{' '}
              {isTier(log.tier) ? tierLabel(log.tier) : log.tier}
              {log.cuisine ? ` · ${log.cuisine.name}` : ''}
              {log.note ? ` — ${log.note}` : ''}
            </li>
          ))}
        </ul>
        {saved.note ? <p>{saved.note}</p> : null}
        <p>
          {onLogAnother ? (
            <>
              <button type="button" onClick={onLogAnother}>
                Log another visit
              </button>{' '}
              ·{' '}
            </>
          ) : null}
          <Link href={`/visit/${saved.id}/edit`}>Edit this visit</Link> ·{' '}
          <Link href="/me">My logs</Link>
        </p>
      </main>
    );
  }

  const today = londonDateString();
  const missing = [
    !restaurant && 'a restaurant',
    !readyDishes && 'a dish and rating for every entry',
  ].filter(Boolean);
  const canSave = missing.length === 0 && visitedAt !== '' && !saving && !preparingPhoto;

  return (
    <main>
      <h1>{existing ? 'Edit visit' : 'Log a visit'}</h1>

      <form onSubmit={(event) => void save(event)}>
        <RestaurantStep value={restaurant} onChange={setRestaurant} />

        <fieldset>
          <legend>When</legend>
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
        </fieldset>

        <fieldset>
          <legend>Photos (optional)</legend>
          <p>
            <label htmlFor="photo-camera">Take a photo</label>{' '}
            {/* capture opens the camera on phones; desktop browsers show a file picker */}
            <input
              id="photo-camera"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => void addPhotos(event.target.files)}
            />
          </p>
          <p>
            <label htmlFor="photo-upload">Or choose some</label>{' '}
            <input
              id="photo-upload"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => void addPhotos(event.target.files)}
            />
          </p>
          {preparingPhoto ? <p>Preparing photos…</p> : null}
          {photoError ? <p role="alert">{photoError}</p> : null}
          <ul>
            {photos.map((photo) => (
              <li key={photo.key}>
                <img src={photo.previewUrl} alt="A photo of this visit" width={240} />
                <br />
                <label htmlFor={`photo-${photo.key}-dish`}>Of which dish?</label>{' '}
                <select
                  id={`photo-${photo.key}-dish`}
                  value={photo.dishKey ?? ''}
                  onChange={(event) =>
                    setPhotos((current) =>
                      current.map((item) =>
                        item.key === photo.key
                          ? { ...item, dishKey: event.target.value || null }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="">The visit as a whole</option>
                  {dishes.map((draft, index) => (
                    <option key={draft.key} value={draft.key}>
                      {draft.dish?.name ?? `Dish ${index + 1}`}
                    </option>
                  ))}
                </select>{' '}
                <button type="button" onClick={() => removePhoto(photo.key)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </fieldset>

        {dishes.map((draft, index) => (
          <DishEntry
            key={draft.key}
            draft={draft}
            index={index}
            count={dishes.length}
            onChange={(next) => updateDish(draft.key, next)}
            onRemove={() => removeDish(draft.key)}
          />
        ))}

        <p>
          <button
            type="button"
            onClick={() => setDishes((current) => [...current, newDishDraft(makeKey())])}
          >
            Add another dish
          </button>
        </p>

        <fieldset>
          <legend>About the meal (optional)</legend>
          <p>
            <label htmlFor="visit-note">Note</label>
            <br />
            <textarea
              id="visit-note"
              rows={3}
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </p>
        </fieldset>

        {saveError ? <p role="alert">{saveError}</p> : null}
        {missing.length > 0 ? <p>To save, choose {missing.join(', ')}.</p> : null}
        <button type="submit" disabled={!canSave}>
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Save visit'}
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
