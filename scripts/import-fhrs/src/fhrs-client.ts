import { z } from 'zod';

export const FHRS_BASE_URL = 'https://api.ratings.food.gov.uk';
export const LONDON_REGION_NAME = 'London';

// Largest page the API serves; London's biggest authority (Westminster) needs two.
const PAGE_SIZE = 5000;

const authoritySchema = z.object({
  LocalAuthorityId: z.number().int(),
  Name: z.string(),
  RegionName: z.string(),
  EstablishmentCount: z.number().int(),
});
export type FhrsAuthority = z.infer<typeof authoritySchema>;

const optionalText = z.string().nullish();
// Coordinates arrive as strings (or null); accept numbers too in case that changes.
const optionalNumeric = z.union([z.string(), z.number()]).nullish();

export const establishmentSchema = z.object({
  FHRSID: z.number().int(),
  BusinessName: z.string(),
  BusinessType: z.string(),
  BusinessTypeID: z.number().int(),
  AddressLine1: optionalText,
  AddressLine2: optionalText,
  AddressLine3: optionalText,
  AddressLine4: optionalText,
  PostCode: optionalText,
  // Usually "0"–"5", but can be text like "Exempt" or "AwaitingInspection"
  RatingValue: optionalNumeric.transform((v) => (v == null ? null : String(v))),
  LocalAuthorityName: z.string(),
  geocode: z.object({ latitude: optionalNumeric, longitude: optionalNumeric }).nullish(),
});
export type FhrsEstablishment = z.infer<typeof establishmentSchema>;

const authoritiesResponseSchema = z.object({ authorities: z.array(z.unknown()) });
const establishmentsPageSchema = z.object({
  establishments: z.array(z.unknown()),
  meta: z.object({ totalCount: z.number().int(), totalPages: z.number().int() }),
});

export class FhrsApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FhrsApiError';
    this.status = status;
  }
}

export interface EstablishmentsResult {
  establishments: FhrsEstablishment[];
  /** Rows that failed validation and were skipped. */
  invalidCount: number;
  /**
   * False when fewer rows arrived than the API reported. Callers must not treat
   * missing businesses as closed when this is false.
   */
  complete: boolean;
}

export interface FhrsClient {
  listAuthorities(): Promise<FhrsAuthority[]>;
  listEstablishments(authorityId: number): Promise<EstablishmentsResult>;
}

export interface FhrsClientOptions {
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
  maxAttempts?: number;
  retryDelayMs?: number;
}

export function createFhrsClient(options: FhrsClientOptions = {}): FhrsClient {
  const {
    fetch: fetchImpl = globalThis.fetch,
    baseUrl = FHRS_BASE_URL,
    maxAttempts = 3,
    retryDelayMs = 2000,
  } = options;

  async function getJson(pathAndQuery: string): Promise<unknown> {
    const url = `${baseUrl}${pathAndQuery}`;
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await fetchImpl(url, {
          headers: { 'x-api-version': '2', Accept: 'application/json' },
        });
      } catch (err) {
        if (attempt >= maxAttempts) {
          throw new FhrsApiError(`FHRS request failed: ${url}`, undefined, { cause: err });
        }
        await sleep(retryDelayMs * attempt);
        continue;
      }

      if (res.ok) return res.json();

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= maxAttempts) {
        throw new FhrsApiError(`FHRS responded ${res.status}: ${url}`, res.status);
      }
      await sleep(retryDelayMs * attempt);
    }
  }

  return {
    async listAuthorities() {
      const body = authoritiesResponseSchema.parse(await getJson('/Authorities'));
      return body.authorities.map((a) => authoritySchema.parse(a));
    },

    async listEstablishments(authorityId) {
      const establishments: FhrsEstablishment[] = [];
      let invalidCount = 0;
      let totalCount = 0;

      for (let page = 1, totalPages = 1; page <= totalPages; page++) {
        const query = new URLSearchParams({
          localAuthorityId: String(authorityId),
          pageSize: String(PAGE_SIZE),
          pageNumber: String(page),
        });
        const body = establishmentsPageSchema.parse(await getJson(`/Establishments?${query}`));
        totalPages = body.meta.totalPages;
        totalCount = body.meta.totalCount;

        // One malformed row shouldn't sink a whole authority's import
        for (const row of body.establishments) {
          const parsed = establishmentSchema.safeParse(row);
          if (parsed.success) establishments.push(parsed.data);
          else invalidCount++;
        }

        // Guard against a bad totalPages value looping forever
        if (body.establishments.length === 0) break;
      }

      return {
        establishments,
        invalidCount,
        complete: establishments.length + invalidCount >= totalCount,
      };
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
