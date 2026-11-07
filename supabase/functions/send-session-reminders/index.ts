import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface UpcomingSession {
  id: string;
  learner_id: string;
  teacher_id: string;
  scheduled_at: string;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const expectedSecret = Deno.env.get('SESSION_REMINDER_SECRET');
  if (!expectedSecret || request.headers.get('x-cron-secret') !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    console.error('Session reminder function is missing Supabase server configuration.');
    return new Response('Server configuration is incomplete', { status: 500 });
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = Date.now();
  const from = new Date(now + 23 * 60 * 60 * 1000).toISOString();
  const to = new Date(now + 25 * 60 * 60 * 1000).toISOString();

  const { data: sessions, error: sessionError } = await supabase
    .from('learning_sessions')
    .select('id, learner_id, teacher_id, scheduled_at')
    .in('status', ['accepted', 'scheduled'])
    .gte('scheduled_at', from)
    .lte('scheduled_at', to);
  if (sessionError) {
    console.error('Could not load upcoming sessions for reminders.', sessionError.message);
    return new Response('Could not load upcoming sessions', { status: 500 });
  }

  let remindersSent = 0;
  for (const session of (sessions ?? []) as UpcomingSession[]) {
    const participants = [...new Set([session.learner_id, session.teacher_id])];
    const { data: newReminders, error: reminderError } = await supabase
      .from('session_reminders')
      .upsert(
        participants.map((studentId) => ({ session_id: session.id, student_id: studentId })),
        { onConflict: 'session_id,student_id', ignoreDuplicates: true },
      )
      .select('student_id');
    if (reminderError) {
      console.error(`Could not record reminder for session ${session.id}.`, reminderError.message);
      continue;
    }
    if (!newReminders?.length) continue;

    const { error: notificationError } = await supabase.from('notifications').insert(
      newReminders.map(({ student_id }) => ({
        recipient_id: student_id,
        notification_type: 'session_reminder',
        title: 'Learning session tomorrow',
        body: 'You have a learning session scheduled in about 24 hours.',
        entity_id: session.id,
      })),
    );
    if (notificationError) {
      console.error(`Could not create session reminder for ${session.id}.`, notificationError.message);
      const { error: cleanupError } = await supabase
        .from('session_reminders')
        .delete()
        .eq('session_id', session.id)
        .in('student_id', newReminders.map(({ student_id }) => student_id));
      if (cleanupError) {
        console.error(`Could not release reminder claim for session ${session.id}.`, cleanupError.message);
      }
      continue;
    }
    remindersSent += newReminders.length;
  }

  return Response.json({ remindersSent });
});
