import { describe, expect, it } from 'vitest';
import { isLocalDatabaseUrl } from './safety';

describe('isLocalDatabaseUrl', () => {
  it('allows databases on this machine', () => {
    expect(isLocalDatabaseUrl('postgresql://tastecult:tastecult@localhost:54329/tastecult')).toBe(
      true,
    );
    expect(isLocalDatabaseUrl('postgresql://u:p@127.0.0.1:5432/db')).toBe(true);
    expect(isLocalDatabaseUrl('postgresql://u:p@[::1]:5432/db')).toBe(true);
  });

  it('refuses hosted databases and garbage', () => {
    expect(
      isLocalDatabaseUrl(
        'postgresql://postgres.abc:pw@aws-0-eu-west-2.pooler.supabase.com:5432/postgres',
      ),
    ).toBe(false);
    expect(isLocalDatabaseUrl('postgresql://u:p@localhost.evil.example:5432/db')).toBe(false);
    expect(isLocalDatabaseUrl('not a url')).toBe(false);
  });
});
