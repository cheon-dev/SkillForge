import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('./supabase', () => ({
  getSupabaseClient: () => ({ functions: { invoke: mocks.invoke } }),
}));

import { getLiveKitCallCredentials } from './videoCalls';

describe('getLiveKitCallCredentials', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requests a server-issued token for the selected call', async () => {
    mocks.invoke.mockResolvedValue({
      data: { token: 'signed-token', server_url: 'wss://calls.example' },
      error: null,
    });

    await expect(getLiveKitCallCredentials('call-id')).resolves.toEqual({
      token: 'signed-token',
      server_url: 'wss://calls.example',
    });
    expect(mocks.invoke).toHaveBeenCalledWith('livekit-call-token', {
      body: { call_id: 'call-id' },
    });
  });

  it('does not silently accept an invalid token response', async () => {
    mocks.invoke.mockResolvedValue({ data: { token: '' }, error: null });
    await expect(getLiveKitCallCredentials('call-id'))
      .rejects.toThrow('returned an invalid response');
  });
});
