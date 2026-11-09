import { getSupabaseClient } from './supabase';
import type {
  CreditTransactionType,
  Database,
  LearningGoalPriority,
  LearningGoalStatus,
  ProficiencyLevel,
  Json,
} from '../types/supabase';

type Tables = Database['public']['Tables'];
export type Profile = Tables['profiles']['Row'];
export type Skill = Tables['skills']['Row'];
export type StudentSkill = Tables['student_skills']['Row'];
export type LearningGoal = Tables['learning_goals']['Row'];
export type LearningSession = Tables['learning_sessions']['Row'];
export type SessionMission = Tables['session_missions']['Row'];
export type SessionActivity = Tables['session_activities']['Row'];
export type ActivityAttempt = Tables['activity_attempts']['Row'];

export interface SessionPlanActivityInput {
  title: string;
  activity_type: SessionActivity['activity_type'];
  instructions: string | null;
  max_xp: number;
}

export interface ActivityReviewResult {
  attempt_id: string;
  student_id: string;
  xp_awarded: number;
  total_xp: number;
}

export interface LearningSessionRequest {
  teacher_id: string;
  skill_id: string;
  scheduled_at: string;
  duration_minutes: number;
  learning_objectives: string | null;
}

export interface CreditTransactionSummary {
  id: string;
  amount: number;
  transaction_type: CreditTransactionType;
  description: string;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

export interface CreditSummary {
  balance: number;
  transactions: CreditTransactionSummary[];
}

export interface ProfileUpdate {
  full_name: string | null;
  course: string | null;
  year_level: number | null;
  bio: string | null;
  avatar_url: string | null;
}

export interface StudentSkillInput {
  skill_id: string;
  proficiency_level: ProficiencyLevel;
  years_experience: number;
  is_teachable: boolean;
}

export interface LearningGoalInput {
  skill_id: string;
  current_level: ProficiencyLevel;
  target_level: ProficiencyLevel;
  goal_description: string | null;
  priority: LearningGoalPriority;
  status: LearningGoalStatus;
}

export interface DiscoverableSkill {
  association: StudentSkill;
  skill: Skill;
}

export interface DiscoverableStudent {
  profile: Profile;
  skills: DiscoverableSkill[];
}

export const getStudentProfile = async (studentId: string): Promise<Profile | null> => {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('*')
    .eq('id', studentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

export const saveStudentProfile = async (
  studentId: string,
  profile: ProfileUpdate,
): Promise<Profile> => {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .upsert(
      {
        id: studentId,
        ...profile,
      },
      { onConflict: 'id' },
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const getSkillCatalog = async (): Promise<Skill[]> => {
  const { data, error } = await getSupabaseClient()
    .from('skills')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
};

export interface SelfPacedLessonProgress {
  lesson_key: string;
  completed_at: string;
}

export const getSelfPacedLessonProgress = async (
  studentId: string,
): Promise<SelfPacedLessonProgress[]> => {
  const { data, error } = await getSupabaseClient()
    .from('self_paced_lesson_progress')
    .select('lesson_key, completed_at')
    .eq('student_id', studentId)
    .order('completed_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
};

export const completeSelfPacedLesson = async (
  studentId: string,
  lessonKey: string,
): Promise<SelfPacedLessonProgress> => {
  const { data, error } = await getSupabaseClient()
    .from('self_paced_lesson_progress')
    .upsert(
      { student_id: studentId, lesson_key: lessonKey },
      { onConflict: 'student_id,lesson_key' },
    )
    .select('lesson_key, completed_at')
    .single();

  if (error) throw error;
  return data;
};

export const getStudentSkills = async (studentId: string): Promise<StudentSkill[]> => {
  const { data, error } = await getSupabaseClient()
    .from('student_skills')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const addStudentSkill = async (
  studentId: string,
  input: StudentSkillInput,
): Promise<StudentSkill> => {
  const { data, error } = await getSupabaseClient()
    .from('student_skills')
    .insert({
      student_id: studentId,
      ...input,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const updateStudentSkill = async (
  studentId: string,
  associationId: string,
  input: Omit<StudentSkillInput, 'skill_id'>,
): Promise<StudentSkill> => {
  const { data, error } = await getSupabaseClient()
    .from('student_skills')
    .update(input)
    .eq('id', associationId)
    .eq('student_id', studentId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const removeStudentSkill = async (
  studentId: string,
  associationId: string,
): Promise<void> => {
  const { error } = await getSupabaseClient()
    .from('student_skills')
    .delete()
    .eq('id', associationId)
    .eq('student_id', studentId);

  if (error) {
    throw error;
  }
};

export const getLearningGoals = async (studentId: string): Promise<LearningGoal[]> => {
  const { data, error } = await getSupabaseClient()
    .from('learning_goals')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const addLearningGoal = async (
  studentId: string,
  input: LearningGoalInput,
): Promise<LearningGoal> => {
  const { data, error } = await getSupabaseClient()
    .from('learning_goals')
    .insert({
      student_id: studentId,
      ...input,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const updateLearningGoal = async (
  studentId: string,
  goalId: string,
  input: LearningGoalInput,
): Promise<LearningGoal> => {
  const { data, error } = await getSupabaseClient()
    .from('learning_goals')
    .update(input)
    .eq('id', goalId)
    .eq('student_id', studentId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const removeLearningGoal = async (studentId: string, goalId: string): Promise<void> => {
  const { error } = await getSupabaseClient()
    .from('learning_goals')
    .delete()
    .eq('id', goalId)
    .eq('student_id', studentId);

  if (error) {
    throw error;
  }
};

export const getDiscoverableStudents = async (
  viewerId: string,
): Promise<DiscoverableStudent[]> => {
  const client = getSupabaseClient();
  const { data: associations, error: associationError } = await client
    .from('student_skills')
    .select('*')
    .eq('is_teachable', true)
    .neq('student_id', viewerId)
    .order('created_at', { ascending: true });

  if (associationError) {
    throw associationError;
  }

  if (!associations || associations.length === 0) {
    return [];
  }

  const studentIds = [...new Set(associations.map((association) => association.student_id))];
  const skillIds = [...new Set(associations.map((association) => association.skill_id))];
  const [{ data: profiles, error: profileError }, { data: skills, error: skillError }] = await Promise.all([
    client.from('profiles').select('*').in('id', studentIds),
    client.from('skills').select('*').in('id', skillIds),
  ]);

  if (profileError) {
    throw profileError;
  }

  if (skillError) {
    throw skillError;
  }

  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const skillsById = new Map((skills ?? []).map((skill) => [skill.id, skill]));
  const studentsById = new Map<string, DiscoverableStudent>();

  associations.forEach((association) => {
    const profile = profilesById.get(association.student_id);
    const skill = skillsById.get(association.skill_id);

    if (!profile || !skill) {
      return;
    }

    const existing = studentsById.get(profile.id);
    const discoverableSkill = { association, skill };

    if (existing) {
      existing.skills.push(discoverableSkill);
      return;
    }

    studentsById.set(profile.id, {
      profile,
      skills: [discoverableSkill],
    });
  });

  return [...studentsById.values()].sort((left, right) => {
    const leftName = left.profile.full_name ?? '';
    const rightName = right.profile.full_name ?? '';
    return leftName.localeCompare(rightName);
  });
};

export const requestLearningSession = async (
  request: LearningSessionRequest,
): Promise<LearningSession> => {
  const { data, error } = await getSupabaseClient().rpc('request_learning_session', {
    p_teacher_id: request.teacher_id,
    p_skill_id: request.skill_id,
    p_scheduled_at: request.scheduled_at,
    p_duration_minutes: request.duration_minutes,
    p_learning_objectives: request.learning_objectives,
  });

  if (error) throw error;
  return data as unknown as LearningSession;
};

export const getMyCredits = async (): Promise<CreditSummary> => {
  const { data, error } = await getSupabaseClient().rpc('get_my_credits');

  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new Error(
        'The Skill Credits database function is missing. Apply supabase/migrations/20261103110000_skill_credits.sql to the Supabase project configured for this app, then reload.',
      );
    }

    throw error;
  }

  const summary = (data ?? {}) as Partial<CreditSummary>;
  return {
    balance: typeof summary.balance === 'number' ? summary.balance : 0,
    transactions: Array.isArray(summary.transactions) ? summary.transactions : [],
  };
};

export const getStudentLearningSessions = async (studentId: string): Promise<LearningSession[]> => {
  const { data, error } = await getSupabaseClient()
    .from('learning_sessions')
    .select('*')
    .or(`learner_id.eq.${studentId},teacher_id.eq.${studentId}`)
    .order('scheduled_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
};

export const getStudentNames = async (studentIds: string[]): Promise<Map<string, string>> => {
  if (studentIds.length === 0) return new Map();

  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('id, full_name')
    .in('id', studentIds);

  if (error) throw error;
  return new Map((data ?? []).map((profile) => [profile.id, profile.full_name ?? 'SkillForge student']));
};

export const respondToLearningRequest = async (
  sessionId: string,
  accept: boolean,
): Promise<LearningSession> => {
  const { data, error } = await getSupabaseClient()
    .rpc('respond_to_learning_request', {
      p_session_id: sessionId,
      p_accept: accept,
    });

  if (error) throw error;
  return data;
};

export const cancelLearningSession = async (sessionId: string): Promise<LearningSession> => {
  const { data, error } = await getSupabaseClient()
    .rpc('cancel_learning_session', { p_session_id: sessionId });

  if (error) throw error;
  return data;
};

export const proposeLearningSessionTime = async (
  sessionId: string,
  scheduledAt: string,
): Promise<LearningSession> => {
  const { data, error } = await getSupabaseClient()
    .rpc('propose_learning_session_time', {
      p_session_id: sessionId,
      p_scheduled_at: scheduledAt,
    });

  if (error) throw error;
  return data;
};

export const respondToSessionTimeChange = async (
  sessionId: string,
  accept: boolean,
): Promise<LearningSession> => {
  const { data, error } = await getSupabaseClient()
    .rpc('respond_to_session_time_change', {
      p_session_id: sessionId,
      p_accept: accept,
    });

  if (error) throw error;
  return data;
};

export const createSessionLearningPlan = async (
  sessionId: string,
  title: string,
  description: string,
  learningGoal: string,
  activities: SessionPlanActivityInput[],
): Promise<string> => {
  const { data, error } = await getSupabaseClient().rpc('create_session_learning_plan', {
    p_session_id: sessionId,
    p_title: title,
    p_description: description || null,
    p_learning_goal: learningGoal || null,
    p_activities: activities as unknown as Json,
  });

  if (error) throw error;
  return data;
};

export const getSessionMissions = async (sessionIds: string[]): Promise<SessionMission[]> => {
  if (sessionIds.length === 0) return [];
  const { data, error } = await getSupabaseClient()
    .from('session_missions')
    .select('*')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
};

export const getActivitiesForMissions = async (missionIds: string[]): Promise<SessionActivity[]> => {
  if (missionIds.length === 0) return [];
  const { data, error } = await getSupabaseClient()
    .from('session_activities')
    .select('*')
    .in('mission_id', missionIds)
    .order('sequence_number', { ascending: true });

  if (error) throw error;
  return data ?? [];
};

export const getActivityAttempts = async (activityIds: string[]): Promise<ActivityAttempt[]> => {
  if (activityIds.length === 0) return [];
  const { data, error } = await getSupabaseClient()
    .from('activity_attempts')
    .select('*')
    .in('activity_id', activityIds)
    .order('attempt_number', { ascending: true });

  if (error) throw error;
  return data ?? [];
};

export const startSessionMission = async (missionId: string): Promise<SessionMission> => {
  const { data, error } = await getSupabaseClient().rpc('start_session_mission', {
    p_mission_id: missionId,
  });

  if (error) throw error;
  return data;
};

export const completeSessionMission = async (missionId: string): Promise<SessionMission> => {
  const { data, error } = await getSupabaseClient().rpc('complete_session_mission', {
    p_mission_id: missionId,
  });

  if (error) throw error;
  return data;
};

export const completeLearningSession = async (sessionId: string): Promise<LearningSession> => {
  const { data, error } = await getSupabaseClient().rpc('complete_learning_session', {
    p_session_id: sessionId,
  });

  if (error) throw error;
  return data;
};

export const submitActivityAttempt = async (
  activityId: string,
  studentId: string,
  attemptNumber: number,
  answer: Json,
): Promise<ActivityAttempt> => {
  const { data, error } = await getSupabaseClient()
    .from('activity_attempts')
    .insert({
      activity_id: activityId,
      student_id: studentId,
      attempt_number: attemptNumber,
      answer,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const reviewActivityAttempt = async (
  attemptId: string,
  score: number,
  passed: boolean,
  teacherFeedback: string,
): Promise<ActivityReviewResult> => {
  const { data, error } = await getSupabaseClient().rpc('review_activity_attempt', {
    p_attempt_id: attemptId,
    p_score: score,
    p_passed: passed,
    p_teacher_feedback: teacherFeedback || null,
  });

  if (error) throw error;
  return data[0];
};

export interface PassportSkill {
  skill_id: string;
  name: string;
  category: string;
  proficiency_level: ProficiencyLevel;
  years_experience: number | null;
  is_teachable: boolean;
  completed_sessions: number;
  sessions_taught: number;
  verified_activities: number;
  challenges_passed: number;
  endorsements_received: number;
  xp_earned: number;
}

export interface PassportEndorsement {
  id: string;
  skill_name: string;
  comment: string | null;
  created_at: string;
  endorsed_by_name: string | null;
}

export interface PassportAchievement {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  criteria: string | null;
  earned: boolean;
  earned_at: string | null;
}

export interface SkillPassport {
  profile: {
    full_name: string | null;
    course: string | null;
    year_level: number | null;
    bio: string | null;
    avatar_url: string | null;
  } | null;
  xp: { total_xp: number; level: number };
  totals: {
    skills: number;
    completed_sessions: number;
    sessions_taught: number;
    verified_activities: number;
    challenges_passed: number;
    endorsements_received: number;
  };
  skills: PassportSkill[];
  endorsements: PassportEndorsement[];
  achievements: PassportAchievement[];
}

const isPassport = (value: unknown): value is SkillPassport => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SkillPassport>;
  return (
    Array.isArray(candidate.skills) &&
    Array.isArray(candidate.endorsements) &&
    Array.isArray(candidate.achievements) &&
    typeof candidate.totals === 'object' &&
    candidate.totals !== null &&
    typeof candidate.xp === 'object' &&
    candidate.xp !== null
  );
};

export const getSkillPassport = async (): Promise<SkillPassport> => {
  const { data, error } = await getSupabaseClient().rpc('get_skill_passport');

  if (error) throw error;
  if (!isPassport(data)) {
    throw new Error('Your passport could not be read. Please try again.');
  }
  return data;
};

// ---------------------------------------------------------------------------
// Skill evidence / portfolio
// ---------------------------------------------------------------------------

export type EvidenceType = 'screenshot' | 'certificate' | 'document' | 'video' | 'link' | 'project';

export const MAX_EVIDENCE_FILE_SIZE = 25 * 1024 * 1024;

export const EVIDENCE_BUCKET = 'skill-evidence';

export interface SkillEvidence {
  id: string;
  skill_id: string;
  skill_name: string;
  skill_category: string;
  title: string;
  description: string | null;
  evidence_type: EvidenceType;
  file_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
}

export interface AddEvidenceInput {
  skillId: string;
  title: string;
  description?: string;
  evidenceType: EvidenceType;
  filePath?: string | null;
  externalUrl?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}

export interface UploadedEvidenceFile {
  path: string;
  mimeType: string;
  size: number;
}

export const getMyEvidence = async (): Promise<SkillEvidence[]> => {
  const { data, error } = await getSupabaseClient().rpc('get_my_evidence');

  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as SkillEvidence[]) : [];
};

export const addSkillEvidence = async (input: AddEvidenceInput): Promise<SkillEvidence> => {
  const { data, error } = await getSupabaseClient().rpc('add_skill_evidence', {
    p_skill_id: input.skillId,
    p_title: input.title,
    p_description: input.description || null,
    p_evidence_type: input.evidenceType,
    p_file_path: input.filePath || null,
    p_external_url: input.externalUrl || null,
    p_mime_type: input.mimeType || null,
    p_file_size: input.fileSize ?? null,
  });

  if (error) throw error;
  return data as unknown as SkillEvidence;
};

export const deleteSkillEvidence = async (
  id: string,
): Promise<{ id: string; file_path: string | null }> => {
  const { data, error } = await getSupabaseClient().rpc('delete_skill_evidence', { p_id: id });

  if (error) throw error;
  return data as unknown as { id: string; file_path: string | null };
};

// crypto.randomUUID() is only exposed in secure contexts (HTTPS or localhost),
// so a phone opening the dev server over a LAN IP would otherwise fail to
// upload. getRandomValues() is available everywhere and still gives us a
// collision-resistant file name; the timestamp fallback covers very old
// browsers where even that is missing.
const createEvidenceFileId = (): string => {
  const webCrypto = globalThis.crypto;

  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  if (typeof webCrypto?.getRandomValues === 'function') {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-');
  }

  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
};

export const uploadSkillEvidenceFile = async (
  file: File,
  studentId: string,
): Promise<UploadedEvidenceFile> => {
  const extension = file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '')
    : '';
  const safeExtension = extension || 'bin';
  const path = `${studentId}/${createEvidenceFileId()}.${safeExtension}`;
  const mimeType = file.type || 'application/octet-stream';

  const { error } = await getSupabaseClient()
    .storage
    .from(EVIDENCE_BUCKET)
    .upload(path, file, { contentType: mimeType, upsert: false });

  if (error) throw error;
  return { path, mimeType, size: file.size };
};

export const getEvidenceSignedUrl = async (path: string): Promise<string> => {
  const { data, error } = await getSupabaseClient()
    .storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(path, 60 * 10);

  if (error) throw error;
  return data.signedUrl;
};

export const removeEvidenceFile = async (path: string): Promise<void> => {
  const { error } = await getSupabaseClient()
    .storage
    .from(EVIDENCE_BUCKET)
    .remove([path]);

  if (error) throw error;
};

export type Challenge = Tables['skill_challenges']['Row'];
export type ChallengeSubmission = Tables['challenge_submissions']['Row'];

export interface SkillChallengeWithSkill extends Challenge {
  skill_name: string;
  skill_category: string;
}

export interface ChallengeReviewResult {
  submission_id: string;
  challenge_id: string;
  status: ChallengeSubmission['status'];
  xp_awarded: number;
  total_xp: number;
}

export const getSkillChallenges = async (): Promise<SkillChallengeWithSkill[]> => {
  const { data, error } = await getSupabaseClient()
    .from('skill_challenges')
    .select('*, skills!inner(name, category)')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const skill = row.skills as unknown as { name: string; category: string };
    return {
      id: row.id,
      skill_id: row.skill_id,
      title: row.title,
      description: row.description,
      difficulty: row.difficulty,
      instructions: row.instructions,
      created_by: row.created_by,
      xp_reward: row.xp_reward,
      created_at: row.created_at,
      updated_at: row.updated_at,
      skill_name: skill.name,
      skill_category: skill.category,
    };
  });
};

export const getMyChallengeSubmissions = async (
  studentId: string,
): Promise<ChallengeSubmission[]> => {
  const { data, error } = await getSupabaseClient()
    .from('challenge_submissions')
    .select('*')
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
};

export const submitChallengeSubmission = async (
  challengeId: string,
  submissionText: string,
  submissionUrl?: string,
  attachmentUrl?: string,
): Promise<ChallengeSubmission> => {
  const { data, error } = await getSupabaseClient().rpc('submit_challenge_submission', {
    p_challenge_id: challengeId,
    p_submission_text: submissionText || null,
    p_submission_url: submissionUrl || null,
    p_attachment_url: attachmentUrl || null,
  });

  if (error) throw error;
  return data;
};

export const reviewChallengeSubmission = async (
  submissionId: string,
  passed: boolean,
  feedback: string,
): Promise<ChallengeReviewResult> => {
  const { data, error } = await getSupabaseClient().rpc('review_challenge_submission', {
    p_submission_id: submissionId,
    p_passed: passed,
    p_feedback: feedback || null,
  });

  if (error) throw error;

  const result = data as unknown as ChallengeReviewResult;
  if (typeof result?.xp_awarded !== 'number') {
    throw new Error('The review could not be recorded.');
  }
  return result;
};

export interface ReviewableSubmission {
  submission_id: string;
  challenge_id: string;
  challenge_title: string;
  xp_reward: number;
  skill_name: string;
  skill_category: string;
  student_id: string;
  student_name: string;
  submission_text: string | null;
  submission_url: string | null;
  attachment_url: string | null;
  submitted_at: string | null;
}

export const getReviewableSubmissions = async (): Promise<ReviewableSubmission[]> => {
  const { data, error } = await getSupabaseClient().rpc('get_reviewable_challenge_submissions');

  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ReviewableSubmission[]) : [];
};

export interface MatchedSkill {
  skill_id: string;
  name: string;
  category: string;
  their_level: ProficiencyLevel;
  my_level: ProficiencyLevel | null;
  interest: 'goal' | 'holding';
  relation: string;
}

export interface SkillMatch {
  student_id: string;
  full_name: string;
  course: string | null;
  year_level: number | null;
  bio: string | null;
  avatar_url: string | null;
  score: number;
  availability_overlap_minutes: number;
  previous_sessions: number;
  sessions_taught: number;
  verified_activities: number;
  matched_skills: MatchedSkill[];
}

export interface AvailabilitySlot {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export const getSkillMatches = async (): Promise<SkillMatch[]> => {
  const { data, error } = await getSupabaseClient().rpc('get_skill_matches');

  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as SkillMatch[]) : [];
};

export const getMyAvailability = async (studentId: string): Promise<AvailabilitySlot[]> => {
  const { data, error } = await getSupabaseClient()
    .from('availability')
    .select('day_of_week, start_time, end_time')
    .eq('student_id', studentId)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    day_of_week: row.day_of_week,
    start_time: String(row.start_time).slice(0, 5),
    end_time: String(row.end_time).slice(0, 5),
  }));
};

export const setMyAvailability = async (slots: AvailabilitySlot[]): Promise<number> => {
  const { data, error } = await getSupabaseClient().rpc('set_my_availability', {
    p_slots: slots as unknown as Json,
  });

  if (error) throw error;
  return data ?? 0;
};

export interface AdminStatistics {
  students: { total: number; admins: number; moderators: number; teaching: number };
  catalog: {
    skills: number; skill_categories: number; skill_relationships: number;
    challenges: number; achievements_defined: number; achievements_awarded: number;
  };
  sessions: {
    total: number; completed: number; open: number;
    cancelled: number; missions: number; activities: number;
  };
  challenges: { submissions: number; passed: number; awaiting_review: number };
  recognition: { endorsements: number; total_xp_awarded: number; active_learners: number };
}

export interface AdminStudentRow {
  student_id: string;
  full_name: string;
  email: string | null;
  course: string | null;
  year_level: number | null;
  role: string;
  created_at: string;
  skills_count: number;
  teachable_count: number;
  sessions_completed: number;
  sessions_taught: number;
  challenges_passed: number;
  endorsements_received: number;
  achievements_earned: number;
  total_xp: number;
}

export interface AdminStudentReport {
  id: string;
  reporter_id: string;
  reporter_name: string;
  target_user_id: string;
  target_name: string;
  reason: 'harassment' | 'spam' | 'inappropriate_content' | 'impersonation' | 'other';
  details: string | null;
  status: 'open' | 'resolved' | 'dismissed';
  moderator_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export const reportStudent = async (
  targetUserId: string,
  reason: AdminStudentReport['reason'],
  details: string,
): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('submit_student_report', {
    p_target_user_id: targetUserId,
    p_reason: reason,
    p_details: details.trim() || null,
  });
  if (error) throw error;
};

export const getAdminStudentReports = async (
  status: 'open' | 'resolved' | 'dismissed' | 'all' = 'open',
): Promise<AdminStudentReport[]> => {
  const { data, error } = await getSupabaseClient().rpc('admin_list_student_reports', {
    p_status: status,
  });
  if (error) throw error;
  if (!Array.isArray(data)) {
    throw new Error('Student reports could not be read.');
  }
  return data as unknown as AdminStudentReport[];
};

export const resolveAdminStudentReport = async (
  reportId: string,
  status: 'resolved' | 'dismissed',
  moderatorNote: string | null = null,
): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('admin_resolve_student_report', {
    p_report_id: reportId,
    p_status: status,
    p_moderator_note: moderatorNote,
  });
  if (error) throw error;
};

export const getAdminStatistics = async (): Promise<AdminStatistics> => {
  const { data, error } = await getSupabaseClient().rpc('get_admin_statistics');
  if (error) throw error;
  if (!data || typeof data !== 'object') {
    throw new Error('Platform statistics could not be read.');
  }
  return data as unknown as AdminStatistics;
};

export const adminListStudents = async (query?: string): Promise<AdminStudentRow[]> => {
  const { data, error } = await getSupabaseClient().rpc('admin_list_students', {
    p_query: query && query.trim() ? query.trim() : null,
  });
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as AdminStudentRow[]) : [];
};

export const setUserRole = async (userId: string, role: string): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('set_user_role', {
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw error;
};

export const saveAdminSkill = async (
  input: { id?: string; name: string; category: string; description?: string | null },
): Promise<void> => {
  const client = getSupabaseClient();
  if (input.id) {
    const { error } = await client.from('skills').update({
      name: input.name, category: input.category, description: input.description ?? null,
    }).eq('id', input.id);
    if (error) throw error;
    return;
  }
  const { error } = await client.from('skills').insert({
    name: input.name, category: input.category, description: input.description ?? null,
  });
  if (error) throw error;
};

export const deleteAdminSkill = async (id: string): Promise<void> => {
  const { error } = await getSupabaseClient().from('skills').delete().eq('id', id);
  if (error) throw error;
};

export const saveAdminChallenge = async (input: {
  id?: string; skill_id: string; title: string; description?: string | null;
  difficulty: ProficiencyLevel; instructions?: string | null; xp_reward?: number | null;
}): Promise<void> => {
  const client = getSupabaseClient();
  const payload = {
    skill_id: input.skill_id,
    title: input.title,
    description: input.description ?? null,
    difficulty: input.difficulty,
    instructions: input.instructions ?? null,
    ...(input.xp_reward != null ? { xp_reward: input.xp_reward } : {}),
  };
  if (input.id) {
    const { error } = await client.from('skill_challenges').update(payload).eq('id', input.id);
    if (error) throw error;
    return;
  }
  const { error } = await client.from('skill_challenges').insert(payload);
  if (error) throw error;
};

export const deleteAdminChallenge = async (id: string): Promise<void> => {
  const { error } = await getSupabaseClient().from('skill_challenges').delete().eq('id', id);
  if (error) throw error;
};

export const saveAdminAchievement = async (input: {
  id?: string; name: string; description?: string | null; icon?: string | null; criteria?: string | null;
}): Promise<void> => {
  const client = getSupabaseClient();
  if (input.id) {
    const { error } = await client.from('achievements').update({
      name: input.name, description: input.description ?? null,
      icon: input.icon ?? null, criteria: input.criteria ?? null,
    }).eq('id', input.id);
    if (error) throw error;
    return;
  }
  const { error } = await client.from('achievements').insert({
    name: input.name, description: input.description ?? null,
    icon: input.icon ?? null, criteria: input.criteria ?? null,
  });
  if (error) throw error;
};

export const deleteAdminAchievement = async (id: string): Promise<void> => {
  const { error } = await getSupabaseClient().from('achievements').delete().eq('id', id);
  if (error) throw error;
};

export const deleteAdminStudent = async (id: string): Promise<void> => {
  const { error } = await getSupabaseClient().from('profiles').delete().eq('id', id);
  if (error) throw error;
};

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  criteria: string | null;
}

// Reading the catalog is allowed for every authenticated user
// (skills_select_authenticated / achievements_select_authenticated both use
// `true`), so no admin-only read path is needed for these.
export const getAllChallenges = async (): Promise<Challenge[]> => {
  const { data, error } = await getSupabaseClient()
    .from('skill_challenges')
    .select('*')
    .order('title', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Challenge[];
};

export const getAllAchievements = async (): Promise<AchievementDefinition[]> => {
  const { data, error } = await getSupabaseClient()
    .from('achievements')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AchievementDefinition[];
};

export const getSupabaseRealtimeClient = () => {
  try {
    return getSupabaseClient();
  } catch {
    return null;
  }
};

export interface ConversationSummary {
  conversation_id: string;
  kind: 'direct' | 'session' | 'group';
  session_id: string | null;
  project_id: string | null;
  title: string | null;
  members: { id: string; name: string }[];
  last_message_id: string | null;
  last_message_body: string | null;
  last_message_sender_id: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface ChatMessage {
  id: string;
  body: string;
  attachment_url: string | null;
  created_at: string;
  sender_id: string;
  sender_name: string;
  is_mine: boolean;
  seen_by_peer: boolean;
}

export const getMyConversations = async (): Promise<ConversationSummary[]> => {
  const { data, error } = await getSupabaseClient().rpc('get_my_conversations');
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ConversationSummary[]) : [];
};

export const getConversationMessages = async (conversationId: string): Promise<ChatMessage[]> => {
  const { data, error } = await getSupabaseClient().rpc('get_conversation_messages', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ChatMessage[]) : [];
};

export const startDirectConversation = async (peerId: string): Promise<string> => {
  const { data, error } = await getSupabaseClient().rpc('start_direct_conversation', {
    p_peer_id: peerId,
  });
  if (error) throw error;
  return data;
};

export const getOrCreateSessionConversation = async (sessionId: string): Promise<string> => {
  const { data, error } = await getSupabaseClient().rpc('get_or_create_session_conversation', {
    p_session_id: sessionId,
  });
  if (error) throw error;
  return data;
};

// send_message returns the stored row; the thread is re-read afterwards so the
// sender name and is_mine flag come from the same place as every other message.
export const sendMessage = async (
  conversationId: string,
  body: string,
  attachmentUrl?: string,
): Promise<Tables['messages']['Row']> => {
  const { data, error } = await getSupabaseClient().rpc('send_message', {
    p_conversation_id: conversationId,
    p_body: body,
    p_attachment_url: attachmentUrl || null,
  });
  if (error) throw error;
  return data;
};

export const markConversationRead = async (conversationId: string): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
};

export interface EndorsementOpportunity {
  skill_id: string;
  skill_name: string;
  skill_category: string;
  student_id: string;
  student_name: string;
}

export const getEndorsementOpportunities = async (): Promise<EndorsementOpportunity[]> => {
  const { data, error } = await getSupabaseClient().rpc('get_endorsement_opportunities');

  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as EndorsementOpportunity[]) : [];
};

export const endorsePeerSkill = async (
  studentId: string,
  skillId: string,
  comment: string,
): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('endorse_peer_skill', {
    p_student_id: studentId,
    p_skill_id: skillId,
    p_comment: comment || null,
  });

  if (error) throw error;
};

export interface UnlockedAchievement {
  id: string;
  name: string;
  icon: string | null;
}

export interface AchievementSyncResult {
  count: number;
  achievements: UnlockedAchievement[];
}

export const syncMyAchievements = async (): Promise<AchievementSyncResult> => {
  const { data, error } = await getSupabaseClient().rpc('sync_my_achievements');

  if (error) throw error;
  const result = data as unknown as AchievementSyncResult | null;
  if (!result || typeof result.count !== 'number') {
    return { count: 0, achievements: [] };
  }
  return {
    count: result.count,
    achievements: Array.isArray(result.achievements) ? result.achievements : [],
  };
};

export interface GivenEndorsement {
  id: string;
  skill_name: string;
  comment: string | null;
  created_at: string;
  student_name: string | null;
}

// Endorsements are readable by any authenticated user (existing RLS), so this
// resolves the skill and student names with lookups rather than an embedded
// join, matching how getDiscoverableStudents already works.
export const getGivenEndorsements = async (endorserId: string): Promise<GivenEndorsement[]> => {
  const { data, error } = await getSupabaseClient()
    .from('endorsements')
    .select('*')
    .eq('endorsed_by', endorserId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const [{ data: skills }, { data: profiles }] = await Promise.all([
    getSupabaseClient().from('skills').select('id, name').in('id', [...new Set(rows.map((r) => r.skill_id))]),
    getSupabaseClient().from('profiles').select('id, full_name').in('id', [...new Set(rows.map((r) => r.student_id))]),
  ]);

  const skillNames = new Map((skills ?? []).map((s) => [s.id, s.name]));
  const studentNames = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return rows.map((row) => ({
    id: row.id,
    skill_name: skillNames.get(row.skill_id) ?? 'Unavailable skill',
    comment: row.comment,
    created_at: row.created_at,
    student_name: studentNames.get(row.student_id) ?? null,
  }));
};

// ---------------------------------------------------------------------------
// Collaboration rooms (features.md section 11)
// ---------------------------------------------------------------------------

export type ProjectStatus = 'planning' | 'active' | 'completed' | 'archived';
export type ProjectTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';

export interface ProjectMemberSummary {
  student_id: string;
  full_name: string;
  role: string | null;
  course?: string | null;
  joined_at?: string;
}

export interface ProjectSkillRef {
  skill_id: string;
  name: string;
  category?: string | null;
}

export interface ProjectMilestoneRef {
  title: string;
  due_date: string | null;
}

export interface ProjectSummary {
  project_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  owner_id: string;
  owner_name: string;
  is_owner: boolean;
  member_count: number;
  members: ProjectMemberSummary[];
  skills: ProjectSkillRef[];
  task_total: number;
  task_done: number;
  milestone_total: number;
  milestone_done: number;
  progress: number;
  next_milestone: ProjectMilestoneRef | null;
  conversation_id: string | null;
  updated_at: string;
}

export interface ProjectTask {
  task_id: string;
  title: string;
  description: string | null;
  status: ProjectTaskStatus;
  due_date: string | null;
  milestone_id: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  created_by: string | null;
  completed_at: string | null;
}

export interface ProjectMilestone {
  milestone_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  completed_at: string | null;
  task_total: number;
  task_done: number;
}

export interface ProjectFile {
  file_id: string;
  label: string;
  url: string;
  added_by_name: string;
  created_at: string;
}

export interface ProjectEvent {
  event_id: string;
  event_type: string;
  summary: string;
  actor_name: string;
  created_at: string;
}

export interface ProjectDetail {
  project: {
    project_id: string;
    name: string;
    description: string | null;
    status: ProjectStatus;
    owner_id: string;
    owner_name: string;
    is_owner: boolean;
    created_at: string;
    updated_at: string;
  };
  members: ProjectMemberSummary[];
  skills: ProjectSkillRef[];
  milestones: ProjectMilestone[];
  tasks: ProjectTask[];
  files: ProjectFile[];
  events: ProjectEvent[];
  progress: {
    task_total: number;
    task_done: number;
    milestone_total: number;
    milestone_done: number;
    percent: number;
  };
  conversation_id: string | null;
}

export interface ProjectRecommendation {
  student_id: string;
  full_name: string;
  course: string | null;
  year_level: number | null;
  avatar_url: string | null;
  score: number;
  covered_count: number;
  covered_skills: { skill_id: string; name: string; proficiency_level: ProficiencyLevel }[];
}

export interface StudentDirectoryEntry {
  student_id: string;
  full_name: string;
  course: string | null;
  year_level: number | null;
}

export const getMyProjects = async (): Promise<ProjectSummary[]> => {
  const { data, error } = await getSupabaseClient().rpc('get_my_projects');

  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ProjectSummary[]) : [];
};

export const getProjectDetail = async (projectId: string): Promise<ProjectDetail> => {
  const { data, error } = await getSupabaseClient().rpc('get_project_detail', {
    p_project_id: projectId,
  });

  if (error) throw error;
  return data as unknown as ProjectDetail;
};

export const getProjectTeamRecommendations = async (
  projectId: string,
): Promise<ProjectRecommendation[]> => {
  const { data, error } = await getSupabaseClient().rpc('get_project_team_recommendations', {
    p_project_id: projectId,
  });

  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ProjectRecommendation[]) : [];
};

export interface CreateProjectInput {
  name: string;
  description: string;
  skillIds: string[];
  memberIds: string[];
}

export const createProject = async (input: CreateProjectInput): Promise<string> => {
  const { data, error } = await getSupabaseClient().rpc('create_project', {
    p_name: input.name,
    p_description: input.description || null,
    p_skill_ids: input.skillIds,
    p_member_ids: input.memberIds,
  });

  if (error) throw error;
  return data;
};

export const addProjectMember = async (
  projectId: string,
  studentId: string,
  role: string | null = null,
): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('add_project_member', {
    p_project_id: projectId,
    p_student_id: studentId,
    p_role: role,
  });

  if (error) throw error;
};

export const removeProjectMember = async (
  projectId: string,
  studentId: string,
): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('remove_project_member', {
    p_project_id: projectId,
    p_student_id: studentId,
  });

  if (error) throw error;
};

export const setProjectMemberRole = async (
  projectId: string,
  studentId: string,
  role: string,
): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('set_project_member_role', {
    p_project_id: projectId,
    p_student_id: studentId,
    p_role: role,
  });

  if (error) throw error;
};

export const setProjectStatus = async (
  projectId: string,
  status: ProjectStatus,
): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('set_project_status', {
    p_project_id: projectId,
    p_status: status,
  });

  if (error) throw error;
};

export const deleteProject = async (projectId: string): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('delete_project', {
    p_project_id: projectId,
  });

  if (error) throw error;
};

export const createProjectMilestone = async (
  projectId: string,
  title: string,
  description: string,
  dueDate: string | null,
): Promise<string> => {
  const { data, error } = await getSupabaseClient().rpc('create_project_milestone', {
    p_project_id: projectId,
    p_title: title,
    p_description: description || null,
    p_due_date: dueDate,
  });

  if (error) throw error;
  return data;
};

export const completeProjectMilestone = async (milestoneId: string): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('complete_project_milestone', {
    p_milestone_id: milestoneId,
  });

  if (error) throw error;
};

export interface CreateProjectTaskInput {
  projectId: string;
  title: string;
  description: string;
  assignedTo: string | null;
  milestoneId: string | null;
  dueDate: string | null;
}

export const createProjectTask = async (input: CreateProjectTaskInput): Promise<string> => {
  const { data, error } = await getSupabaseClient().rpc('create_project_task', {
    p_project_id: input.projectId,
    p_title: input.title,
    p_description: input.description || null,
    p_assigned_to: input.assignedTo,
    p_milestone_id: input.milestoneId,
    p_due_date: input.dueDate,
  });

  if (error) throw error;
  return data;
};

export const assignProjectTask = async (taskId: string, studentId: string): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('assign_project_task', {
    p_task_id: taskId,
    p_student_id: studentId,
  });

  if (error) throw error;
};

export const setProjectTaskStatus = async (
  taskId: string,
  status: ProjectTaskStatus,
): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('set_project_task_status', {
    p_task_id: taskId,
    p_status: status,
  });

  if (error) throw error;
};

export const deleteProjectTask = async (taskId: string): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('delete_project_task', {
    p_task_id: taskId,
  });

  if (error) throw error;
};

export const addProjectFile = async (
  projectId: string,
  label: string,
  url: string,
): Promise<string> => {
  const { data, error } = await getSupabaseClient().rpc('add_project_file', {
    p_project_id: projectId,
    p_label: label,
    p_url: url,
  });

  if (error) throw error;
  return data;
};

// Profiles are readable by every authenticated student. Only the fields needed
// to pick a teammate are selected.
export const getStudentDirectory = async (excludeId: string): Promise<StudentDirectoryEntry[]> => {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('id, full_name, course, year_level')
    .neq('id', excludeId)
    .order('full_name');

  if (error) throw error;

  return (data ?? []).map((row) => ({
    student_id: row.id,
    full_name: row.full_name ?? 'SkillForge student',
    course: row.course,
    year_level: row.year_level,
  }));
};

// ---------------------------------------------------------------------------
// Skill Arena
//
// Arena is practice, not proof: these calls never touch the Skill Passport and
// every score, XP award and rating change is computed by the database.
// ---------------------------------------------------------------------------

export type ArenaTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';
export type ArenaDifficulty = 'easy' | 'medium' | 'hard';

export interface ArenaOpenDuel {
  id: string;
  skill_id: string;
  skill_name: string;
  skill_category: string;
  opponent_id: string;
  opponent_name: string;
  my_role: 'challenger' | 'opponent';
  i_played: boolean;
  opponent_played: boolean;
  expires_at: string;
  created_at: string;
}

export interface ArenaRecentDuel {
  id: string;
  skill_name: string;
  opponent_name: string;
  my_score: number | null;
  opponent_score: number | null;
  result: 'win' | 'loss' | 'draw';
  completed_at: string;
}

export interface ArenaState {
  rating: number;
  tier: ArenaTier;
  wins: number;
  losses: number;
  draws: number;
  leaderboard_opt_out: boolean;
  current_streak: number;
  longest_streak: number;
  played_today: boolean;
  xp_today: number;
  xp_cap: number;
  open_duels: ArenaOpenDuel[];
  recent_duels: ArenaRecentDuel[];
}

export interface ArenaSkill {
  id: string;
  name: string;
  category: string;
  question_count: number;
  duel_question_count: number;
  on_my_profile: boolean;
  i_teach: boolean;
}

export interface ArenaQuestion {
  id: string;
  prompt: string;
  options: string[];
  difficulty: ArenaDifficulty;
}

export interface ArenaRound {
  round_id: string;
  mode: 'solo' | 'duel';
  skill_id: string;
  duel_id: string | null;
  question_limit_ms: number;
  questions: ArenaQuestion[];
}

export interface ArenaAnswerResult {
  is_correct: boolean;
  correct_index: number;
  explanation: string | null;
  points: number;
  combo: number;
  score: number;
  answered_count: number;
  total_questions: number;
  question_limit_ms: number;
  elapsed_ms: number;
}

export interface ArenaDuelOutcome {
  status: 'completed' | 'waiting';
  my_score: number;
  opponent_score: number | null;
  result: 'win' | 'loss' | 'draw' | null;
  rating_change: number;
}

export interface ArenaRoundSummary {
  round_id: string;
  mode: 'solo' | 'duel';
  score: number;
  correct_count: number;
  answered_count: number;
  total_questions: number;
  xp_awarded: number;
  total_xp: number;
  level: number;
  personal_best: boolean;
  streak: number;
  xp_today: number;
  xp_cap: number;
  duel: ArenaDuelOutcome | null;
}

export interface ArenaOpponent {
  id: string;
  full_name: string;
  course: string | null;
  rating: number;
  tier: ArenaTier;
}

export interface ArenaLeaderboardRow {
  rank_no: number;
  student_id: string;
  full_name: string;
  tier: ArenaTier;
  rating: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  is_me: boolean;
}

export interface ArenaQuestionDraft {
  id?: string;
  skill_id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  difficulty: ArenaDifficulty;
}

export interface ArenaAuthoredQuestion extends ArenaQuestionDraft {
  id: string;
  skill_name: string;
  status: 'active' | 'rejected' | 'flagged';
  approved_for_duel: boolean;
  answer_count: number;
  correct_count: number;
  created_at: string;
}

export interface ArenaQuestionBank {
  skills: { id: string; name: string; category: string }[];
  questions: ArenaAuthoredQuestion[];
}

export interface AdminQuizQuestion extends ArenaAuthoredQuestion {
  source: 'system' | 'teacher';
  author_id: string | null;
  author_name: string;
  correct_rate: number | null;
}

export const getArenaState = async (): Promise<ArenaState> => {
  const { data, error } = await getSupabaseClient().rpc('get_arena_state');

  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Your Arena record could not be read. Please try again.');
  }

  return data as unknown as ArenaState;
};

export const getArenaSkills = async (): Promise<ArenaSkill[]> => {
  const { data, error } = await getSupabaseClient().rpc('get_arena_skills');

  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ArenaSkill[]) : [];
};

export const startArenaRound = async (
  mode: 'solo' | 'duel',
  skillId: string,
  duelId: string | null = null,
): Promise<ArenaRound> => {
  const { data, error } = await getSupabaseClient().rpc('start_arena_round', {
    p_mode: mode,
    p_skill_id: skillId,
    p_duel_id: duelId,
  });

  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('That round could not be started. Please try again.');
  }

  return data as unknown as ArenaRound;
};

export const submitArenaAnswer = async (
  roundId: string,
  questionId: string,
  selectedIndex: number,
): Promise<ArenaAnswerResult> => {
  const { data, error } = await getSupabaseClient().rpc('submit_arena_answer', {
    p_round_id: roundId,
    p_question_id: questionId,
    p_selected_index: selectedIndex,
  });

  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('That answer could not be scored. Please try again.');
  }

  return data as unknown as ArenaAnswerResult;
};

export const finishArenaRound = async (roundId: string): Promise<ArenaRoundSummary> => {
  const { data, error } = await getSupabaseClient().rpc('finish_arena_round', {
    p_round_id: roundId,
  });

  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('That round could not be finished. Please try again.');
  }

  return data as unknown as ArenaRoundSummary;
};

export const findDuelOpponent = async (skillId: string): Promise<ArenaOpponent | null> => {
  const { data, error } = await getSupabaseClient().rpc('find_duel_opponent', {
    p_skill_id: skillId,
  });

  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  return data as unknown as ArenaOpponent;
};

export const createDuel = async (
  opponentId: string,
  skillId: string,
): Promise<{ id: string; opponent_name: string; expires_at: string }> => {
  const { data, error } = await getSupabaseClient().rpc('create_duel', {
    p_opponent_id: opponentId,
    p_skill_id: skillId,
  });

  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('That duel could not be created. Please try again.');
  }

  return data as unknown as { id: string; opponent_name: string; expires_at: string };
};

export const getArenaLeaderboard = async (
  scope: 'global' | 'course' = 'global',
  period: 'all' | 'week' = 'all',
  skillId: string | null = null,
): Promise<ArenaLeaderboardRow[]> => {
  const { data, error } = await getSupabaseClient().rpc('get_arena_leaderboard', {
    p_scope: scope,
    p_period: period,
    p_skill_id: skillId,
  });

  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ArenaLeaderboardRow[]) : [];
};

export const setArenaLeaderboardOptOut = async (optOut: boolean): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('set_arena_leaderboard_opt_out', {
    p_opt_out: optOut,
  });

  if (error) throw error;
};

export const getMyQuestionBank = async (): Promise<ArenaQuestionBank> => {
  const { data, error } = await getSupabaseClient().rpc('get_my_question_bank');

  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { skills: [], questions: [] };
  }

  return data as unknown as ArenaQuestionBank;
};

export const saveQuizQuestion = async (draft: ArenaQuestionDraft): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('upsert_quiz_question', {
    p_skill_id: draft.skill_id,
    p_prompt: draft.prompt,
    p_options: draft.options,
    p_correct_index: draft.correct_index,
    p_explanation: draft.explanation,
    p_difficulty: draft.difficulty,
    p_id: draft.id ?? null,
  });

  if (error) throw error;
};

export const adminListQuizQuestions = async (): Promise<AdminQuizQuestion[]> => {
  const { data, error } = await getSupabaseClient().rpc('admin_list_quiz_questions');

  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as AdminQuizQuestion[]) : [];
};

export const adminSetQuizQuestion = async (
  id: string,
  approvedForDuel: boolean | null = null,
  status: 'active' | 'rejected' | 'flagged' | null = null,
): Promise<void> => {
  const { error } = await getSupabaseClient().rpc('admin_set_quiz_question', {
    p_id: id,
    p_approved_for_duel: approvedForDuel,
    p_status: status,
  });

  if (error) throw error;
};

export const getFriendlyStudentError = (error: unknown, fallback: string): string => {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object'
      && error !== null
      && 'message' in error
      && typeof error.message === 'string'
      ? error.message
      : '';
  const lower = message.toLowerCase();

  if (lower.includes('duplicate') || lower.includes('already exists')) {
    return 'That skill is already in your profile.';
  }

  if (lower.includes('row-level security') || lower.includes('permission')) {
    return 'You do not have permission to change this information.';
  }

  if (lower.includes('foreign key')) {
    return 'Please choose an available skill from the catalog.';
  }

  // A generic fallback hides the real cause. When Supabase or Postgres returns
  // a message we have no friendly phrasing for, show it rather than guessing.
  return message ? `${fallback} (${message})` : fallback;
};
