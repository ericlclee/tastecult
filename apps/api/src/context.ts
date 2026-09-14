import { getPrisma, type PrismaClient } from '@tastecult/db';
import { bearerToken, createTokenVerifier, type AuthUser, type TokenVerifier } from './auth';
import { createSupabasePhotoStorage, type PhotoStorage } from './storage';

export interface Context {
  prisma: PrismaClient;
  /** The signed-in Supabase user; null for anonymous requests and invalid tokens. */
  auth: AuthUser | null;
  /** Null when Supabase Storage isn't configured, e.g. local development without keys. */
  storage: PhotoStorage | null;
}

// `|| undefined` treats blank .env lines (SUPABASE_URL=) as unset
const env = (name: string) => process.env[name] || undefined;

let verifier: TokenVerifier | null | undefined;
let storage: PhotoStorage | null | undefined;

function getVerifier(): TokenVerifier | null {
  verifier ??= createTokenVerifier({
    supabaseUrl: env('SUPABASE_URL'),
    jwtSecret: env('SUPABASE_JWT_SECRET'),
  });
  return verifier;
}

function getStorage(): PhotoStorage | null {
  if (storage === undefined) {
    const url = env('SUPABASE_URL');
    const secretKey = env('SUPABASE_SECRET_KEY') ?? env('SUPABASE_SERVICE_ROLE_KEY');
    storage =
      url && secretKey
        ? createSupabasePhotoStorage({
            url,
            secretKey,
            bucket: env('SUPABASE_PHOTOS_BUCKET') ?? 'dish-photos',
          })
        : null;
  }
  return storage;
}

export async function createContext({ req }: { req: Request }): Promise<Context> {
  const token = bearerToken(req.headers.get('authorization'));
  const verify = token ? getVerifier() : null;
  return {
    prisma: getPrisma(),
    auth: token && verify ? await verify(token) : null,
    storage: getStorage(),
  };
}
