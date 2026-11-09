import { getSupabaseClient } from './supabase';

export interface ConversationVideoCall {
  id: string;
  conversation_id: string;
  room_name: string;
  started_by: string;
  started_at: string;
  ended_at: string | null;
  ended_by: string | null;
}

export interface LiveKitCallCredentials {
  token: string;
  server_url: string;
}

export const getActiveVideoCall = async (
  conversationId: string,
): Promise<ConversationVideoCall | null> => {
  const recentAfter = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { data, error } = await getSupabaseClient()
    .from('conversation_video_calls')
    .select('*')
    .eq('conversation_id', conversationId)
    .is('ended_at', null)
    .gte('started_at', recentAfter)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const startConversationVideoCall = async (conversationId: string): Promise<string> => {
  const { data, error } = await getSupabaseClient().rpc('start_conversation_video_call', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  return data;
};

export const endConversationVideoCall = async (callId: string): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('end_conversation_video_call', {
    p_call_id: callId,
  });
  if (error) throw error;
};

export const getLiveKitCallCredentials = async (
  callId: string,
): Promise<LiveKitCallCredentials> => {
  const { data, error } = await getSupabaseClient().functions.invoke('livekit-call-token', {
    body: { call_id: callId },
  });
  if (error) throw error;
  if (
    typeof data?.token !== 'string'
    || typeof data?.server_url !== 'string'
  ) {
    throw new Error('The video call service returned an invalid response.');
  }
  return { token: data.token, server_url: data.server_url };
};
