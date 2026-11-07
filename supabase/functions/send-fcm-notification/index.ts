import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'npm:jose@5.9.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

interface DatabaseWebhookPayload {
  type?: string;
  table?: string;
  schema?: string;
  record?: {
    id?: string;
    recipient_id?: string;
    title?: string;
    body?: string;
  };
}

interface FirebaseServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const getGoogleAccessToken = async (account: FirebaseServiceAccount): Promise<string> => {
  const key = await importPKCS8(account.private_key.replace(/\\n/g, '\n'), 'RS256');
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const result = await response.json();
  if (!response.ok || typeof result.access_token !== 'string') {
    throw new Error(`Google OAuth token request failed (${response.status}).`);
  }
  return result.access_token;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  const expectedSecret = Deno.env.get('FCM_WEBHOOK_SECRET');
  if (!expectedSecret || request.headers.get('x-webhook-secret') !== expectedSecret) {
    return jsonResponse(401, { error: 'Unauthorized webhook' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const serviceAccountValue = Deno.env.get('FCM_SERVICE_ACCOUNT');
  const publicAppUrl = Deno.env.get('APP_PUBLIC_URL');
  if (!supabaseUrl || !serviceRoleKey || !serviceAccountValue || !publicAppUrl) {
    return jsonResponse(500, { error: 'Push delivery is missing server configuration' });
  }

  let payload: DatabaseWebhookPayload;
  let serviceAccount: FirebaseServiceAccount;
  try {
    payload = await request.json();
    serviceAccount = JSON.parse(serviceAccountValue) as FirebaseServiceAccount;
  } catch {
    return jsonResponse(400, { error: 'Invalid webhook payload or service account configuration' });
  }

  const record = payload.record;
  if (payload.type !== 'INSERT' || payload.table !== 'notifications'
    || !record?.recipient_id || !record.title || !record.body) {
    return jsonResponse(400, { error: 'Expected a notification insert event' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: subscriptions, error: subscriptionError } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('student_id', record.recipient_id);
  if (subscriptionError) {
    console.error('Push token lookup failed', subscriptionError.message);
    return jsonResponse(500, { error: 'Could not load push subscriptions' });
  }
  if (!subscriptions?.length) return jsonResponse(200, { sent: 0 });

  try {
    const accessToken = await getGoogleAccessToken(serviceAccount);
    const clickUrl = new URL('/tabs/notifications', publicAppUrl).toString();
    const responses = await Promise.all(subscriptions.map(async ({ token }) => {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: record.title, body: record.body },
              data: { link: clickUrl },
              webpush: {
                fcm_options: { link: clickUrl },
                notification: { icon: new URL('/favicon.png', publicAppUrl).toString() },
              },
            },
          }),
        },
      );
      if (!response.ok) {
        const detail = await response.text();
        console.error('Firebase push delivery failed', response.status, detail);
        if (detail.includes('"UNREGISTERED"')) {
          const { error: deleteError } = await supabase.from('push_tokens').delete().eq('token', token);
          if (deleteError) {
            console.error('Could not remove expired Firebase token.', deleteError.message);
          }
        }
        return false;
      }
      return true;
    }));

    return jsonResponse(200, { sent: responses.filter(Boolean).length, total: responses.length });
  } catch (error) {
    console.error('Firebase push delivery failed', error);
    return jsonResponse(500, { error: 'Firebase push delivery failed' });
  }
});
