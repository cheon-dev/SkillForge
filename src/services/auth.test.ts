import { describe, expect, it } from 'vitest';
import { getEmailConfirmationRedirectUrl } from './auth';

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
