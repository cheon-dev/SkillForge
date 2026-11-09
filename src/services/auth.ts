import type { Session, User } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { getSupabaseClient } from './supabase';

type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];

export interface RegisterResult {
  user: User;
  session: Session | null;
  requiresEmailConfirmation: boolean;
}

const getUserFullName = (user: User): string | null => {
  const fullName = user.user_metadata?.full_name;
  return typeof fullName === 'string' && fullName.trim() ? fullName.trim() : null;
};

export const getEmailConfirmationRedirectUrl = (origin: string): string =>
  new URL('/', origin).toString();

const ensureProfile = async (user: User, fullName = getUserFullName(user)) => {
  const profile: ProfileInsert = {
    id: user.id,
    full_name: fullName,
  };
  const { error } = await getSupabaseClient().from('profiles').upsert(profile, {
    onConflict: 'id',
  });

  if (error) {
    throw new Error('Your account was created, but your profile could not be initialized.');
  }
};

export const registerUser = async (
  fullName: string,
  email: string,
  password: string,
): Promise<RegisterResult> => {
  const { data, error } = await getSupabaseClient().auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName.trim() },
      emailRedirectTo: getEmailConfirmationRedirectUrl(window.location.origin),
    },
  });

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error('Registration did not return a user account.');
  }

  if (data.session) {
    await ensureProfile(data.user, fullName);
  }

  return {
    user: data.user,
    session: data.session,
    requiresEmailConfirmation: !data.session,
  };
};

export const loginUser = async (email: string, password: string) => {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  if (data.user) {
    await ensureProfile(data.user);
  }

  return data;
};

export const logoutUser = async () => {
  const { error } = await getSupabaseClient().auth.signOut();

  if (error) {
    throw error;
  }
};

export const getFriendlyAuthError = (error: unknown): string => {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('email not confirmed')) {
    return 'Please confirm your email address before signing in.';
  }

  if (message.includes('invalid login credentials')) {
    return 'The email or password is incorrect.';
  }

  if (message.includes('already registered')) {
    return 'An account with this email already exists.';
  }

  if (message.includes('password')) {
    return 'Please use a valid password and try again.';
  }

  return 'Something went wrong. Please try again.';
};
