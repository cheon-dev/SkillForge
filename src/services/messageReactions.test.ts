import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('./supabase', () => ({
  getSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import { toggleMessageReaction } from './messageReactions';

describe('toggleMessageReaction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the authenticated reaction RPC', async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    await expect(toggleMessageReaction('message-id', '❤️')).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith('toggle_message_reaction', {
      p_message_id: 'message-id',
      p_emoji: '❤️',
    });
  });

  it('surfaces database errors', async () => {
    const error = new Error('You are not a member of this conversation');
    mocks.rpc.mockResolvedValue({ error });
    await expect(toggleMessageReaction('message-id', '👍')).rejects.toBe(error);
  });
});
