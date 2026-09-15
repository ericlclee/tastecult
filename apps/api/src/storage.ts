import { createClient } from '@supabase/supabase-js';

export interface PhotoStorage {
  /** A one-time URL the app uploads the photo to directly, bypassing the API. */
  createUploadUrl(path: string): Promise<{ signedUrl: string; token: string }>;
  /** Where a stored photo can be viewed. The bucket is public: paths are unguessable. */
  publicUrl(path: string): string;
  /** Deletes stored photos; paths that don't exist are ignored. */
  remove(paths: string[]): Promise<void>;
}

export interface SupabasePhotoStorageOptions {
  url: string;
  /** Server-only secret (or legacy service_role) key — never sent to browsers. */
  secretKey: string;
  bucket: string;
}

export function createSupabasePhotoStorage(options: SupabasePhotoStorageOptions): PhotoStorage {
  const client = createClient(options.url, options.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = client.storage.from(options.bucket);

  return {
    async createUploadUrl(path) {
      const { data, error } = await bucket.createSignedUploadUrl(path);
      if (error || !data) {
        throw new Error(
          `Could not create a photo upload URL: ${error?.message ?? 'no data returned'}`,
        );
      }
      return { signedUrl: data.signedUrl, token: data.token };
    },
    publicUrl(path) {
      return bucket.getPublicUrl(path).data.publicUrl;
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket.remove(paths);
      if (error) throw new Error(`Could not delete photos: ${error.message}`);
    },
  };
}
