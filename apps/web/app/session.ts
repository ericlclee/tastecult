'use client';

import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from './supabase';

/** The current Supabase session, kept up to date as people sign in and out. */
export function useSession(): { session: Session | null; ready: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();
    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('Could not read the sign-in session:', error);
      if (active) {
        setSession(data.session);
        setReady(true);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, ready };
}
