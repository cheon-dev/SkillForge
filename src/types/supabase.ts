export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProficiencyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type LearningGoalPriority = 'low' | 'medium' | 'high';
export type LearningGoalStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type LearningSessionStatus =
  | 'requested'
  | 'accepted'
  | 'declined'
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'no_show';
export type ChallengeSubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'passed'
  | 'needs_revision';
export type ProjectStatus = 'planning' | 'active' | 'completed' | 'archived';
export type SkillRelationshipType = 'related' | 'prerequisite' | 'extension';
export type SessionMissionStatus = 'not_started' | 'in_progress' | 'completed' | 'failed';
export type SessionActivityType = 'quiz' | 'problem_solving' | 'practice' | 'final_challenge';
export type ActivityAttemptStatus = 'submitted' | 'passed' | 'needs_retry' | 'reviewed';
export type NotificationType =
  | 'session_request'
  | 'session_accepted'
  | 'session_declined'
  | 'session_completed'
  | 'challenge_submitted'
  | 'challenge_reviewed'
  | 'achievement_unlocked'
  | 'new_message'
  | 'activity_reviewed'
  | 'duel_challenged'
  | 'duel_completed';
export type ProfileRole = 'student' | 'moderator' | 'admin';
export type ChallengeDifficulty = ProficiencyLevel;
export type CreditTransactionType =
  | 'mission_reward'
  | 'session_request'
  | 'refund'
  | 'adjustment'
  | 'teaching_reward'
  | 'session_spend';

export interface SupabaseConfigStatus {
  configured: boolean;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          course: string | null;
          year_level: number | null;
          bio: string | null;
          avatar_url: string | null;
          role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          course?: string | null;
          year_level?: number | null;
          bio?: string | null;
          avatar_url?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          course?: string | null;
          year_level?: number | null;
          bio?: string | null;
          avatar_url?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      skills: {
        Row: {
          id: string;
          name: string;
          category: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      skill_relationships: {
        Row: {
          skill_id: string;
          related_skill_id: string;
          relationship_type: SkillRelationshipType;
        };
        Insert: {
          skill_id: string;
          related_skill_id: string;
          relationship_type: SkillRelationshipType;
        };
        Update: {
          skill_id?: string;
          related_skill_id?: string;
          relationship_type?: SkillRelationshipType;
        };
        Relationships: [
          {
            foreignKeyName: 'skill_relationships_related_skill_id_fkey';
            columns: ['related_skill_id'];
            isOneToOne: false;
            referencedRelation: 'skills';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'skill_relationships_skill_id_fkey';
            columns: ['skill_id'];
            isOneToOne: false;
            referencedRelation: 'skills';
            referencedColumns: ['id'];
          },
        ];
      };
      student_skills: {
        Row: {
          id: string;
          student_id: string;
          skill_id: string;
          proficiency_level: ProficiencyLevel;
          years_experience: number;
          is_teachable: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          skill_id: string;
          proficiency_level: ProficiencyLevel;
          years_experience?: number;
          is_teachable?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          skill_id?: string;
          proficiency_level?: ProficiencyLevel;
          years_experience?: number;
          is_teachable?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'student_skills_skill_id_fkey';
            columns: ['skill_id'];
            isOneToOne: false;
            referencedRelation: 'skills';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'student_skills_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      learning_goals: {
        Row: {
          id: string;
          student_id: string;
          skill_id: string;
          current_level: ProficiencyLevel;
          target_level: ProficiencyLevel;
          goal_description: string | null;
          priority: LearningGoalPriority;
          status: LearningGoalStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          skill_id: string;
          current_level: ProficiencyLevel;
          target_level: ProficiencyLevel;
          goal_description?: string | null;
          priority?: LearningGoalPriority;
          status?: LearningGoalStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          skill_id?: string;
          current_level?: ProficiencyLevel;
          target_level?: ProficiencyLevel;
          goal_description?: string | null;
          priority?: LearningGoalPriority;
          status?: LearningGoalStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'learning_goals_skill_id_fkey';
            columns: ['skill_id'];
            isOneToOne: false;
            referencedRelation: 'skills';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'learning_goals_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      availability: {
        Row: {
          id: string;
          student_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'availability_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      learning_sessions: {
        Row: {
          id: string;
          learner_id: string;
          teacher_id: string;
          skill_id: string;
          scheduled_at: string;
          proposed_scheduled_at: string | null;
          proposed_by: string | null;
          duration_minutes: number;
          status: LearningSessionStatus;
          learning_objectives: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          learner_id: string;
          teacher_id: string;
          skill_id: string;
          scheduled_at: string;
          proposed_scheduled_at?: string | null;
          proposed_by?: string | null;
          duration_minutes: number;
          status?: LearningSessionStatus;
          learning_objectives?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          learner_id?: string;
          teacher_id?: string;
          skill_id?: string;
          scheduled_at?: string;
          proposed_scheduled_at?: string | null;
          proposed_by?: string | null;
          duration_minutes?: number;
          status?: LearningSessionStatus;
          learning_objectives?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'learning_sessions_learner_id_fkey';
            columns: ['learner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'learning_sessions_skill_id_fkey';
            columns: ['skill_id'];
            isOneToOne: false;
            referencedRelation: 'skills';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'learning_sessions_teacher_id_fkey';
            columns: ['teacher_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      skill_challenges: {
        Row: {
          id: string;
          skill_id: string;
          title: string;
          description: string | null;
          difficulty: ProficiencyLevel;
          instructions: string | null;
          created_by: string | null;
          xp_reward: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          skill_id: string;
          title: string;
          description?: string | null;
          difficulty: ProficiencyLevel;
          instructions?: string | null;
          created_by?: string | null;
          xp_reward?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          skill_id?: string;
          title?: string;
          description?: string | null;
          difficulty?: ProficiencyLevel;
          instructions?: string | null;
          created_by?: string | null;
          xp_reward?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'skill_challenges_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'skill_challenges_skill_id_fkey';
            columns: ['skill_id'];
            isOneToOne: false;
            referencedRelation: 'skills';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_submissions: {
        Row: {
          id: string;
          challenge_id: string;
          student_id: string;
          session_id: string | null;
          submission_text: string | null;
          submission_url: string | null;
          attachment_url: string | null;
          status: ChallengeSubmissionStatus;
          reviewer_id: string | null;
          reviewer_feedback: string | null;
          submitted_at: string | null;
          reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          challenge_id: string;
          student_id: string;
          session_id?: string | null;
          submission_text?: string | null;
          submission_url?: string | null;
          attachment_url?: string | null;
          status?: ChallengeSubmissionStatus;
          reviewer_id?: string | null;
          reviewer_feedback?: string | null;
          submitted_at?: string | null;
          reviewed_at?: string | null;
        };
        Update: {
          id?: string;
          challenge_id?: string;
          student_id?: string;
          session_id?: string | null;
          submission_text?: string | null;
          submission_url?: string | null;
          attachment_url?: string | null;
          status?: ChallengeSubmissionStatus;
          reviewer_id?: string | null;
          reviewer_feedback?: string | null;
          submitted_at?: string | null;
          reviewed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_submissions_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'skill_challenges';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_submissions_reviewer_id_fkey';
            columns: ['reviewer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_submissions_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'learning_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_submissions_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      endorsements: {
        Row: {
          id: string;
          student_id: string;
          skill_id: string;
          endorsed_by: string;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          skill_id: string;
          endorsed_by: string;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          skill_id?: string;
          endorsed_by?: string;
          comment?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'endorsements_endorsed_by_fkey';
            columns: ['endorsed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'endorsements_skill_id_fkey';
            columns: ['skill_id'];
            isOneToOne: false;
            referencedRelation: 'skills';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'endorsements_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      achievements: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          icon: string | null;
          criteria: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          icon?: string | null;
          criteria?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          icon?: string | null;
          criteria?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      student_achievements: {
        Row: {
          student_id: string;
          achievement_id: string;
          earned_at: string;
        };
        Insert: {
          student_id: string;
          achievement_id: string;
          earned_at?: string;
        };
        Update: {
          student_id?: string;
          achievement_id?: string;
          earned_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'student_achievements_achievement_id_fkey';
            columns: ['achievement_id'];
            isOneToOne: false;
            referencedRelation: 'achievements';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'student_achievements_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          owner_id: string;
          status: ProjectStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          owner_id: string;
          status?: ProjectStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          owner_id?: string;
          status?: ProjectStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'projects_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      project_members: {
        Row: {
          id: string;
          project_id: string;
          student_id: string;
          role: string | null;
          joined_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          student_id: string;
          role?: string | null;
          joined_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          student_id?: string;
          role?: string | null;
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_members_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_members_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      session_missions: {
        Row: {
          id: string;
          session_id: string;
          title: string;
          description: string | null;
          learning_goal: string | null;
          total_xp: number;
          status: SessionMissionStatus;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          title: string;
          description?: string | null;
          learning_goal?: string | null;
          total_xp?: number;
          status?: SessionMissionStatus;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          title?: string;
          description?: string | null;
          learning_goal?: string | null;
          total_xp?: number;
          status?: SessionMissionStatus;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_missions_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: true;
            referencedRelation: 'learning_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      session_activities: {
        Row: {
          id: string;
          mission_id: string;
          sequence_number: number;
          title: string;
          activity_type: SessionActivityType;
          instructions: string | null;
          content: Json;
          max_xp: number;
          requires_teacher_review: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          mission_id: string;
          sequence_number: number;
          title: string;
          activity_type: SessionActivityType;
          instructions?: string | null;
          content?: Json;
          max_xp?: number;
          requires_teacher_review?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          mission_id?: string;
          sequence_number?: number;
          title?: string;
          activity_type?: SessionActivityType;
          instructions?: string | null;
          content?: Json;
          max_xp?: number;
          requires_teacher_review?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_activities_mission_id_fkey';
            columns: ['mission_id'];
            isOneToOne: false;
            referencedRelation: 'session_missions';
            referencedColumns: ['id'];
          },
        ];
      };
      activity_attempts: {
        Row: {
          id: string;
          activity_id: string;
          student_id: string;
          attempt_number: number;
          answer: Json;
          score: number | null;
          passed: boolean | null;
          xp_earned: number;
          status: ActivityAttemptStatus;
          teacher_feedback: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          activity_id: string;
          student_id: string;
          attempt_number: number;
          answer?: Json;
          score?: number | null;
          passed?: boolean | null;
          xp_earned?: number;
          status?: ActivityAttemptStatus;
          teacher_feedback?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          submitted_at?: string;
        };
        Update: {
          id?: string;
          activity_id?: string;
          student_id?: string;
          attempt_number?: number;
          answer?: Json;
          score?: number | null;
          passed?: boolean | null;
          xp_earned?: number;
          status?: ActivityAttemptStatus;
          teacher_feedback?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          submitted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'activity_attempts_activity_id_fkey';
            columns: ['activity_id'];
            isOneToOne: false;
            referencedRelation: 'session_activities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_attempts_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_attempts_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          recipient_id: string;
          actor_id: string | null;
          notification_type: NotificationType;
          title: string;
          body: string;
          entity_id: string | null;
          created_at: string;
          read_at: string | null;
        };
        Insert: {
          id?: string;
          recipient_id: string;
          actor_id?: string | null;
          notification_type: NotificationType;
          title: string;
          body: string;
          entity_id?: string | null;
          created_at?: string;
          read_at?: string | null;
        };
        Update: {
          id?: string;
          recipient_id?: string;
          actor_id?: string | null;
          notification_type?: NotificationType;
          title?: string;
          body?: string;
          entity_id?: string | null;
          created_at?: string;
          read_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      student_xp: {
        Row: {
          student_id: string;
          total_xp: number;
          level: number;
          updated_at: string;
        };
        Insert: {
          student_id: string;
          total_xp?: number;
          level?: number;
          updated_at?: string;
        };
        Update: {
          student_id?: string;
          total_xp?: number;
          level?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'student_xp_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      credit_transactions: {
        Row: {
          id: string;
          student_id: string;
          amount: number;
          transaction_type: CreditTransactionType;
          description: string;
          reference_type: string | null;
          reference_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          amount: number;
          transaction_type: CreditTransactionType;
          description: string;
          reference_type?: string | null;
          reference_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          amount?: number;
          transaction_type?: CreditTransactionType;
          description?: string;
          reference_type?: string | null;
          reference_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_transactions_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      activity_xp_rewards: {
        Row: {
          id: string;
          attempt_id: string;
          student_id: string;
          awarded_by: string;
          xp_awarded: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          attempt_id: string;
          student_id: string;
          awarded_by: string;
          xp_awarded: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          attempt_id?: string;
          student_id?: string;
          awarded_by?: string;
          xp_awarded?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'activity_xp_rewards_attempt_id_fkey';
            columns: ['attempt_id'];
            isOneToOne: true;
            referencedRelation: 'activity_attempts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_xp_rewards_awarded_by_fkey';
            columns: ['awarded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_xp_rewards_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          id: string;
          kind: string;
          session_id: string | null;
          project_id: string | null;
          title: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          kind?: string;
          session_id?: string | null;
          project_id?: string | null;
          title?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          kind?: string;
          session_id?: string | null;
          project_id?: string | null;
          title?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      conversation_members: {
        Row: {
          conversation_id: string;
          student_id: string;
          joined_at: string;
          last_read_at: string;
        };
        Insert: {
          conversation_id: string;
          student_id: string;
          joined_at?: string;
          last_read_at?: string;
        };
        Update: {
          conversation_id?: string;
          student_id?: string;
          joined_at?: string;
          last_read_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          attachment_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          attachment_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          sender_id?: string;
          body?: string;
          attachment_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_session_learning_plan: {
        Args: {
          p_session_id: string;
          p_title: string;
          p_description: string | null;
          p_learning_goal: string | null;
          p_activities: Json;
        };
        Returns: string;
      };
      start_session_mission: {
        Args: { p_mission_id: string };
        Returns: Database['public']['Tables']['session_missions']['Row'];
      };
      complete_session_mission: {
        Args: { p_mission_id: string };
        Returns: Database['public']['Tables']['session_missions']['Row'];
      };
      cancel_learning_session: {
        Args: { p_session_id: string };
        Returns: Database['public']['Tables']['learning_sessions']['Row'];
      };
      propose_learning_session_time: {
        Args: { p_session_id: string; p_scheduled_at: string };
        Returns: Database['public']['Tables']['learning_sessions']['Row'];
      };
      respond_to_session_time_change: {
        Args: { p_session_id: string; p_accept: boolean };
        Returns: Database['public']['Tables']['learning_sessions']['Row'];
      };
      respond_to_learning_request: {
        Args: {
          p_session_id: string;
          p_accept: boolean;
        };
        Returns: Database['public']['Tables']['learning_sessions']['Row'];
      };
      request_learning_session: {
        Args: {
          p_teacher_id: string;
          p_skill_id: string;
          p_scheduled_at: string;
          p_duration_minutes: number;
          p_learning_objectives?: string | null;
        };
        Returns: Database['public']['Tables']['learning_sessions']['Row'];
      };
      get_my_credits: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      complete_learning_session: {
        Args: { p_session_id: string };
        Returns: Database['public']['Tables']['learning_sessions']['Row'];
      };
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      is_moderator: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      set_user_role: {
        Args: { p_user_id: string; p_role: string };
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
      start_direct_conversation: {
        Args: { p_peer_id: string };
        Returns: string;
      };
      get_or_create_session_conversation: {
        Args: { p_session_id: string };
        Returns: string;
      };
      send_message: {
        Args: {
          p_conversation_id: string;
          p_body: string;
          p_attachment_url?: string | null;
        };
        Returns: Database['public']['Tables']['messages']['Row'];
      };
      mark_conversation_read: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      get_my_conversations: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_conversation_messages: {
        Args: { p_conversation_id: string };
        Returns: Json;
      };
      get_admin_statistics: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      admin_list_students: {
        Args: { p_query?: string | null };
        Returns: Json;
      };
      get_skill_matches: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      set_my_availability: {
        Args: { p_slots: Json };
        Returns: number;
      };
      endorse_peer_skill: {
        Args: {
          p_student_id: string;
          p_skill_id: string;
          p_comment?: string | null;
        };
        Returns: Database['public']['Tables']['endorsements']['Row'];
      };
      get_endorsement_opportunities: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      sync_my_achievements: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_reviewable_challenge_submissions: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_skill_passport: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      submit_challenge_submission: {
        Args: {
          p_challenge_id: string;
          p_submission_text?: string | null;
          p_submission_url?: string | null;
          p_attachment_url?: string | null;
        };
        Returns: Database['public']['Tables']['challenge_submissions']['Row'];
      };
      review_challenge_submission: {
        Args: {
          p_submission_id: string;
          p_passed: boolean;
          p_feedback?: string | null;
        };
        Returns: Json;
      };
      review_activity_attempt: {
        Args: {
          p_attempt_id: string;
          p_score: number;
          p_passed: boolean;
          p_teacher_feedback?: string | null;
        };
        Returns: {
          attempt_id: string;
          student_id: string;
          xp_awarded: number;
          total_xp: number;
        }[];
      };
      create_project: {
        Args: {
          p_name: string;
          p_description?: string | null;
          p_skill_ids?: string[];
          p_member_ids?: string[];
        };
        Returns: string;
      };
      add_project_member: {
        Args: { p_project_id: string; p_student_id: string; p_role?: string | null };
        Returns: undefined;
      };
      remove_project_member: {
        Args: { p_project_id: string; p_student_id: string };
        Returns: undefined;
      };
      set_project_member_role: {
        Args: { p_project_id: string; p_student_id: string; p_role: string };
        Returns: undefined;
      };
      set_project_status: {
        Args: { p_project_id: string; p_status: string };
        Returns: undefined;
      };
      delete_project: {
        Args: { p_project_id: string };
        Returns: undefined;
      };
      create_project_milestone: {
        Args: {
          p_project_id: string;
          p_title: string;
          p_description?: string | null;
          p_due_date?: string | null;
        };
        Returns: string;
      };
      complete_project_milestone: {
        Args: { p_milestone_id: string };
        Returns: undefined;
      };
      create_project_task: {
        Args: {
          p_project_id: string;
          p_title: string;
          p_description?: string | null;
          p_assigned_to?: string | null;
          p_milestone_id?: string | null;
          p_due_date?: string | null;
        };
        Returns: string;
      };
      assign_project_task: {
        Args: { p_task_id: string; p_student_id: string };
        Returns: undefined;
      };
      set_project_task_status: {
        Args: { p_task_id: string; p_status: string };
        Returns: undefined;
      };
      delete_project_task: {
        Args: { p_task_id: string };
        Returns: undefined;
      };
      add_project_file: {
        Args: { p_project_id: string; p_label: string; p_url: string };
        Returns: string;
      };
      get_my_projects: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_project_detail: {
        Args: { p_project_id: string };
        Returns: Json;
      };
      get_project_team_recommendations: {
        Args: { p_project_id: string };
        Returns: Json;
      };
      get_arena_state: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_arena_skills: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      start_arena_round: {
        Args: { p_mode: string; p_skill_id: string; p_duel_id?: string | null };
        Returns: Json;
      };
      submit_arena_answer: {
        Args: { p_round_id: string; p_question_id: string; p_selected_index: number };
        Returns: Json;
      };
      finish_arena_round: {
        Args: { p_round_id: string };
        Returns: Json;
      };
      find_duel_opponent: {
        Args: { p_skill_id: string };
        Returns: Json;
      };
      create_duel: {
        Args: { p_opponent_id: string; p_skill_id: string };
        Returns: Json;
      };
      get_arena_leaderboard: {
        Args: { p_scope?: string; p_period?: string; p_skill_id?: string | null };
        Returns: Json;
      };
      set_arena_leaderboard_opt_out: {
        Args: { p_opt_out: boolean };
        Returns: undefined;
      };
      get_my_question_bank: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      upsert_quiz_question: {
        Args: {
          p_skill_id: string;
          p_prompt: string;
          p_options: Json;
          p_correct_index: number;
          p_explanation?: string | null;
          p_difficulty?: string;
          p_id?: string | null;
        };
        Returns: Json;
      };
      admin_list_quiz_questions: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      admin_set_quiz_question: {
        Args: { p_id: string; p_approved_for_duel?: boolean | null; p_status?: string | null };
        Returns: Json;
      };
      add_skill_evidence: {
        Args: {
          p_skill_id: string;
          p_title: string;
          p_description?: string | null;
          p_evidence_type?: string;
          p_file_path?: string | null;
          p_external_url?: string | null;
          p_mime_type?: string | null;
          p_file_size?: number | null;
        };
        Returns: Json;
      };
      delete_skill_evidence: {
        Args: { p_id: string };
        Returns: Json;
      };
      get_my_evidence: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
