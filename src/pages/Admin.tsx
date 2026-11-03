import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IonAccordion,
  IonAccordionGroup,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { addOutline } from 'ionicons/icons';
import NotificationsButton from '../components/NotificationsButton';
import { useAuth } from '../hooks/useAuth';
import {
  adminListQuizQuestions,
  adminListStudents,
  adminSetQuizQuestion,
  deleteAdminAchievement,
  getAllAchievements,
  getAllChallenges,
  deleteAdminChallenge,
  deleteAdminSkill,
  deleteAdminStudent,
  getAdminStatistics,
  getFriendlyStudentError,
  getSkillCatalog,
  getStudentProfile,
  saveAdminAchievement,
  saveAdminChallenge,
  saveAdminSkill,
  setUserRole,
  type AdminQuizQuestion,
  type AdminStatistics,
  type AdminStudentRow,
  type Challenge,
  type Skill,
} from '../services/student';
import type { ProficiencyLevel } from '../types/supabase';
import FormModal from '../components/FormModal';
import './Admin.css';

type Tab = 'overview' | 'students' | 'catalog' | 'challenges' | 'achievements' | 'questions';
type AdminModal = 'skill' | 'challenge' | 'achievement' | null;

const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'students', label: 'Students' },
  { id: 'catalog', label: 'Skill catalog' },
  { id: 'challenges', label: 'Challenges' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'questions', label: 'Arena questions' },
];

const roleColors: Record<string, string> = {
  student: 'medium',
  moderator: 'tertiary',
  admin: 'danger',
};

// How many students have a profile per course, shown on the overview tab.
const countByCourse = (rows: AdminStudentRow[]): { course: string; count: number }[] => {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const key = row.course?.trim() || 'Not set';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([course, count]) => ({ course, count }))
    .sort((a, b) => b.count - a.count);
};

const Admin = () => {
  const { user } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<AdminStatistics | null>(null);
  const [students, setStudents] = useState<AdminStudentRow[]>([]);
  const [query, setQuery] = useState('');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [achievements, setAchievements] = useState<{ id: string; name: string; description: string | null; icon: string | null; criteria: string | null }[]>([]);
  const [questions, setQuestions] = useState<AdminQuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [skillDraft, setSkillDraft] = useState({ id: '', name: '', category: '', description: '' });
  const [challengeDraft, setChallengeDraft] = useState({ id: '', skill_id: '', title: '', description: '', difficulty: 'beginner' as ProficiencyLevel, instructions: '', xp_reward: '25' });
  const [achievementDraft, setAchievementDraft] = useState({ id: '', name: '', description: '', icon: '', criteria: '' });
  const [adminModal, setAdminModal] = useState<AdminModal>(null);
  const [adminModalError, setAdminModalError] = useState<string | null>(null);

  const isModerator = role === 'moderator' || role === 'admin';
  const isAdmin = role === 'admin';

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const check = async () => {
      try {
        const profile = await getStudentProfile(user.id);
        if (mounted) setRole(profile?.role ?? 'student');
      } catch {
        if (mounted) setRole('student');
      } finally {
        if (mounted) setRoleChecked(true);
      }
    };
    void check();
    return () => { mounted = false; };
  }, [user]);

  const load = useCallback(async () => {
    if (!isModerator || !user) return;
    setLoading(true);
    setError(null);
    try {
      const [loadedStats, loadedStudents, catalog] = await Promise.all([
        getAdminStatistics(),
        adminListStudents(query),
        getSkillCatalog(),
      ]);
      setStats(loadedStats);
      setStudents(loadedStudents);
      setSkills(catalog);
      const [loadedChallenges, loadedAchievements, loadedQuestions] = await Promise.all([
        getAllChallenges(),
        getAllAchievements(),
        adminListQuizQuestions(),
      ]);
      setChallenges(loadedChallenges);
      setAchievements(loadedAchievements);
      setQuestions(loadedQuestions);
    } catch (loadError) {
      setError(getFriendlyStudentError(loadError, 'We could not load the dashboard.'));
    } finally {
      setLoading(false);
    }
  }, [isModerator, user, query]);

  useEffect(() => { void load(); }, [load]);

  const categories = useMemo(
    () => [...new Set(skills.map((s) => s.category).filter(Boolean))].sort(),
    [skills],
  );
  const courseBreakdown = useMemo(() => countByCourse(students), [students]);

  const run = async (action: () => Promise<void>, successText: string) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(successText);
      await load();
    } catch (actionError) {
      setError(getFriendlyStudentError(actionError, 'That change could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  // Catalog, challenge and achievement records are edited in a popup so the
  // dashboard itself stays a list of what is there.
  const openAdminModal = (next: Exclude<AdminModal, null>) => {
    setAdminModalError(null);
    setAdminModal(next);
  };

  const handleSaveSkill = async () => {
    if (!skillDraft.name.trim() || !skillDraft.category.trim()) {
      setAdminModalError('A name and a category are required.');
      return;
    }
    setSaving(true);
    setAdminModalError(null);
    try {
      await saveAdminSkill({
        id: skillDraft.id || undefined,
        name: skillDraft.name.trim(),
        category: skillDraft.category.trim(),
        description: skillDraft.description.trim() || null,
      });
      setSkillDraft({ id: '', name: '', category: '', description: '' });
      setAdminModal(null);
      setMessage('Skill saved.');
      await load();
    } catch (saveError) {
      setAdminModalError(getFriendlyStudentError(saveError, 'We could not save that skill.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveChallenge = async () => {
    if (!challengeDraft.title.trim() || !challengeDraft.skill_id) {
      setAdminModalError('Choose a skill and give the challenge a title.');
      return;
    }
    setSaving(true);
    setAdminModalError(null);
    try {
      await saveAdminChallenge({
        id: challengeDraft.id || undefined,
        skill_id: challengeDraft.skill_id,
        title: challengeDraft.title.trim(),
        difficulty: challengeDraft.difficulty,
        instructions: challengeDraft.instructions.trim() || null,
        xp_reward: Number(challengeDraft.xp_reward) || 0,
      });
      setChallengeDraft({ id: '', skill_id: '', title: '', description: '', difficulty: 'beginner', instructions: '', xp_reward: '25' });
      setAdminModal(null);
      setMessage('Challenge saved.');
      await load();
    } catch (saveError) {
      setAdminModalError(getFriendlyStudentError(saveError, 'We could not save that challenge.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAchievement = async () => {
    if (!achievementDraft.name.trim()) {
      setAdminModalError('Give the achievement a name.');
      return;
    }
    setSaving(true);
    setAdminModalError(null);
    try {
      await saveAdminAchievement({
        id: achievementDraft.id || undefined,
        name: achievementDraft.name.trim(),
        icon: achievementDraft.icon.trim() || null,
        criteria: achievementDraft.criteria || null,
        description: achievementDraft.description.trim() || null,
      });
      setAchievementDraft({ id: '', name: '', description: '', icon: '', criteria: '' });
      setAdminModal(null);
      setMessage('Achievement saved.');
      await load();
    } catch (saveError) {
      setAdminModalError(getFriendlyStudentError(saveError, 'We could not save that achievement.'));
    } finally {
      setSaving(false);
    }
  };

  if (!roleChecked) {
    return (
      <IonPage>
        <IonHeader><IonToolbar><IonTitle>Admin</IonTitle></IonToolbar></IonHeader>
        <IonContent className="student-page">
          <div className="student-page__empty"><IonSpinner name="crescent" /></div>
        </IonContent>
      </IonPage>
    );
  }

  if (!isModerator) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar>
            <IonButtons slot="start"><IonButton fill="clear" routerLink="/tabs/home">Back</IonButton></IonButtons>
            <IonTitle>Admin</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent className="student-page">
          <main className="student-page__content">
            <div className="student-page__empty">
              <IonText color="medium">This area is for moderators and administrators.</IonText>
              <IonButton fill="outline" routerLink="/tabs/home">Back to Home</IonButton>
            </div>
          </main>
        </IonContent>
      </IonPage>
    );
  }

  // The statistics payload is read defensively so a partial response cannot
  // take the whole dashboard down.
  const tiles = stats ? [
    { label: 'Students', value: stats.students?.total ?? 0 },
    { label: 'Teaching', value: stats.students?.teaching ?? 0 },
    { label: 'Skills', value: stats.catalog?.skills ?? 0 },
    { label: 'Categories', value: stats.catalog?.skill_categories ?? 0 },
    { label: 'Sessions', value: stats.sessions?.total ?? 0 },
    { label: 'Sessions completed', value: stats.sessions?.completed ?? 0 },
    { label: 'Missions', value: stats.sessions?.missions ?? 0 },
    { label: 'Activities', value: stats.sessions?.activities ?? 0 },
    { label: 'Challenges', value: stats.catalog?.challenges ?? 0 },
    { label: 'Awaiting review', value: stats.challenges?.awaiting_review ?? 0 },
    { label: 'Endorsements', value: stats.recognition?.endorsements ?? 0 },
    { label: 'XP awarded', value: stats.recognition?.total_xp_awarded ?? 0 },
  ] : [];

  return (
    <IonPage className="admin-page">
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton fill="clear" routerLink="/tabs/home" aria-label="Back to Home">Back</IonButton>
          </IonButtons>
          <IonTitle>Admin</IonTitle>
          <IonButtons slot="end"><NotificationsButton /></IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="student-page">
        <main className="student-page__content">
          <section className="student-page__hero">
            <p className="student-page__eyebrow">PLATFORM CONTROL</p>
            <h1>Admin dashboard</h1>
            <p className="student-page__lead">
              Signed in as <strong>{role}</strong>. Every action here is authorised by the
              database, not just hidden in the interface.
            </p>
          </section>

          {error && (
            <div className="student-page__alert student-page__alert--error" role="alert">
              <IonText color="danger">{error}</IonText>
            </div>
          )}
          {message && (
            <div className="student-page__alert student-page__alert--success" role="status">
              <IonText color="success">{message}</IonText>
            </div>
          )}

          <nav className="admin-page__tabs" aria-label="Dashboard sections">
            {tabs.map((item) => (
              <IonButton
                key={item.id}
                size="small"
                fill={tab === item.id ? 'solid' : 'outline'}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </IonButton>
            ))}
          </nav>

          {loading && <div className="student-page__empty"><IonSpinner name="crescent" /></div>}

          {!loading && tab === 'overview' && stats && (
            <>
              <ul className="passport-page__summary">
                {tiles.map((tile) => (
                  <li key={tile.label}><strong>{tile.value}</strong><span>{tile.label}</span></li>
                ))}
              </ul>
              <IonCard>
                <IonCardHeader><IonCardTitle>Role breakdown</IonCardTitle></IonCardHeader>
                <IonCardContent>
                  <p>{stats.students?.admins ?? 0} admin(s) · {stats.students?.moderators ?? 0} moderator(s) · {stats.students?.total ?? 0} total</p>
                  <p className="student-page__card-note">
                    {stats.catalog?.achievements_defined ?? 0} achievement type(s) defined,
                    {' '}{stats.catalog?.achievements_awarded ?? 0} awarded.
                    {' '}{stats.recognition?.active_learners ?? 0} student(s) have earned XP.
                  </p>
                  {courseBreakdown.length > 0 && (
                    <p className="student-page__card-note">
                      By course: {courseBreakdown.map((row) => `${row.course} (${row.count})`).join(' · ')}
                      {categories.length > 0 && ` — catalog covers ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`}
                    </p>
                  )}
                </IonCardContent>
              </IonCard>
            </>
          )}

          {!loading && tab === 'students' && (
            <IonCard>
              <IonCardHeader>
                <IonCardTitle>Students ({students.length})</IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                <IonSearchbar value={query} placeholder="Search name, email or course" onIonInput={(e) => setQuery(e.detail.value ?? '')} />
                {students.map((row) => (
                  <article className="admin-page__row" key={row.student_id}>
                    <div className="student-page__goal-heading">
                      <div>
                        <h2>{row.full_name}</h2>
                        <p>{row.email ?? 'No email'}{row.course ? ` · ${row.course}` : ''}</p>
                      </div>
                      <IonBadge color={roleColors[row.role] ?? 'medium'}>{row.role}</IonBadge>
                    </div>
                    <p className="student-page__card-note">
                      {row.skills_count} skill(s) · {row.teachable_count} teachable · {row.sessions_completed} learned ·
                      {' '}{row.sessions_taught} taught · {row.challenges_passed} challenge(s) ·
                      {' '}{row.endorsements_received} endorsement(s) · {row.achievements_earned} badge(s) ·
                      {' '}{row.total_xp} XP
                    </p>
                    <div className="admin-page__row-actions">
                      <IonSelect
                        value={row.role}
                        interface="popover"
                        onIonChange={(event) => void run(
                          () => setUserRole(row.student_id, event.detail.value as string),
                          `Updated ${row.full_name} to ${event.detail.value}.`,
                        )}
                      >
                        <IonSelectOption value="student">student</IonSelectOption>
                        <IonSelectOption value="moderator">moderator</IonSelectOption>
                        <IonSelectOption value="admin" disabled={!isAdmin}>admin</IonSelectOption>
                      </IonSelect>
                      {isAdmin && row.student_id !== user?.id && (
                        <IonButton
                          size="small" color="danger" fill="outline" disabled={saving}
                          onClick={() => {
                            if (window.confirm(`Delete ${row.full_name}? This removes their sessions, submissions and badges permanently.`)) {
                              void run(() => deleteAdminStudent(row.student_id), `Deleted ${row.full_name}.`);
                            }
                          }}
                        >
                          Delete
                        </IonButton>
                      )}
                    </div>
                  </article>
                ))}
              </IonCardContent>
            </IonCard>
          )}

          {!loading && tab === 'catalog' && (
            <IonCard>
              <IonCardHeader>
                <div className="student-page__card-heading">
                  <div>
                    <IonCardTitle>Skill catalog ({skills.length})</IonCardTitle>
                    <IonCardSubtitle>Students pick from this list, so changes affect everyone.</IonCardSubtitle>
                  </div>
                  <IonButton size="small" onClick={() => {
                    setSkillDraft({ id: '', name: '', category: '', description: '' });
                    openAdminModal('skill');
                  }}>
                    <IonIcon slot="start" icon={addOutline} />
                    Add skill
                  </IonButton>
                </div>
              </IonCardHeader>
              <IonCardContent>
                <IonAccordionGroup>
                  {skills.map((skill) => (
                    <IonAccordion value={skill.id} key={skill.id}>
                      <IonItem slot="header">
                        <IonLabel>{skill.name}</IonLabel>
                        <IonBadge color="tertiary" slot="end">{skill.category}</IonBadge>
                      </IonItem>
                      <div className="ion-padding">
                        <p className="student-page__card-note">{skill.description || 'No description.'}</p>
                        <div className="student-page__inline-actions">
                          <IonButton size="small" fill="outline" onClick={() => {
                            setSkillDraft({
                              id: skill.id, name: skill.name, category: skill.category, description: skill.description ?? '',
                            });
                            openAdminModal('skill');
                          }}>Edit</IonButton>
                          <IonButton size="small" fill="clear" color="danger" disabled={saving} onClick={() => {
                            if (window.confirm(`Delete "${skill.name}"? Students who hold it keep the record, but it leaves the catalog.`)) {
                              void run(() => deleteAdminSkill(skill.id), `Deleted ${skill.name}.`);
                            }
                          }}>Delete</IonButton>
                        </div>
                      </div>
                    </IonAccordion>
                  ))}
                </IonAccordionGroup>
              </IonCardContent>
            </IonCard>
          )}

          {!loading && tab === 'challenges' && (
            <IonCard>
              <IonCardHeader>
                <div className="student-page__card-heading">
                  <div>
                    <IonCardTitle>Challenges ({challenges.length})</IonCardTitle>
                    <IonCardSubtitle>The XP value is the amount a passing submission awards.</IonCardSubtitle>
                  </div>
                  <IonButton size="small" onClick={() => {
                    setChallengeDraft({ id: '', skill_id: '', title: '', description: '', difficulty: 'beginner', instructions: '', xp_reward: '25' });
                    openAdminModal('challenge');
                  }}>
                    <IonIcon slot="start" icon={addOutline} />
                    Add challenge
                  </IonButton>
                </div>
              </IonCardHeader>
              <IonCardContent>
                {challenges.map((challenge) => (
                  <article className="admin-page__row" key={challenge.id}>
                    <div className="student-page__goal-heading">
                      <div>
                        <h2>{challenge.title}</h2>
                        <p>{skills.find((s) => s.id === challenge.skill_id)?.name ?? 'Unknown skill'}</p>
                      </div>
                      <IonBadge color="primary">{challenge.xp_reward} XP</IonBadge>
                    </div>
                    <div className="admin-page__row-actions">
                      <IonBadge color={difficultyColors[challenge.difficulty]}>{challenge.difficulty}</IonBadge>
                      <IonButton size="small" fill="outline" onClick={() => {
                        setChallengeDraft({
                          id: challenge.id, skill_id: challenge.skill_id, title: challenge.title,
                          description: challenge.description ?? '', difficulty: challenge.difficulty,
                          instructions: challenge.instructions ?? '', xp_reward: String(challenge.xp_reward),
                        });
                        openAdminModal('challenge');
                      }}>Edit</IonButton>
                      <IonButton size="small" fill="clear" color="danger" disabled={saving} onClick={() => {
                        if (window.confirm(`Delete "${challenge.title}"? Its submissions go with it.`)) {
                          void run(() => deleteAdminChallenge(challenge.id), `Deleted ${challenge.title}.`);
                        }
                      }}>Delete</IonButton>
                    </div>
                  </article>
                ))}
              </IonCardContent>
            </IonCard>
          )}

          {!loading && tab === 'achievements' && (
            <IonCard>
              <IonCardHeader>
                <div className="student-page__card-heading">
                  <div>
                    <IonCardTitle>Achievements ({achievements.length})</IonCardTitle>
                    <IonCardSubtitle>
                      The criteria key decides when an achievement is awarded, and each key can only
                      be used once.
                    </IonCardSubtitle>
                  </div>
                  <IonButton size="small" onClick={() => {
                    setAchievementDraft({ id: '', name: '', description: '', icon: '', criteria: '' });
                    openAdminModal('achievement');
                  }}>
                    <IonIcon slot="start" icon={addOutline} />
                    Add achievement
                  </IonButton>
                </div>
              </IonCardHeader>
              <IonCardContent>
                {achievements.map((achievement) => (
                  <article className="admin-page__row" key={achievement.id}>
                    <div className="student-page__goal-heading">
                      <div>
                        <h2>{achievement.icon ? `${achievement.icon} ` : ''}{achievement.name}</h2>
                        <p>{achievement.description ?? 'No description.'}</p>
                      </div>
                      <IonBadge color={achievement.criteria ? 'success' : 'medium'}>
                        {achievement.criteria ?? 'no criteria'}
                      </IonBadge>
                    </div>
                    <div className="admin-page__row-actions">
                      <IonButton size="small" fill="outline" onClick={() => {
                        setAchievementDraft({
                          id: achievement.id, name: achievement.name,
                          description: achievement.description ?? '', icon: achievement.icon ?? '',
                          criteria: achievement.criteria ?? '',
                        });
                        openAdminModal('achievement');
                      }}>Edit</IonButton>
                      <IonButton size="small" fill="clear" color="danger" disabled={saving} onClick={() => {
                        if (window.confirm(`Delete "${achievement.name}"? Awards already given are removed too.`)) {
                          void run(() => deleteAdminAchievement(achievement.id), `Deleted ${achievement.name}.`);
                        }
                      }}>Delete</IonButton>
                    </div>
                  </article>
                ))}
              </IonCardContent>
            </IonCard>
          )}

          {!loading && tab === 'questions' && (
            <IonCard>
              <IonCardHeader>
                <div className="student-page__card-heading">
                  <div>
                    <IonCardTitle>Arena questions ({questions.length})</IonCardTitle>
                    <IonCardSubtitle>
                      Teacher questions play in Solo Rush immediately. Approve one to let it appear
                      in ranked Duels.
                    </IonCardSubtitle>
                  </div>
                </div>
              </IonCardHeader>
              <IonCardContent>
                {questions.length === 0 ? (
                  <p className="student-page__card-note">No Arena questions have been written yet.</p>
                ) : (
                  questions.map((question) => (
                    <article className="admin-page__row" key={question.id}>
                      <div className="student-page__goal-heading">
                        <div>
                          <h2>{question.prompt}</h2>
                          <p>
                            {question.skill_name}
                            {' · '}
                            {question.source}
                            {' · '}
                            {question.author_name}
                            {' · '}
                            {question.correct_rate === null
                              ? 'no answers yet'
                              : `${question.correct_rate}% correct`}
                          </p>
                        </div>
                        <div className="admin-page__row-actions">
                          <IonBadge color={question.approved_for_duel ? 'success' : 'medium'}>
                            {question.approved_for_duel ? 'In duels' : 'Practice only'}
                          </IonBadge>
                          <IonBadge color={
                            question.status === 'active'
                              ? 'primary'
                              : question.status === 'flagged' ? 'warning' : 'danger'
                          }>
                            {question.status}
                          </IonBadge>
                        </div>
                      </div>
                      <div className="admin-page__row-actions">
                        <IonButton
                          size="small"
                          fill="outline"
                          disabled={saving}
                          onClick={() => {
                            void run(
                              () => adminSetQuizQuestion(question.id, !question.approved_for_duel, null),
                              question.approved_for_duel
                                ? 'Question removed from duels.'
                                : 'Question approved for duels.',
                            );
                          }}
                        >
                          {question.approved_for_duel ? 'Unapprove' : 'Approve'}
                        </IonButton>
                        <IonButton
                          size="small"
                          fill="clear"
                          color="danger"
                          disabled={saving}
                          onClick={() => {
                            void run(
                              () => adminSetQuizQuestion(
                                question.id,
                                null,
                                question.status === 'rejected' ? 'active' : 'rejected',
                              ),
                              question.status === 'rejected'
                                ? 'Question restored.'
                                : 'Question rejected.',
                            );
                          }}
                        >
                          {question.status === 'rejected' ? 'Restore' : 'Reject'}
                        </IonButton>
                      </div>
                    </article>
                  ))
                )}
              </IonCardContent>
            </IonCard>
          )}
        </main>
      </IonContent>

      <FormModal
        isOpen={adminModal === 'skill'}
        title={skillDraft.id ? 'Edit skill' : 'Add a skill'}
        subtitle="Students pick their skills from the catalog, so this list affects everyone."
        onDismiss={() => setAdminModal(null)}
        onSubmit={() => void handleSaveSkill()}
        submitting={saving}
        submitLabel={skillDraft.id ? 'Update skill' : 'Add skill'}
      >
        {adminModalError && <p className="app-modal__error" role="alert">{adminModalError}</p>}
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Name</IonLabel>
          <IonInput
            fill="outline"
            value={skillDraft.name}
            placeholder="Figma"
            onIonInput={(e) => setSkillDraft((c) => ({ ...c, name: e.detail.value ?? '' }))}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Category</IonLabel>
          <IonInput
            fill="outline"
            value={skillDraft.category}
            placeholder="UI/UX Design"
            onIonInput={(e) => setSkillDraft((c) => ({ ...c, category: e.detail.value ?? '' }))}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Description</IonLabel>
          <IonTextarea
            fill="outline"
            autoGrow
            value={skillDraft.description}
            placeholder="What this skill covers."
            onIonInput={(e) => setSkillDraft((c) => ({ ...c, description: e.detail.value ?? '' }))}
          />
        </IonItem>
      </FormModal>

      <FormModal
        isOpen={adminModal === 'challenge'}
        title={challengeDraft.id ? 'Edit challenge' : 'Add a challenge'}
        subtitle="The XP value is the amount a passing submission awards."
        onDismiss={() => setAdminModal(null)}
        onSubmit={() => void handleSaveChallenge()}
        submitting={saving}
        submitLabel={challengeDraft.id ? 'Update challenge' : 'Add challenge'}
      >
        {adminModalError && <p className="app-modal__error" role="alert">{adminModalError}</p>}
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Skill</IonLabel>
          <IonSelect
            fill="outline"
            value={challengeDraft.skill_id}
            placeholder="Select a skill"
            onIonChange={(e) => setChallengeDraft((c) => ({ ...c, skill_id: e.detail.value }))}
          >
            {skills.map((skill) => <IonSelectOption key={skill.id} value={skill.id}>{skill.name}</IonSelectOption>)}
          </IonSelect>
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Title</IonLabel>
          <IonInput
            fill="outline"
            value={challengeDraft.title}
            placeholder="Average of three numbers"
            onIonInput={(e) => setChallengeDraft((c) => ({ ...c, title: e.detail.value ?? '' }))}
          />
        </IonItem>
        <div className="student-page__form-grid">
          <IonItem className="app-form-field">
            <IonLabel position="stacked">Difficulty</IonLabel>
            <IonSelect
              fill="outline"
              value={challengeDraft.difficulty}
              onIonChange={(e) => setChallengeDraft((c) => ({ ...c, difficulty: e.detail.value as ProficiencyLevel }))}
            >
              {(['beginner', 'intermediate', 'advanced', 'expert'] as ProficiencyLevel[]).map((d) => (
                <IonSelectOption key={d} value={d}>{d}</IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
          <IonItem className="app-form-field">
            <IonLabel position="stacked">XP reward</IonLabel>
            <IonInput
              fill="outline"
              type="number"
              min="0"
              value={challengeDraft.xp_reward}
              onIonInput={(e) => setChallengeDraft((c) => ({ ...c, xp_reward: e.detail.value ?? '0' }))}
            />
          </IonItem>
        </div>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Instructions</IonLabel>
          <IonTextarea
            fill="outline"
            autoGrow
            value={challengeDraft.instructions}
            placeholder="What the student has to build or show."
            onIonInput={(e) => setChallengeDraft((c) => ({ ...c, instructions: e.detail.value ?? '' }))}
          />
        </IonItem>
      </FormModal>

      <FormModal
        isOpen={adminModal === 'achievement'}
        title={achievementDraft.id ? 'Edit achievement' : 'Add an achievement'}
        subtitle="The criteria key decides when the achievement is awarded."
        onDismiss={() => setAdminModal(null)}
        onSubmit={() => void handleSaveAchievement()}
        submitting={saving}
        submitLabel={achievementDraft.id ? 'Update achievement' : 'Add achievement'}
      >
        {adminModalError && <p className="app-modal__error" role="alert">{adminModalError}</p>}
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Name</IonLabel>
          <IonInput
            fill="outline"
            value={achievementDraft.name}
            placeholder="Challenge Master"
            onIonInput={(e) => setAchievementDraft((c) => ({ ...c, name: e.detail.value ?? '' }))}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Icon (emoji)</IonLabel>
          <IonInput
            fill="outline"
            value={achievementDraft.icon}
            placeholder="🏆"
            onIonInput={(e) => setAchievementDraft((c) => ({ ...c, icon: e.detail.value ?? '' }))}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Criteria key</IonLabel>
          <IonSelect
            fill="outline"
            value={achievementDraft.criteria}
            onIonChange={(e) => setAchievementDraft((c) => ({ ...c, criteria: e.detail.value }))}
          >
            <IonSelectOption value="">None (never awarded)</IonSelectOption>
            {criteriaOptions.map((key) => <IonSelectOption key={key} value={key}>{key}</IonSelectOption>)}
          </IonSelect>
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Description</IonLabel>
          <IonTextarea
            fill="outline"
            autoGrow
            value={achievementDraft.description}
            placeholder="What this badge celebrates."
            onIonInput={(e) => setAchievementDraft((c) => ({ ...c, description: e.detail.value ?? '' }))}
          />
        </IonItem>
      </FormModal>
    </IonPage>
  );
};

// Criteria keys the award_achievements() function knows how to evaluate.
// A key outside this list would never be awarded, so the UI only offers these.
const criteriaOptions = [
  'first_skill_shared',
  'first_session_completed',
  'first_session_taught',
  'practice_streak',
  'first_challenge_passed',
  'helpful_peer',
];

const difficultyColors: Record<string, string> = {
  beginner: 'success',
  intermediate: 'primary',
  advanced: 'tertiary',
  expert: 'warning',
};

export default Admin;