import { londonDateString, type Tier } from '@tastecult/shared-types';
import { demoUserId, LOG_COUNTS, MENU_NAMES, NOTES, PEOPLE, THEMES, TIER_WEIGHTS } from './data';
import { createRandom, type Random } from './random';

export interface VenueOption {
  id: string;
  theme: string;
  localAuthority: string;
}

export interface DishOption {
  id: string;
  name: string;
  theme: string;
  popularity: number;
  cuisineIds: string[];
}

export interface PlannedUser {
  id: string;
  username: string;
  displayName: string;
  createdAt: Date;
}

export interface PlannedLog {
  userId: string;
  restaurantId: string;
  dishId: string;
  alias: string | null;
  tier: Tier;
  /** YYYY-MM-DD, London time. */
  visitedOn: string;
  createdAt: Date;
  note: string | null;
  cuisineId: string | null;
  /** Colour for the placeholder photo; null when the log has no photo. */
  photoHue: number | null;
}

export interface PlannedFollow {
  followerId: string;
  followingId: string;
}

export interface DemoPlan {
  users: PlannedUser[];
  logs: PlannedLog[];
  follows: PlannedFollow[];
}

export const DEMO_SEED = 20260914;
const DAY_MS = 86_400_000;
export const HISTORY_DAYS = 180;
export const REAL_USER_FOLLOWS = 8;
export const REAL_USER_FOLLOWERS = 6;

const TIERS: Tier[] = [1, 2, 3, 4, 5];

interface Choice {
  theme: string;
  restaurantId: string;
  dishId: string;
  alias: string | null;
  cuisineIds: string[];
  tier: Tier;
}

/**
 * Decides every mock person, log and follow without touching the database, so the
 * shape of the demo data can be tested. Same inputs and seed → same plan.
 */
export function planDemoData(input: {
  venues: readonly VenueOption[];
  dishes: readonly DishOption[];
  realUserIds: readonly string[];
  now: Date;
  seed?: number;
}): DemoPlan {
  const rng = createRandom(input.seed ?? DEMO_SEED);
  const { now } = input;
  const venuesByTheme = groupBy(input.venues, (venue) => venue.theme);
  const dishesByTheme = groupBy(input.dishes, (dish) => dish.theme);
  const hueByTheme = new Map(THEMES.map((theme) => [theme.key, theme.hue]));

  const users: PlannedUser[] = PEOPLE.map((person, index) => ({
    id: demoUserId(index + 1),
    username: person.username,
    displayName: person.displayName,
    createdAt: new Date(now.getTime() - rng.int(200, 400) * DAY_MS),
  }));

  const counts = rng.shuffle(LOG_COUNTS);
  const logs: PlannedLog[] = [];

  PEOPLE.forEach((person, index) => {
    const userId = users[index]!.id;
    const themes = person.themes.filter(
      (theme) =>
        (venuesByTheme.get(theme)?.length ?? 0) > 0 && (dishesByTheme.get(theme)?.length ?? 0) > 0,
    );
    if (themes.length === 0) return;

    // A handful of regular spots per theme, near home when there are enough, so people
    // go back to the same places the way they do in real life
    const regulars = new Map(
      themes.map((theme) => {
        const all = venuesByTheme.get(theme)!;
        const local = all.filter((venue) => person.boroughs.includes(venue.localAuthority));
        return [theme, rng.shuffle(local.length >= 3 ? local : all).slice(0, 4)] as const;
      }),
    );

    const history: Choice[] = [];
    for (let i = 0; i < (counts[index] ?? 0); i++) {
      const visitedOn = londonDateString(
        new Date(now.getTime() - rng.int(0, HISTORY_DAYS) * DAY_MS),
      );
      // About a third of logs are a return visit to something they've had before
      const previous = history.length > 0 && rng.chance(0.3) ? rng.pick(history) : null;
      const choice: Choice = previous
        ? { ...previous, tier: nudgeTier(previous.tier, rng) }
        : freshChoice(themes, regulars, venuesByTheme, dishesByTheme, rng);
      history.push(choice);

      logs.push({
        userId,
        restaurantId: choice.restaurantId,
        dishId: choice.dishId,
        alias: choice.alias,
        tier: choice.tier,
        visitedOn,
        createdAt: createdAtFor(visitedOn, now, rng),
        note: rng.chance(0.6) ? rng.pick(NOTES[choice.tier]) : null,
        cuisineId:
          choice.cuisineIds.length > 0 && rng.chance(0.3) ? rng.pick(choice.cuisineIds) : null,
        photoHue: rng.chance(0.55) ? (hueByTheme.get(choice.theme) ?? 30) + rng.int(-15, 15) : null,
      });
    }
  });

  const follows = new Map<string, PlannedFollow>();
  const follow = (followerId: string, followingId: string) => {
    if (followerId !== followingId) {
      follows.set(`${followerId}>${followingId}`, { followerId, followingId });
    }
  };
  for (const user of users) {
    const others = rng.shuffle(users.filter((other) => other.id !== user.id));
    for (const other of others.slice(0, rng.int(3, 10))) follow(user.id, other.id);
  }
  for (const realUserId of input.realUserIds) {
    for (const user of rng.shuffle(users).slice(0, REAL_USER_FOLLOWS)) follow(realUserId, user.id);
    for (const user of rng.shuffle(users).slice(0, REAL_USER_FOLLOWERS))
      follow(user.id, realUserId);
  }

  return { users, logs, follows: [...follows.values()] };
}

function freshChoice(
  themes: string[],
  regulars: Map<string, VenueOption[]>,
  venuesByTheme: Map<string, VenueOption[]>,
  dishesByTheme: Map<string, DishOption[]>,
  rng: Random,
): Choice {
  // Earlier themes in a person's list are their favourites
  const theme = rng.weighted(themes, (t) => themes.length - themes.indexOf(t));
  const regularSpots = regulars.get(theme) ?? [];
  const venue =
    regularSpots.length > 0 && rng.chance(0.75)
      ? rng.pick(regularSpots)
      : rng.pick(venuesByTheme.get(theme)!);
  const dish = rng.weighted(dishesByTheme.get(theme)!, (d) => 1 + Math.log10(d.popularity + 1));
  const menuNames = MENU_NAMES[dish.name];
  return {
    theme,
    restaurantId: venue.id,
    dishId: dish.id,
    alias: menuNames && rng.chance(0.55) ? rng.pick(menuNames) : null,
    cuisineIds: dish.cuisineIds,
    tier: rng.weighted(TIERS, (tier) => TIER_WEIGHTS[tier]),
  };
}

/** Return visits land near the previous opinion, one tier either way at most. */
function nudgeTier(previous: Tier, rng: Random): Tier {
  return Math.min(5, Math.max(1, previous + rng.int(-1, 1))) as Tier;
}

/** Logged that evening (UTC, close enough for mock data), never in the future. */
function createdAtFor(visitedOn: string, now: Date, rng: Random): Date {
  const [year, month, day] = visitedOn.split('-').map(Number);
  const evening = Date.UTC(year!, month! - 1, day!, rng.int(12, 21), rng.int(0, 59));
  return new Date(Math.min(evening, now.getTime() - rng.int(1, 120) * 60_000));
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}
