import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

export interface AuthUser {
  /** Supabase auth user id — also the TasteCult User.id. */
  userId: string;
  email: string | null;
}

export type TokenVerifier = (token: string) => Promise<AuthUser | null>;

export interface TokenVerifierOptions {
  /** e.g. https://<project-ref>.supabase.co — used for the issuer check and the key set URL. */
  supabaseUrl?: string;
  /** Older Supabase projects sign tokens with a shared HS256 secret; used when set. */
  jwtSecret?: string;
  /** Overrides the key set (tests). Defaults to the project's published JWKS. */
  jwks?: JWTVerifyGetKey;
}

/**
 * Verifies Supabase access tokens. Newer projects sign with asymmetric keys published
 * at /auth/v1/.well-known/jwks.json; older ones use a shared secret. Returns null when
 * neither is configured, so the API can still serve public endpoints.
 */
export function createTokenVerifier(options: TokenVerifierOptions): TokenVerifier | null {
  const { supabaseUrl, jwtSecret } = options;
  const verifyOptions = {
    audience: 'authenticated',
    ...(supabaseUrl ? { issuer: new URL('/auth/v1', supabaseUrl).toString() } : {}),
  };

  let verify: (token: string) => Promise<JWTPayload>;
  if (jwtSecret) {
    const secret = new TextEncoder().encode(jwtSecret);
    verify = async (token) => (await jwtVerify(token, secret, verifyOptions)).payload;
  } else {
    const jwks =
      options.jwks ??
      (supabaseUrl
        ? createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', supabaseUrl))
        : undefined);
    if (!jwks) return null;
    verify = async (token) => (await jwtVerify(token, jwks, verifyOptions)).payload;
  }

  return async (token) => {
    let payload: JWTPayload;
    try {
      payload = await verify(token);
    } catch (error) {
      // Expired, forged or foreign tokens just mean "not signed in". Anything else —
      // like the key set being unreachable — is an outage and must surface rather than
      // silently treating everyone as signed out.
      if (error instanceof errors.JOSEError && !(error instanceof errors.JWKSTimeout)) {
        return null;
      }
      throw error;
    }
    if (typeof payload.sub !== 'string' || payload.sub === '') return null;
    return {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
    };
  };
}

/** Extracts the token from an `Authorization: Bearer <token>` header. */
export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}
