import { useEffect, useMemo, useState } from 'react';
import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonButtons,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  useIonRouter,
} from '@ionic/react';
import { useAuth } from '../hooks/useAuth';
import { addOutline, refreshOutline } from 'ionicons/icons';
import { getGoogleCalendarUrl } from '../utils/calendar';
import FormModal from '../components/FormModal';
import NotificationsButton from '../components/NotificationsButton';
import SessionLearningPanel from '../components/SessionLearningPanel';
import {
  addLearningGoal,
  cancelLearningSession,
  getFriendlyStudentError,
  getOrCreateSessionConversation,
  getStudentLearningSessions,
  getStudentNames,
  getLearningGoals,
  getSkillCatalog,
  proposeLearningSessionTime,
  removeLearningGoal,
  respondToLearningRequest,
  respondToSessionTimeChange,
  updateLearningGoal,
  type LearningGoal,
  type LearningGoalInput,
  type LearningSession,
  type Skill,
} from '../services/student';
import type { LearningGoalPriority, LearningGoalStatus, LearningSessionStatus, ProficiencyLevel } from '../types/supabase';
import '../components/AuthLoading.css';
import './StudentPages.css';

const proficiencyLevels: ProficiencyLevel[] = ['beginner', 'intermediate', 'advanced', 'expert'];
const priorities: LearningGoalPriority[] = ['low', 'medium', 'high'];
const statuses: LearningGoalStatus[] = ['active', 'paused', 'completed', 'cancelled'];

type GoalFormState = LearningGoalInput;

const emptyGoalForm: GoalFormState = {
  skill_id: '',
  current_level: 'beginner',
  target_level: 'intermediate',
  goal_description: '',
  priority: 'medium',
  status: 'active',
};

const formatLabel = (value: string) => value.replace('_', ' ').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

// Every session status gets its own colour. The previous nested ternary only
// distinguished accepted / declined, so 'completed', 'cancelled', 'requested',
// 'scheduled' and 'no_show' all rendered the same blue and a finished session
// looked identical to one still waiting to be agreed.
const sessionStatusColors: Record<LearningSessionStatus, string> = {
  requested: 'warning',
  accepted: 'primary',
  scheduled: 'primary',
  completed: 'success',
  declined: 'medium',
  cancelled: 'medium',
  no_show: 'danger',
};

const toLocalDateTimeInput = (value: string) => {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const Learning = () => {
  const { user, loading: authLoading } = useAuth();
  const router = useIonRouter();
  const [catalog, setCatalog] = useState<Skill[]>([]);
  const [goals, setGoals] = useState<LearningGoal[]>([]);
  const [sessions, setSessions] = useState<LearningSession[]>([]);
  const [studentNames, setStudentNames] = useState<Map<string, string>>(new Map());
  const [form, setForm] = useState<GoalFormState>(emptyGoalForm);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalModalError, setGoalModalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [respondingSessionId, setRespondingSessionId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [reschedulingSessionId, setReschedulingSessionId] = useState<string | null>(null);
  const [timeDraft, setTimeDraft] = useState('');
  const [timeModalError, setTimeModalError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    let isMounted = true;

    const loadLearningData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [loadedCatalog, loadedGoals, loadedSessions] = await Promise.all([
          getSkillCatalog(),
          getLearningGoals(user.id),
          getStudentLearningSessions(user.id),
        ]);

        const names = await getStudentNames([...new Set(loadedSessions.flatMap((session) => [
          session.learner_id,
          session.teacher_id,
        ]))]);

        if (!isMounted) {
          return;
        }

        setCatalog(loadedCatalog);
        setGoals(loadedGoals);
        setSessions(loadedSessions);
        setStudentNames(names);
      } catch (loadError) {
        if (isMounted) {
          setError(getFriendlyStudentError(loadError, 'We could not load your learning data.'));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadLearningData();

    return () => {
      isMounted = false;
    };
  }, [reloadKey, user]);

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  const handleOpenSessionChat = async (sessionId: string) => {
    setRespondingSessionId(sessionId);
    setError(null);
    setMessage(null);
    try {
      const conversationId = await getOrCreateSessionConversation(sessionId);
      await router.push(`/tabs/messages?open=${conversationId}`);
    } catch (chatError) {
      setError(getFriendlyStudentError(chatError, 'We could not open that session chat.'));
    } finally {
      setRespondingSessionId(null);
    }
  };

  const handleSessionResponse = async (session: LearningSession, accept: boolean) => {
    setRespondingSessionId(session.id);
    setError(null);
    setMessage(null);
    try {
      const updated = await respondToLearningRequest(session.id, accept);
      setSessions((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMessage(accept ? 'Learning request accepted.' : 'Learning request declined.');
    } catch (responseError) {
      setError(getFriendlyStudentError(responseError, 'We could not update that learning request.'));
    } finally {
      setRespondingSessionId(null);
    }
  };

  const handleCancelSession = async (session: LearningSession) => {
    if (!window.confirm('Cancel this session? This cannot be undone.')) return;
    setRespondingSessionId(session.id);
    setError(null);
    setMessage(null);
    try {
      const updated = await cancelLearningSession(session.id);
      setSessions((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMessage('Session cancelled.');
    } catch (cancelError) {
      setError(getFriendlyStudentError(cancelError, 'We could not cancel that session.'));
    } finally {
      setRespondingSessionId(null);
    }
  };

  const handleProposeTime = async (session: LearningSession) => {
    const proposedDate = new Date(timeDraft);
    if (Number.isNaN(proposedDate.getTime()) || proposedDate.getTime() <= Date.now()) {
      setTimeModalError('Choose a future date and time.');
      return;
    }
    setRespondingSessionId(session.id);
    setError(null);
    setMessage(null);
    try {
      const updated = await proposeLearningSessionTime(session.id, proposedDate.toISOString());
      setSessions((current) => current.map((item) => item.id === updated.id ? updated : item));
      setReschedulingSessionId(null);
      setTimeModalError(null);
      setMessage('New time proposed. It will change once the other participant agrees.');
    } catch (proposalError) {
      setTimeModalError(getFriendlyStudentError(proposalError, 'We could not propose that session time.'));
    } finally {
      setRespondingSessionId(null);
    }
  };

  const handleTimeChangeResponse = async (session: LearningSession, accept: boolean) => {
    setRespondingSessionId(session.id);
    setError(null);
    setMessage(null);
    try {
      const updated = await respondToSessionTimeChange(session.id, accept);
      setSessions((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMessage(accept ? 'New session time accepted.' : 'Time change declined. The original time remains.');
    } catch (responseError) {
      setError(getFriendlyStudentError(responseError, 'We could not respond to that time change.'));
    } finally {
      setRespondingSessionId(null);
    }
  };

  const catalogById = useMemo(
    () => new Map(catalog.map((skill) => [skill.id, skill])),
    [catalog],
  );

  const handleGoalSubmit = async () => {
    setGoalModalError(null);
    setError(null);
    setMessage(null);

    if (!user || !form.skill_id || !form.current_level || !form.target_level) {
      setGoalModalError('Choose a skill, current level, and target level before saving.');
      return;
    }

    setSaving(true);

    try {
      const input: LearningGoalInput = {
        ...form,
        goal_description: form.goal_description?.trim() || null,
      };
      const savedGoal = editingGoalId
        ? await updateLearningGoal(user.id, editingGoalId, input)
        : await addLearningGoal(user.id, input);

      setGoals((current) => {
        if (editingGoalId) {
          return current.map((goal) => (goal.id === savedGoal.id ? savedGoal : goal));
        }
        return [savedGoal, ...current];
      });
      setForm(emptyGoalForm);
      setEditingGoalId(null);
      setGoalModalOpen(false);
      setMessage(editingGoalId ? 'Learning goal updated.' : 'Learning goal added.');
    } catch (saveError) {
      setGoalModalError(getFriendlyStudentError(saveError, 'We could not save that learning goal.'));
    } finally {
      setSaving(false);
    }
  };

  const openAddGoalModal = () => {
    setEditingGoalId(null);
    setForm(emptyGoalForm);
    setGoalModalError(null);
    setGoalModalOpen(true);
  };

  const handleEdit = (goal: LearningGoal) => {
    setEditingGoalId(goal.id);
    setForm({
      skill_id: goal.skill_id,
      current_level: goal.current_level,
      target_level: goal.target_level,
      goal_description: goal.goal_description ?? '',
      priority: goal.priority,
      status: goal.status,
    });
    setGoalModalError(null);
    setError(null);
    setMessage(null);
    setGoalModalOpen(true);
  };

  const openTimeModal = (session: LearningSession) => {
    setTimeDraft(toLocalDateTimeInput(session.scheduled_at));
    setTimeModalError(null);
    setReschedulingSessionId(session.id);
  };

  const handleDelete = async (goal: LearningGoal) => {
    if (!user) {
      return;
    }

    setDeletingGoalId(goal.id);
    setError(null);
    setMessage(null);

    try {
      await removeLearningGoal(user.id, goal.id);
      setGoals((current) => current.filter((currentGoal) => currentGoal.id !== goal.id));
      if (editingGoalId === goal.id) {
        setEditingGoalId(null);
        setForm(emptyGoalForm);
      }
      setMessage('Learning goal removed.');
    } catch (deleteError) {
      setError(getFriendlyStudentError(deleteError, 'We could not remove that learning goal.'));
    } finally {
      setDeletingGoalId(null);
    }
  };

  if (authLoading || loading || !user) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Learning</IonTitle>
            <IonButtons slot="end"><NotificationsButton /></IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="student-page">
          <div className="auth-loading">
            <IonSpinner name="crescent" />
            <IonText color="medium">Loading...</IonText>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Learning</IonTitle>
          <IonButtons slot="end"><NotificationsButton /></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="student-page">
        <main className="student-page__content">
          <section className="student-page__hero">
            <p className="student-page__eyebrow">YOUR NEXT MILESTONE</p>
            <h1>Learning goals</h1>
            <p className="student-page__lead">Turn the skills you want to build into clear, trackable goals.</p>
            <IonButton fill="outline" routerLink="/tabs/challenges">
              Go to Skill Challenges
            </IonButton>
            <IonButton fill="clear" routerLink="/tabs/self-paced">
              Explore self-paced lessons
            </IonButton>
          </section>

          {error && (
            <div className="student-page__alert learning-page__alert learning-page__alert--error" role="alert">
              <IonText>{error}</IonText>
            </div>
          )}
          {message && (
            <div className="student-page__alert learning-page__alert learning-page__alert--success" role="status">
              <IonText>{message}</IonText>
            </div>
          )}

          <section aria-labelledby="learning-sessions-title">
            <div className="student-page__goal-heading">
              <h2 id="learning-sessions-title">Requests &amp; peer sessions</h2>
              <IonButton fill="clear" size="small" onClick={() => setReloadKey((current) => current + 1)}>
                <IonIcon slot="start" icon={refreshOutline} />
                Refresh
              </IonButton>
            </div>
            {sessions.length === 0 ? (
              <div className="student-page__empty">
                <IonText color="medium">No sessions found. Requests sent while this page was open will appear after refreshing.</IonText>
              </div>
            ) : sessions.map((session) => {
              const isLearner = session.learner_id === user.id;
              const otherStudentId = isLearner ? session.teacher_id : session.learner_id;
              const skill = catalogById.get(session.skill_id);
              return (
                <IonCard key={session.id}>
                  <IonCardHeader>
                    <div className="student-page__goal-heading">
                      <IonCardTitle>{skill?.name ?? 'Learning session'}</IonCardTitle>
                      <IonBadge color={sessionStatusColors[session.status] ?? 'medium'}>
                        {formatLabel(session.status)}
                      </IonBadge>
                    </div>
                    <p className="student-page__card-note">
                      {isLearner ? 'Teacher' : 'Learner'}: {studentNames.get(otherStudentId) ?? 'SkillForge student'}
                    </p>
                  </IonCardHeader>
                  <IonCardContent>
                    <p>{new Date(session.scheduled_at).toLocaleString()}</p>
                    <p>{session.duration_minutes} minutes · {isLearner ? 'You requested this session' : 'Session request received'}</p>
                    <div className="student-page__inline-actions">
                      <IonButton
                        size="small"
                        fill="outline"
                        onClick={() => void handleOpenSessionChat(session.id)}
                        disabled={respondingSessionId === session.id}
                      >
                        Open session chat
                      </IonButton>
                      {['accepted', 'scheduled'].includes(session.status) && (
                        <IonButton
                          size="small"
                          fill="outline"
                          href={getGoogleCalendarUrl(
                            session,
                            skill?.name ?? 'Learning session',
                            studentNames.get(otherStudentId) ?? 'SkillForge student',
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Add to Google Calendar
                        </IonButton>
                      )}
                    </div>
                    {session.learning_objectives && <p>{session.learning_objectives}</p>}
                    {session.proposed_scheduled_at && (
                      <div className="student-page__alert">
                        <p>
                          Proposed time: {new Date(session.proposed_scheduled_at).toLocaleString()}
                          {session.proposed_by === user.id ? ' · Waiting for the other participant' : ' · Your response is needed'}
                        </p>
                        {session.proposed_by !== user.id && (
                          <div className="student-page__inline-actions">
                            <IonButton size="small" onClick={() => void handleTimeChangeResponse(session, true)} disabled={respondingSessionId === session.id}>
                              Accept new time
                            </IonButton>
                            <IonButton size="small" fill="clear" color="medium" onClick={() => void handleTimeChangeResponse(session, false)} disabled={respondingSessionId === session.id}>
                              Decline
                            </IonButton>
                          </div>
                        )}
                      </div>
                    )}
                    {!isLearner && session.status === 'requested' && (
                      <div className="student-page__inline-actions">
                        <IonButton onClick={() => void handleSessionResponse(session, true)} disabled={respondingSessionId === session.id}>
                          {respondingSessionId === session.id ? <IonSpinner name="crescent" /> : 'Accept'}
                        </IonButton>
                        <IonButton fill="clear" color="medium" onClick={() => void handleSessionResponse(session, false)} disabled={respondingSessionId === session.id}>
                          Decline
                        </IonButton>
                      </div>
                    )}
                    {session.status === 'requested' && isLearner && (
                      <IonButton fill="clear" color="medium" onClick={() => void handleCancelSession(session)} disabled={respondingSessionId === session.id}>
                        Cancel request
                      </IonButton>
                    )}
                    {['accepted', 'scheduled'].includes(session.status) && !session.proposed_scheduled_at && (
                      <div className="student-page__inline-actions">
                        <IonButton
                          size="small"
                          fill="outline"
                          onClick={() => openTimeModal(session)}
                        >Change time</IonButton>
                        <IonButton size="small" fill="clear" color="danger" onClick={() => void handleCancelSession(session)} disabled={respondingSessionId === session.id}>
                          Cancel session
                        </IonButton>
                      </div>
                    )}
                    {['accepted', 'scheduled'].includes(session.status) && (
                      <SessionLearningPanel
                        session={session}
                        userId={user.id}
                        isTeacher={!isLearner}
                        onSessionCompleted={() => setReloadKey((key) => key + 1)}
                      />
                    )}
                  </IonCardContent>
                </IonCard>
              );
            })}
          </section>

          <IonCard>
            <IonCardHeader>
              <div className="student-page__card-heading">
                <div>
                  <IonCardTitle>Learning goals</IonCardTitle>
                  <p className="student-page__card-note">
                    What you want to learn next, and how far along you already are.
                  </p>
                </div>
                <IonButton size="small" onClick={openAddGoalModal} disabled={catalog.length === 0}>
                  <IonIcon slot="start" icon={addOutline} />
                  Add goal
                </IonButton>
              </div>
            </IonCardHeader>
          </IonCard>

          {goals.length === 0 ? (
            <div className="student-page__empty">
              <IonText color="medium">No learning goals yet. Add one above to give your next step a direction.</IonText>
            </div>
          ) : (
            <section className="student-page__goal-list" aria-label="Your learning goals">
              {goals.map((goal) => {
                const skill = catalogById.get(goal.skill_id);
                return (
                  <IonCard key={goal.id}>
                    <IonCardHeader>
                      <div className="student-page__goal-heading">
                        <IonCardTitle>{skill?.name ?? 'Unavailable skill'}</IonCardTitle>
                        <IonBadge color={goal.status === 'completed' ? 'success' : goal.status === 'cancelled' ? 'medium' : 'primary'}>{formatLabel(goal.status)}</IonBadge>
                      </div>
                      <p className="student-page__card-note">{skill?.category ?? 'Catalog entry unavailable'} | {formatLabel(goal.priority)} priority</p>
                    </IonCardHeader>
                    <IonCardContent>
                      <p className="student-page__goal-levels">{formatLabel(goal.current_level)} <span aria-hidden="true">to</span> {formatLabel(goal.target_level)}</p>
                      {goal.goal_description && <p>{goal.goal_description}</p>}
                      <div className="student-page__inline-actions">
                        <IonButton size="small" onClick={() => handleEdit(goal)}>Edit</IonButton>
                        <IonButton size="small" fill="clear" color="danger" onClick={() => void handleDelete(goal)} disabled={deletingGoalId === goal.id}>
                          {deletingGoalId === goal.id ? <IonSpinner name="crescent" /> : 'Delete'}
                        </IonButton>
                      </div>
                    </IonCardContent>
                  </IonCard>
                );
              })}
            </section>
          )}
        </main>
      </IonContent>

      <FormModal
        isOpen={goalModalOpen}
        title={editingGoalId ? 'Edit learning goal' : 'Add a learning goal'}
        subtitle="Goals describe the skill you are working towards and the level you are aiming for."
        onDismiss={() => setGoalModalOpen(false)}
        onSubmit={() => void handleGoalSubmit()}
        submitting={saving}
        submitLabel={editingGoalId ? 'Save changes' : 'Add goal'}
      >
        {goalModalError && <p className="app-modal__error" role="alert">{goalModalError}</p>}

        <IonItem className="app-form-field">
          <IonLabel position="stacked">Skill</IonLabel>
          <IonSelect
            fill="outline"
            value={form.skill_id}
            placeholder="Select a catalog skill"
            onIonChange={(event) => setForm((current) => ({ ...current, skill_id: event.detail.value }))}
          >
            {catalog.map((skill) => (
              <IonSelectOption key={skill.id} value={skill.id}>
                {skill.name} ({skill.category})
              </IonSelectOption>
            ))}
          </IonSelect>
        </IonItem>

        <div className="student-page__form-grid">
          <IonItem className="app-form-field">
            <IonLabel position="stacked">Current level</IonLabel>
            <IonSelect
              fill="outline"
              value={form.current_level}
              onIonChange={(event) => setForm((current) => ({ ...current, current_level: event.detail.value }))}
            >
              {proficiencyLevels.map((level) => (
                <IonSelectOption key={level} value={level}>{formatLabel(level)}</IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
          <IonItem className="app-form-field">
            <IonLabel position="stacked">Target level</IonLabel>
            <IonSelect
              fill="outline"
              value={form.target_level}
              onIonChange={(event) => setForm((current) => ({ ...current, target_level: event.detail.value }))}
            >
              {proficiencyLevels.map((level) => (
                <IonSelectOption key={level} value={level}>{formatLabel(level)}</IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
          <IonItem className="app-form-field">
            <IonLabel position="stacked">Priority</IonLabel>
            <IonSelect
              fill="outline"
              value={form.priority}
              onIonChange={(event) => setForm((current) => ({ ...current, priority: event.detail.value }))}
            >
              {priorities.map((priority) => (
                <IonSelectOption key={priority} value={priority}>{formatLabel(priority)}</IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
          <IonItem className="app-form-field">
            <IonLabel position="stacked">Status</IonLabel>
            <IonSelect
              fill="outline"
              value={form.status}
              onIonChange={(event) => setForm((current) => ({ ...current, status: event.detail.value }))}
            >
              {statuses.map((status) => (
                <IonSelectOption key={status} value={status}>{formatLabel(status)}</IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
        </div>

        <IonItem className="app-form-field">
          <IonLabel position="stacked">What do you want to achieve?</IonLabel>
          <IonTextarea
            fill="outline"
            rows={4}
            autoGrow
            value={form.goal_description ?? ''}
            placeholder="Build a small app of my own with this skill."
            onIonInput={(event) => setForm((current) => ({ ...current, goal_description: event.detail.value ?? '' }))}
          />
        </IonItem>
      </FormModal>

      <FormModal
        isOpen={reschedulingSessionId !== null}
        title="Change session time"
        subtitle="The other participant has to agree before the new time is applied."
        onDismiss={() => setReschedulingSessionId(null)}
        onSubmit={() => {
          const session = sessions.find((item) => item.id === reschedulingSessionId);
          if (session) void handleProposeTime(session);
        }}
        submitting={respondingSessionId !== null}
        submitLabel="Send proposal"
        cancelLabel="Keep current time"
      >
        {timeModalError && <p className="app-modal__error" role="alert">{timeModalError}</p>}
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Proposed date and time</IonLabel>
          <IonInput
            fill="outline"
            type="datetime-local"
            min={toLocalDateTimeInput(new Date().toISOString())}
            value={timeDraft}
            onIonInput={(event) => setTimeDraft(event.detail.value ?? '')}
          />
        </IonItem>
      </FormModal>
    </IonPage>
  );
};

export default Learning;
