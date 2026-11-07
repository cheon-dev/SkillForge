import { describe, expect, it } from 'vitest';
import type { LearningSession } from '../services/student';
import { getGoogleCalendarUrl } from './calendar';

const session: LearningSession = {
  id: 'session-id',
  learner_id: 'learner-id',
  teacher_id: 'teacher-id',
  skill_id: 'skill-id',
  scheduled_at: '2026-11-07T10:00:00.000Z',
  proposed_scheduled_at: null,
  proposed_by: null,
  duration_minutes: 45,
  status: 'accepted',
  learning_objectives: 'Practice SQL joins',
  notes: null,
  created_at: '2026-11-01T10:00:00.000Z',
  updated_at: '2026-11-01T10:00:00.000Z',
};

describe('getGoogleCalendarUrl', () => {
  it('creates a Google Calendar event with the session duration and details', () => {
    const url = new URL(getGoogleCalendarUrl(session, 'SQL', 'Alex'));

    expect(url.origin).toBe('https://calendar.google.com');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('SkillForge: SQL');
    expect(url.searchParams.get('dates')).toBe('20261107T100000Z/20261107T104500Z');
    expect(url.searchParams.get('details')).toContain('Practice SQL joins');
  });
});
