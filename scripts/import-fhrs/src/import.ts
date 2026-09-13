import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@tastecult/db';
import { LONDON_REGION_NAME, type FhrsAuthority, type FhrsClient } from './fhrs-client';
import { toRestaurantRecord, type RestaurantRecord } from './transform';

const UPSERT_BATCH_SIZE = 1000;

export interface ImportOptions {
  client: FhrsClient;
  /** Required unless dryRun is set. */
  prisma?: PrismaClient;
  /** London authority names or FHRS ids; all 33 London authorities when omitted. */
  authorities?: readonly string[];
  dryRun?: boolean;
  now?: Date;
  log?: (message: string) => void;
}

export interface AuthorityImportResult {
  authorityId: number;
  authority: string;
  fetched: number;
  invalid: number;
  relevant: number;
  /** Rows inserted, changed, or reopened — unchanged rows aren't rewritten. */
  written: number;
  closed: number;
  closeSkippedReason: string | null;
  error: string | null;
}

export interface ImportSummary {
  results: AuthorityImportResult[];
  failed: AuthorityImportResult[];
}

export async function runImport(options: ImportOptions): Promise<ImportSummary> {
  const { client, prisma, dryRun = false, now = new Date(), log = console.log } = options;
  if (!dryRun && !prisma) throw new Error('prisma is required unless dryRun is set');

  const authorities = selectLondonAuthorities(await client.listAuthorities(), options.authorities);
  if (authorities.length === 0) throw new Error('FHRS returned no London authorities');

  const results: AuthorityImportResult[] = [];

  // Sequential on purpose: keeps load on the public FHRS API polite.
  for (const authority of authorities) {
    const result: AuthorityImportResult = {
      authorityId: authority.LocalAuthorityId,
      authority: authority.Name,
      fetched: 0,
      invalid: 0,
      relevant: 0,
      written: 0,
      closed: 0,
      closeSkippedReason: null,
      error: null,
    };

    try {
      const feed = await client.listEstablishments(authority.LocalAuthorityId);
      result.fetched = feed.establishments.length;
      result.invalid = feed.invalidCount;

      // Scope rows by the authority we requested, so the close step below
      // matches exactly what this run imported.
      const records = dedupeByFhrsId(
        feed.establishments
          .map((e) => toRestaurantRecord(e, authority.Name))
          .filter((r): r is RestaurantRecord => r !== null),
      );
      result.relevant = records.length;

      if (!dryRun && prisma) {
        result.written = await upsertRestaurants(prisma, records, now);
        const closing = await closeMissingRestaurants(
          prisma,
          authority.Name,
          records,
          feed.complete,
          now,
        );
        result.closed = closing.closed;
        result.closeSkippedReason = closing.skippedReason;
      }

      log(formatResult(result, dryRun));
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      log(`✗ ${authority.Name}: ${result.error}`);
    }

    results.push(result);
  }

  return { results, failed: results.filter((r) => r.error !== null) };
}

export function selectLondonAuthorities(
  all: readonly FhrsAuthority[],
  filters?: readonly string[],
): FhrsAuthority[] {
  const london = all.filter((a) => a.RegionName === LONDON_REGION_NAME);
  if (!filters || filters.length === 0) return london;

  const matches = (a: FhrsAuthority, filter: string) =>
    String(a.LocalAuthorityId) === filter || a.Name.toLowerCase() === filter;

  const wanted = filters.map((f) => f.trim().toLowerCase());
  const unmatched = wanted.filter((w) => !london.some((a) => matches(a, w)));
  if (unmatched.length > 0) {
    throw new Error(`Unknown London authority: ${unmatched.join(', ')}`);
  }
  return london.filter((a) => wanted.some((w) => matches(a, w)));
}

function dedupeByFhrsId(records: RestaurantRecord[]): RestaurantRecord[] {
  return [...new Map(records.map((r) => [r.fhrsId, r])).values()];
}

async function upsertRestaurants(
  prisma: PrismaClient,
  records: RestaurantRecord[],
  now: Date,
): Promise<number> {
  let written = 0;

  for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
    // Ids are generated here because raw SQL bypasses Prisma's cuid() default;
    // they're opaque strings, so UUIDs coexist fine with cuids.
    const batch = records.slice(i, i + UPSERT_BATCH_SIZE).map((r) => ({ id: randomUUID(), ...r }));

    // Batched via jsonb_to_recordset: one round trip per 1,000 rows instead of
    // one per row. The WHERE clause skips rewriting unchanged rows.
    written += await prisma.$executeRaw`
      INSERT INTO "Restaurant" (
        "id", "fhrsId", "name", "address", "postcode", "latitude", "longitude",
        "businessType", "businessTypeId", "localAuthority", "hygieneRating",
        "closedAt", "createdAt", "updatedAt"
      )
      SELECT
        r."id", r."fhrsId", r."name", r."address", r."postcode", r."latitude", r."longitude",
        r."businessType", r."businessTypeId", r."localAuthority", r."hygieneRating",
        NULL, ${now}::timestamp(3), ${now}::timestamp(3)
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS r(
        "id" text, "fhrsId" int, "name" text, "address" text, "postcode" text,
        "latitude" double precision, "longitude" double precision,
        "businessType" text, "businessTypeId" int, "localAuthority" text, "hygieneRating" text
      )
      ON CONFLICT ("fhrsId") DO UPDATE SET
        "name" = EXCLUDED."name",
        "address" = EXCLUDED."address",
        "postcode" = EXCLUDED."postcode",
        "latitude" = EXCLUDED."latitude",
        "longitude" = EXCLUDED."longitude",
        "businessType" = EXCLUDED."businessType",
        "businessTypeId" = EXCLUDED."businessTypeId",
        "localAuthority" = EXCLUDED."localAuthority",
        "hygieneRating" = EXCLUDED."hygieneRating",
        "closedAt" = NULL,
        "updatedAt" = EXCLUDED."updatedAt"
      WHERE (
        "Restaurant"."name", "Restaurant"."address", "Restaurant"."postcode",
        "Restaurant"."latitude", "Restaurant"."longitude", "Restaurant"."businessType",
        "Restaurant"."businessTypeId", "Restaurant"."localAuthority",
        "Restaurant"."hygieneRating", "Restaurant"."closedAt"
      ) IS DISTINCT FROM (
        EXCLUDED."name", EXCLUDED."address", EXCLUDED."postcode",
        EXCLUDED."latitude", EXCLUDED."longitude", EXCLUDED."businessType",
        EXCLUDED."businessTypeId", EXCLUDED."localAuthority",
        EXCLUDED."hygieneRating", EXCLUDED."closedAt"
      )
    `;
  }

  return written;
}

/**
 * Soft-closes restaurants that vanished from this authority's feed. Logs keep
 * referencing closed restaurants, so rows are never deleted. Skipped whenever
 * the feed looks untrustworthy, because a bad API response must not mass-close
 * a borough.
 */
async function closeMissingRestaurants(
  prisma: PrismaClient,
  authorityName: string,
  records: RestaurantRecord[],
  feedComplete: boolean,
  now: Date,
): Promise<{ closed: number; skippedReason: string | null }> {
  if (!feedComplete) return { closed: 0, skippedReason: 'incomplete feed' };
  if (records.length === 0) return { closed: 0, skippedReason: 'feed had no restaurants' };

  const missingWhere = {
    localAuthority: authorityName,
    closedAt: null,
    fhrsId: { notIn: records.map((r) => r.fhrsId) },
  };

  const missing = await prisma.restaurant.count({ where: missingWhere });
  if (missing > records.length) {
    return {
      closed: 0,
      skippedReason: `would close ${missing} but only ${records.length} remain — looks like a partial feed`,
    };
  }
  if (missing === 0) return { closed: 0, skippedReason: null };

  const { count } = await prisma.restaurant.updateMany({
    where: missingWhere,
    data: { closedAt: now },
  });
  return { closed: count, skippedReason: null };
}

function formatResult(r: AuthorityImportResult, dryRun: boolean): string {
  const parts = [`${r.relevant} restaurants`];
  if (r.invalid > 0) parts.push(`${r.invalid} invalid rows skipped`);
  if (!dryRun) parts.push(`${r.written} written`, `${r.closed} closed`);
  if (r.closeSkippedReason) parts.push(`closing skipped: ${r.closeSkippedReason}`);
  return `✓ ${r.authority}: ${parts.join(', ')}`;
}
