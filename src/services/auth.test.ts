import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  profileUpsert: vi.fn(),
}));

vi.mock('./supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
    from: () => ({ upsert: mocks.profileUpsert }),
  }),
}));

import { getEmailConfirmationRedirectUrl, getFriendlyAuthError, loginUser } from './auth';

describe('getEmailConfirmationRedirectUrl', () => {
  it('uses the deployed app origin instead of a localhost fallback', () => {
    expect(getEmailConfirmationRedirectUrl('https://skill-forge.vercel.app'))
      .toBe('https://skill-forge.vercel.app/');
  });

  it('preserves localhost when registering from a local development app', () => {
    expect(getEmailConfirmationRedirectUrl('http://localhost:5173'))
      .toBe('http://localhost:5173/');
  });
});

describe('loginUser email confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears the local session and rejects unconfirmed accounts', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'student-id', email_confirmed_at: null, user_metadata: {} },
        session: { access_token: 'test-token' },
      },
      error: null,
    });
    mocks.signOut.mockResolvedValue({ error: null });

    await expect(loginUser('student@example.com', 'password'))
      .rejects.toThrow('Email not confirmed');

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.profileUpsert).not.toHaveBeenCalled();
  });

  it('allows confirmed accounts to continue', async () => {
    const user = {
      id: 'student-id',
      email_confirmed_at: '2026-11-09T00:00:00.000Z',
      user_metadata: { full_name: 'Student Example' },
    };
    const data = { user, session: { access_token: 'test-token' } };
    mocks.signInWithPassword.mockResolvedValue({ data, error: null });
    mocks.profileUpsert.mockResolvedValue({ error: null });

    await expect(loginUser('student@example.com', 'password')).resolves.toEqual(data);

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.profileUpsert).toHaveBeenCalledWith(
      { id: 'student-id', full_name: 'Student Example' },
      { onConflict: 'id' },
    );
  });

  it('explains when an unverified session could not be cleared', () => {
    expect(getFriendlyAuthError(new Error('Email not confirmed; the unverified session could not be cleared: network failure')))
      .toContain('Sign out manually');
  });
});
