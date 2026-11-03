export {
  getFriendlyAuthError,
  loginUser,
  logoutUser,
  registerUser,
} from './auth';

export {
  getSupabaseClient,
  getSupabaseConfigStatus,
  isSupabaseConfigured,
  supabase,
} from './supabase';

export {
  addLearningGoal,
  addStudentSkill,
  getFriendlyStudentError,
  getDiscoverableStudents,
  getLearningGoals,
  getSkillCatalog,
  getStudentProfile,
  getStudentSkills,
  removeLearningGoal,
  removeStudentSkill,
  saveStudentProfile,
  updateLearningGoal,
  updateStudentSkill,
} from './student';
