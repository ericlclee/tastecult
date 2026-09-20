import { londonDateString, usernameSchema } from '@tastecult/shared-types';
import { describe, expect, it } from 'vitest';
import { DEMO_ID_PREFIX, PEOPLE, THEMES } from './data';
import {
  HISTORY_DAYS,
  planDemoData,
  REAL_USER_FOLLOWERS,
  REAL_USER_FOLLOWS,
  type DishOption,
  type VenueOption,
} from './plan';

const BOROUGHS = ['Hackney', 'Camden', 'Westminster', 'Southwark'];
const venues: VenueOption[] = THEMES.flatMap((theme) =>
  BOROUGHS.flatMap((borough) =>
    [0, 1, 2].map((i) => ({
      id: `${theme.key}|${borough}|${i}`,
      theme: theme.key,
      localAuthority: borough,
    })),
  ),
);
const dishes: DishOption[] = THEMES.flatMap((theme) =>
  theme.dishes.map((name, i) => ({
    id: `${theme.key}|dish|${i}`,
    name,
    theme: theme.key,
    popularity: 100 * (i + 1),
    cuisineIds: [`cuisine-${theme.key}`, `cuisine-${theme.key}-2`],
  })),
);
const now = new Date('2026-09-14T12:00:00Z');
const REAL_USER = 'real-user';
const plan = () => planDemoData({ venues, dishes, realUserIds: [REAL_USER], now });

describe('planDemoData', () => {
  it('produces exactly the same data every time', () => {
    expect(JSON.stringify(plan())).toBe(JSON.stringify(plan()));
  });

  it('creates 25 recognisable demo people with valid usernames', () => {
    const { users } = plan();
    expect(users).toHaveLength(PEOPLE.length);
    expect(users.every((user) => user.id.startsWith(DEMO_ID_PREFIX))).toBe(true);
    expect(new Set(users.map((user) => user.username)).size).toBe(users.length);
    expect(users.every((user) => usernameSchema.safeParse(user.username).success)).toBe(true);
  });

  it("logs around 400 visits, each at a venue and dish matching one of that person's favourite themes", () => {
    const { users, logs } = plan();
    const visits = new Set(logs.map((log) => `${log.userId}|${log.restaurantId}|${log.visitedOn}`));
    expect(visits.size).toBeGreaterThan(350);
    expect(visits.size).toBeLessThan(420);
    // Most meals are more than one dish, so there are more logs than visits
    expect(logs.length).toBeGreaterThan(visits.size);

    const themesByUser = new Map(users.map((user, i) => [user.id, PEOPLE[i]!.themes]));
    for (const log of logs) {
      const venueTheme = log.restaurantId.split('|')[0]!;
      const dishTheme = log.dishId.split('|')[0]!;
      expect(dishTheme).toBe(venueTheme);
      expect(themesByUser.get(log.userId)).toContain(venueTheme);
      if (log.cuisineId) expect(log.cuisineId.startsWith(`cuisine-${dishTheme}`)).toBe(true);
    }
  });

  it('puts several dishes on a good share of visits, never the same dish twice', () => {
    const byVisit = new Map<string, string[]>();
    for (const log of plan().logs) {
      const key = `${log.userId}|${log.restaurantId}|${log.visitedOn}`;
      byVisit.set(key, [...(byVisit.get(key) ?? []), log.dishId]);
    }
    const multi = [...byVisit.values()].filter((dishes) => dishes.length > 1);
    expect(multi.length / byVisit.size).toBeGreaterThan(0.3);
    for (const dishes of byVisit.values()) {
      expect(new Set(dishes).size).toBe(dishes.length);
    }
  });

  it('keeps dates within the last six months and never in the future', () => {
    const earliest = londonDateString(new Date(now.getTime() - (HISTORY_DAYS + 1) * 86_400_000));
    for (const log of plan().logs) {
      expect(log.visitedOn >= earliest && log.visitedOn <= '2026-09-14').toBe(true);
      expect(log.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it('leans positive, uses every tier, and includes return visits', () => {
    const { logs } = plan();
    const goodOrBetter = logs.filter((log) => log.tier >= 3).length / logs.length;
    expect(goodOrBetter).toBeGreaterThan(0.6);
    expect(new Set(logs.map((log) => log.tier))).toEqual(new Set([1, 2, 3, 4, 5]));

    const visits = new Map<string, number>();
    for (const log of logs) {
      const key = `${log.userId}|${log.restaurantId}|${log.dishId}|${log.alias}`;
      visits.set(key, (visits.get(key) ?? 0) + 1);
    }
    expect([...visits.values()].some((count) => count >= 2)).toBe(true);
  });

  it('gives roughly half the logs photos', () => {
    const { logs } = plan();
    const share = logs.filter((log) => log.photoHue !== null).length / logs.length;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.7);
  });

  it('makes valid follows and connects existing accounts both ways', () => {
    const { follows } = plan();
    expect(follows.every((f) => f.followerId !== f.followingId)).toBe(true);
    const keys = follows.map((f) => `${f.followerId}>${f.followingId}`);
    expect(new Set(keys).size).toBe(keys.length);

    expect(follows.filter((f) => f.followerId === REAL_USER)).toHaveLength(REAL_USER_FOLLOWS);
    expect(follows.filter((f) => f.followingId === REAL_USER)).toHaveLength(REAL_USER_FOLLOWERS);
  });

  it('adds reactions from other people and comment threads that come after the log', () => {
    const { logs, reactions, comments } = plan();
    expect(reactions.length).toBeGreaterThan(logs.length / 2);
    expect(comments.length).toBeGreaterThan(50);

    const reactionKeys = reactions.map((r) => `${r.userId}|${r.logIndex}`);
    expect(new Set(reactionKeys).size).toBe(reactionKeys.length);
    expect(reactions.every((r) => logs[r.logIndex]!.userId !== r.userId)).toBe(true);

    for (const comment of comments) {
      const log = logs[comment.logIndex]!;
      expect(comment.createdAt.getTime()).toBeGreaterThanOrEqual(log.createdAt.getTime());
      expect(comment.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
    }
    // Some threads include the log owner replying
    expect(comments.some((c) => logs[c.logIndex]!.userId === c.userId)).toBe(true);
  });
});
