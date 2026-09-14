import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Referenced literally so Next.js inlines them into the browser bundle at build time
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && publishableKey);

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (!url || !publishableKey) {
    throw new Error(
      'Sign-in is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    );
  }
  client ??= createClient(url, publishableKey, {
    // Magic links are often opened on a different device or browser from the one that
    // asked for them. The PKCE flow only works in the same browser; implicit works anywhere.
    auth: { flowType: 'implicit' },
  });
  return client;
}

/** The signed-in user's access token, sent to the API on every call. */
export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
}
