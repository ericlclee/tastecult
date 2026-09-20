'use client';

import { useQuery } from '@tanstack/react-query';
import { TIERS } from '@tastecult/shared-types';
import { useTRPC } from '../trpc';
import { DishStep, type PickedDish } from './dish-step';

const OTHER_CUISINE = '__other__';

/** One dish on a visit, as the form holds it before saving. */
export interface DishDraft {
  /** Stable across re-renders so React can key the list; not the log's id. */
  key: string;
  /** The existing log's id when editing a visit; absent for a dish being added. */
  id?: string;
  dish: PickedDish | null;
  tier: number | null;
  alias: string;
  cuisineId: string;
  showAllCuisines: boolean;
  note: string;
}

export function newDishDraft(key: string): DishDraft {
  return {
    key,
    dish: null,
    tier: null,
    alias: '',
    cuisineId: '',
    showAllCuisines: false,
    note: '',
  };
}

// Unstyled on purpose: a working version of one dish's fields, to replace with the real design.
export function DishEntry({
  draft,
  index,
  count,
  onChange,
  onRemove,
}: {
  draft: DishDraft;
  index: number;
  count: number;
  onChange: (next: DishDraft) => void;
  onRemove: () => void;
}) {
  const trpc = useTRPC();
  const allCuisines = useQuery(
    trpc.cuisine.list.queryOptions(undefined, { enabled: draft.showAllCuisines }),
  );

  const set = (changes: Partial<DishDraft>) => onChange({ ...draft, ...changes });
  const prefix = `dish-${draft.key}`;
  const cuisineOptions = draft.showAllCuisines
    ? (allCuisines.data ?? [])
    : (draft.dish?.cuisines ?? []);

  return (
    <fieldset>
      <legend>Dish {index + 1}</legend>

      <DishStep
        value={draft.dish}
        idPrefix={prefix}
        legend="What it was"
        // Cuisine choices come from the dish, so a different dish resets them
        onChange={(dish) => set({ dish, cuisineId: '', showAllCuisines: false })}
      />

      <fieldset>
        <legend>Rating</legend>
        {TIERS.map((option) => (
          <div key={option.value}>
            <label>
              <input
                type="radio"
                name={`${prefix}-tier`}
                value={option.value}
                checked={draft.tier === option.value}
                onChange={() => set({ tier: option.value })}
              />{' '}
              {option.label}
            </label>
          </div>
        ))}
      </fieldset>

      <p>
        <label htmlFor={`${prefix}-alias`}>Name on the menu</label>{' '}
        <input
          id={`${prefix}-alias`}
          maxLength={120}
          placeholder="e.g. Tonkotsu ramen"
          value={draft.alias}
          onChange={(event) => set({ alias: event.target.value })}
        />
      </p>
      <p>
        <label htmlFor={`${prefix}-cuisine`}>Cuisine</label>{' '}
        <select
          id={`${prefix}-cuisine`}
          disabled={!draft.dish}
          value={draft.cuisineId}
          onChange={(event) => {
            if (event.target.value === OTHER_CUISINE) {
              set({ showAllCuisines: true, cuisineId: '' });
            } else {
              set({ cuisineId: event.target.value });
            }
          }}
        >
          <option value="">{draft.dish ? 'Not specified' : 'Choose a dish first'}</option>
          {cuisineOptions.map((cuisine) => (
            <option key={cuisine.id} value={cuisine.id}>
              {cuisine.name}
            </option>
          ))}
          {draft.dish && !draft.showAllCuisines ? (
            <option value={OTHER_CUISINE}>Other…</option>
          ) : null}
        </select>
      </p>
      <p>
        <label htmlFor={`${prefix}-note`}>Note</label>
        <br />
        <textarea
          id={`${prefix}-note`}
          rows={3}
          maxLength={2000}
          value={draft.note}
          onChange={(event) => set({ note: event.target.value })}
        />
      </p>

      {count > 1 ? (
        <p>
          <button type="button" onClick={onRemove}>
            Remove this dish
          </button>
        </p>
      ) : null}
    </fieldset>
  );
}
