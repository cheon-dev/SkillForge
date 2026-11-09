import { getSupabaseClient } from './supabase';

export const toggleMessageReaction = async (messageId: string, emoji: string): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('toggle_message_reaction', {
    p_message_id: messageId,
    p_emoji: emoji,
  });
  if (error) throw error;
};
