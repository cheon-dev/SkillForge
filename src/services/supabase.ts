import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, SupabaseConfigStatus } from '../types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const supabaseClient: SupabaseClient<Database> | null =
  supabaseUrl && supabaseAnonKey
    ? createClient<Database>(supabaseUrl, supabaseAnonKey)
    : null;

/** The client is null until both public Vite variables are configured. */
export const supabase = supabaseClient;

export const isSupabaseConfigured = (): boolean => supabaseClient !== null;

/** Returns configuration state without exposing URL or key values. */
export const getSupabaseConfigStatus = (): SupabaseConfigStatus => ({
  configured: isSupabaseConfigured(),
});

/** Use this at the boundary of a feature that requires Supabase. */
export const getSupabaseClient = (): SupabaseClient<Database> => {
  if (!supabaseClient) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }

  return supabaseClient;
};
