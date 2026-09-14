import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { bearerToken, createTokenVerifier } from './auth';

const supabaseUrl = 'https://abcdefghijkl.supabase.co';
const issuer = `${supabaseUrl}/auth/v1`;
const userId = '11111111-1111-4111-8111-111111111111';
const now = () => Math.floor(Date.now() / 1000);

function claims() {
  return new SignJWT({ email: 'eric@example.com', role: 'authenticated' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime('1h');
}

describe('createTokenVerifier with a shared secret', () => {
  const secret = 'a-test-secret-that-is-long-enough-for-hs256-signing';
  const verify = createTokenVerifier({ supabaseUrl, jwtSecret: secret })!;
  const sign = (jwt: SignJWT, key = secret) =>
    jwt.setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(key));

  it('accepts a valid token', async () => {
    expect(await verify(await sign(claims()))).toEqual({ userId, email: 'eric@example.com' });
  });

  it('rejects a token signed with a different secret', async () => {
    expect(
      await verify(await sign(claims(), 'some-other-secret-that-is-also-long-enough')),
    ).toBeNull();
  });

  it('rejects an expired token', async () => {
    const expired = claims()
      .setIssuedAt(now() - 7200)
      .setExpirationTime(now() - 3600);
    expect(await verify(await sign(expired))).toBeNull();
  });

  it('rejects the wrong audience or issuer', async () => {
    expect(await verify(await sign(claims().setAudience('anon')))).toBeNull();
    expect(await verify(await sign(claims().setIssuer('https://evil.example/auth/v1')))).toBeNull();
  });

  it('rejects a token without a subject', async () => {
    const noSubject = new SignJWT({})
      .setAudience('authenticated')
      .setIssuer(issuer)
      .setExpirationTime('1h');
    expect(await verify(await sign(noSubject))).toBeNull();
  });
});

describe('createTokenVerifier with a published key set', () => {
  it('accepts tokens signed by a published key and rejects forgeries', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
    const impostor = await generateKeyPair('ES256', { extractable: true });
    const jwk = { ...(await exportJWK(publicKey)), kid: 'key-1', alg: 'ES256' };
    const verify = createTokenVerifier({ supabaseUrl, jwks: createLocalJWKSet({ keys: [jwk] }) })!;

    const genuine = await claims()
      .setProtectedHeader({ alg: 'ES256', kid: 'key-1' })
      .sign(privateKey);
    const forged = await claims()
      .setProtectedHeader({ alg: 'ES256', kid: 'key-1' })
      .sign(impostor.privateKey);

    expect(await verify(genuine)).toEqual({ userId, email: 'eric@example.com' });
    expect(await verify(forged)).toBeNull();
  });

  it('is unavailable without a Supabase URL or secret', () => {
    expect(createTokenVerifier({})).toBeNull();
  });
});

describe('bearerToken', () => {
  it('extracts the token from a Bearer header', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer abc')).toBe('abc');
  });

  it('ignores missing or malformed headers', () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
  });
});
