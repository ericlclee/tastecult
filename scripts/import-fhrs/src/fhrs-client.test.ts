import { describe, expect, it, vi } from 'vitest';
import { createFhrsClient, FhrsApiError } from './fhrs-client';
import { makeEstablishment } from './test-fixtures';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const page = (rows: unknown[], totalCount: number, totalPages: number) =>
  json({ establishments: rows, meta: { totalCount, totalPages } });

describe('createFhrsClient', () => {
  it('fetches every page and sends the API version header', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        page([makeEstablishment({ FHRSID: 1 }), makeEstablishment({ FHRSID: 2 })], 3, 2),
      )
      .mockResolvedValueOnce(page([makeEstablishment({ FHRSID: 3 })], 3, 2));

    const result = await createFhrsClient({ fetch }).listEstablishments(120);

    expect(result.establishments.map((e) => e.FHRSID)).toEqual([1, 2, 3]);
    expect(result.complete).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    const [secondUrl, init] = fetch.mock.calls[1]!;
    expect(String(secondUrl)).toContain('localAuthorityId=120');
    expect(String(secondUrl)).toContain('pageNumber=2');
    expect(init?.headers).toMatchObject({ 'x-api-version': '2' });
  });

  it('skips malformed rows instead of failing the authority', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(page([makeEstablishment(), { BusinessName: 'no id' }], 2, 1));

    const result = await createFhrsClient({ fetch }).listEstablishments(120);

    expect(result.establishments).toHaveLength(1);
    expect(result.invalidCount).toBe(1);
    expect(result.complete).toBe(true);
  });

  it('reports an incomplete feed when rows are missing', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(page([makeEstablishment()], 5, 1));

    const result = await createFhrsClient({ fetch }).listEstablishments(120);

    expect(result.complete).toBe(false);
  });

  it('retries server errors, then succeeds', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({}, 503))
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(page([makeEstablishment()], 1, 1));

    const result = await createFhrsClient({ fetch, retryDelayMs: 0 }).listEstablishments(120);

    expect(result.establishments).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry client errors', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({}, 404));

    await expect(
      createFhrsClient({ fetch, retryDelayMs: 0 }).listEstablishments(999),
    ).rejects.toMatchObject({ name: 'FhrsApiError', status: 404 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('gives up after the maximum attempts', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({}, 500));

    await expect(
      createFhrsClient({ fetch, retryDelayMs: 0, maxAttempts: 2 }).listAuthorities(),
    ).rejects.toBeInstanceOf(FhrsApiError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
