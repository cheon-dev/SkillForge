import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2.9.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const liveKitUrl = Deno.env.get('LIVEKIT_URL');
  const liveKitApiKey = Deno.env.get('LIVEKIT_API_KEY');
  const liveKitApiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!authorization || !supabaseUrl || !anonKey || !liveKitUrl || !liveKitApiKey || !liveKitApiSecret) {
    return jsonResponse(500, { error: 'Video calling is not configured on the server.' });
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser();
  const user = userData.user;
  if (authError || !user) return jsonResponse(401, { error: 'Sign in to join this call.' });

  let callId: string;
  try {
    const body = await request.json() as { call_id?: unknown };
    if (typeof body.call_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.call_id)) {
      return jsonResponse(400, { error: 'A valid call is required.' });
    }
    callId = body.call_id;
  } catch {
    return jsonResponse(400, { error: 'A valid call is required.' });
  }

  const { data: call, error: callError } = await supabase
    .from('conversation_video_calls')
    .select('id, room_name, started_at')
    .eq('id', callId)
    .is('ended_at', null)
    .gte('started_at', new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString())
    .maybeSingle();

  if (callError) {
    console.error('Could not verify video call membership.', callError.message);
    return jsonResponse(500, { error: 'Could not verify access to this call.' });
  }
  if (!call) return jsonResponse(404, { error: 'This call has ended or is unavailable.' });

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  const accessToken = new AccessToken(liveKitApiKey, liveKitApiSecret, {
    identity: user.id,
    name: profile?.full_name?.trim() || user.email || 'SkillForge student',
    ttl: '1h',
  });
  accessToken.addGrant({
    roomJoin: true,
    room: call.room_name,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return jsonResponse(200, {
    token: await accessToken.toJwt(),
    server_url: liveKitUrl,
  });
});
