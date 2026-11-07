import type { LearningSession } from '../services/student';

const toGoogleCalendarDate = (date: Date): string =>
  date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export const getGoogleCalendarUrl = (
  session: LearningSession,
  skillName: string,
  peerName: string,
): string => {
  const start = new Date(session.scheduled_at);
  const end = new Date(start.getTime() + session.duration_minutes * 60_000);
  const details = [
    `SkillForge learning session with ${peerName}.`,
    session.learning_objectives ? `Learning objectives: ${session.learning_objectives}` : '',
    'Manage this session in SkillForge.',
  ].filter(Boolean).join('\n\n');
  const parameters = new URLSearchParams({
    action: 'TEMPLATE',
    text: `SkillForge: ${skillName}`,
    dates: `${toGoogleCalendarDate(start)}/${toGoogleCalendarDate(end)}`,
    details,
  });

  return `https://calendar.google.com/calendar/render?${parameters.toString()}`;
};
