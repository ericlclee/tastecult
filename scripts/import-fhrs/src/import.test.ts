import { createTestPrismaClient, resetDatabase } from '@tastecult/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { EstablishmentsResult, FhrsAuthority, FhrsClient } from './fhrs-client.js';
import { runImport, selectLondonAuthorities } from './import.js';
import { feed, makeAuthority, makeEstablishment } from './test-fixtures.js';

const prisma = createTestPrismaClient();
const silent = () => undefined;

const hammersmith = makeAuthority({ LocalAuthorityId: 100, Name: 'Hammersmith and Fulham' });
const camden = makeAuthority({ LocalAuthorityId: 93, Name: 'Camden' });
const aberdeen = makeAuthority({
  LocalAuthorityId: 1,
  Name: 'Aberdeen City',
  RegionName: 'Scotland',
});

function fakeClient(
  authorities: FhrsAuthority[],
  feeds: Record<number, EstablishmentsResult | Error>,
): FhrsClient {
  return {
    listAuthorities: async () => authorities,
    listEstablishments: async (id) => {
      const result = feeds[id];
      if (result === undefined) throw new Error(`Unexpected fetch for authority ${id}`);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

const restaurant = (fhrsId: number, overrides = {}) =>
  makeEstablishment({ FHRSID: fhrsId, BusinessName: `Place ${fhrsId}`, ...overrides });

async function openFhrsIds() {
  const rows = await prisma.restaurant.findMany({
    where: { closedAt: null },
    orderBy: { fhrsId: 'asc' },
  });
  return rows.map((r) => r.fhrsId);
}

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('runImport', () => {
  it('imports relevant establishments from London authorities only', async () => {
    const client = fakeClient([hammersmith, camden, aberdeen], {
      [hammersmith.LocalAuthorityId]: feed([
        restaurant(1),
        restaurant(2, {
          BusinessTypeID: 7840,
          BusinessType: 'Retailers - supermarkets/hypermarkets',
        }),
      ]),
      [camden.LocalAuthorityId]: feed([restaurant(3, { BusinessTypeID: 7844 })]),
      // No feed for Aberdeen: fetching it would throw
    });

    const summary = await runImport({ client, prisma, log: silent });

    expect(summary.failed).toEqual([]);
    expect(summary.results.map((r) => r.authority)).toEqual(['Hammersmith and Fulham', 'Camden']);
    expect(await openFhrsIds()).toEqual([1, 3]);
    const camdenRow = await prisma.restaurant.findUniqueOrThrow({ where: { fhrsId: 3 } });
    expect(camdenRow.localAuthority).toBe('Camden');
  });

  it('is idempotent and only rewrites changed rows', async () => {
    const first = fakeClient([hammersmith], {
      [hammersmith.LocalAuthorityId]: feed([restaurant(1), restaurant(2)]),
    });
    await runImport({ client: first, prisma, log: silent });
    const before = await prisma.restaurant.findUniqueOrThrow({ where: { fhrsId: 1 } });

    const unchanged = await runImport({ client: first, prisma, log: silent });
    expect(unchanged.results[0]?.written).toBe(0);
    expect(await prisma.restaurant.count()).toBe(2);

    const renamed = fakeClient([hammersmith], {
      [hammersmith.LocalAuthorityId]: feed([
        restaurant(1, { BusinessName: 'Renamed', RatingValue: '3' }),
        restaurant(2),
      ]),
    });
    const changed = await runImport({ client: renamed, prisma, log: silent });
    expect(changed.results[0]?.written).toBe(1);

    const after = await prisma.restaurant.findUniqueOrThrow({ where: { fhrsId: 1 } });
    expect(after).toMatchObject({ id: before.id, name: 'Renamed', hygieneRating: '3' });
    expect(await prisma.restaurant.count()).toBe(2);
  });

  it('closes restaurants missing from a complete feed and reopens them when they return', async () => {
    const all = feed([restaurant(1), restaurant(2), restaurant(3)]);
    await runImport({ client: fakeClient([hammersmith], { 100: all }), prisma, log: silent });

    const closedAt = new Date('2026-09-14T04:00:00Z');
    const withoutThree = fakeClient([hammersmith], { 100: feed([restaurant(1), restaurant(2)]) });
    const summary = await runImport({ client: withoutThree, prisma, now: closedAt, log: silent });

    expect(summary.results[0]?.closed).toBe(1);
    expect(await openFhrsIds()).toEqual([1, 2]);
    const closed = await prisma.restaurant.findUniqueOrThrow({ where: { fhrsId: 3 } });
    expect(closed.closedAt).toEqual(closedAt);

    await runImport({ client: fakeClient([hammersmith], { 100: all }), prisma, log: silent });
    expect(await openFhrsIds()).toEqual([1, 2, 3]);
  });

  it('never closes restaurants when the feed is incomplete', async () => {
    await runImport({
      client: fakeClient([hammersmith], { 100: feed([restaurant(1), restaurant(2)]) }),
      prisma,
      log: silent,
    });

    const summary = await runImport({
      client: fakeClient([hammersmith], { 100: feed([restaurant(1)], false) }),
      prisma,
      log: silent,
    });

    expect(summary.results[0]).toMatchObject({ closed: 0, closeSkippedReason: 'incomplete feed' });
    expect(await openFhrsIds()).toEqual([1, 2]);
  });

  it('refuses to close more restaurants than remain in the feed', async () => {
    await runImport({
      client: fakeClient([hammersmith], {
        100: feed([restaurant(1), restaurant(2), restaurant(3)]),
      }),
      prisma,
      log: silent,
    });

    const summary = await runImport({
      client: fakeClient([hammersmith], { 100: feed([restaurant(1)]) }),
      prisma,
      log: silent,
    });

    expect(summary.results[0]?.closed).toBe(0);
    expect(summary.results[0]?.closeSkippedReason).toMatch(/partial feed/);
    expect(await openFhrsIds()).toEqual([1, 2, 3]);
  });

  it('only closes restaurants within the authority being imported', async () => {
    await runImport({
      client: fakeClient([hammersmith, camden], {
        100: feed([restaurant(1), restaurant(2)]),
        93: feed([restaurant(3)]),
      }),
      prisma,
      log: silent,
    });

    await runImport({
      client: fakeClient([hammersmith, camden], {
        100: feed([restaurant(1), restaurant(2)]),
        93: feed([restaurant(4)]),
      }),
      prisma,
      log: silent,
    });

    expect(await openFhrsIds()).toEqual([1, 2, 4]);
  });

  it('records a failing authority and carries on with the rest', async () => {
    const client = fakeClient([hammersmith, camden], {
      100: new Error('FHRS responded 503'),
      93: feed([restaurant(3)]),
    });

    const summary = await runImport({ client, prisma, log: silent });

    expect(summary.failed.map((f) => f.authority)).toEqual(['Hammersmith and Fulham']);
    expect(summary.failed[0]?.error).toBe('FHRS responded 503');
    expect(await openFhrsIds()).toEqual([3]);
  });

  it('imports only the requested authorities', async () => {
    const client = fakeClient([hammersmith, camden], { 93: feed([restaurant(3)]) });

    const summary = await runImport({ client, prisma, authorities: ['camden'], log: silent });

    expect(summary.results.map((r) => r.authority)).toEqual(['Camden']);
  });

  it('writes nothing on a dry run', async () => {
    const client = fakeClient([hammersmith], { 100: feed([restaurant(1)]) });

    const summary = await runImport({ client, dryRun: true, log: silent });

    expect(summary.results[0]?.relevant).toBe(1);
    expect(await prisma.restaurant.count()).toBe(0);
  });

  it('requires a database unless it is a dry run', async () => {
    const client = fakeClient([hammersmith], {});
    await expect(runImport({ client, log: silent })).rejects.toThrow(/prisma is required/);
  });
});

describe('selectLondonAuthorities', () => {
  const all = [hammersmith, camden, aberdeen];

  it('matches by name case-insensitively or by id', () => {
    expect(selectLondonAuthorities(all, ['CAMDEN', '100']).map((a) => a.Name)).toEqual([
      'Hammersmith and Fulham',
      'Camden',
    ]);
  });

  it('rejects authorities outside London or unknown names', () => {
    expect(() => selectLondonAuthorities(all, ['Aberdeen City'])).toThrow(
      /Unknown London authority/,
    );
    expect(() => selectLondonAuthorities(all, ['Narnia'])).toThrow(/Unknown London authority/);
  });
});
