import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IonBadge,
  IonButton,
  IonInput,
  IonItem,
  IonLabel,
  IonProgressBar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTextarea,
} from '@ionic/react';
import {
  completeLearningSession,
  completeSessionMission,
  createSessionLearningPlan,
  getActivitiesForMissions,
  getActivityAttempts,
  getSessionMissions,
  reviewActivityAttempt,
  startSessionMission,
  submitActivityAttempt,
  type ActivityAttempt,
  type LearningSession,
  type SessionActivity,
  type SessionMission,
  type SessionPlanActivityInput,
} from '../services/student';
import type { Json } from '../types/supabase';
import FormModal from './FormModal';

const activityTypes: SessionActivity['activity_type'][] = [
  'quiz',
  'problem_solving',
  'practice',
  'final_challenge',
];

const initialActivity = (): SessionPlanActivityInput => ({
  title: '',
  activity_type: 'practice',
  instructions: '',
  max_xp: 10,
});

const emptyReviewDraft = { score: '100', passed: true, feedback: '' };

const getAnswerText = (answer: Json): string => {
  if (answer && typeof answer === 'object' && !Array.isArray(answer)) {
    const response = answer.response;
    return typeof response === 'string' ? response : JSON.stringify(answer);
  }
  return typeof answer === 'string' ? answer : JSON.stringify(answer);
};

const getFailureMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
};

interface SessionLearningPanelProps {
  session: LearningSession;
  userId: string;
  isTeacher: boolean;
  onSessionCompleted?: () => void | Promise<void>;
}

const SessionLearningPanel = ({ session, userId, isTeacher, onSessionCompleted }: SessionLearningPanelProps) => {
  const [missions, setMissions] = useState<SessionMission[]>([]);
  const [activities, setActivities] = useState<SessionActivity[]>([]);
  const [attempts, setAttempts] = useState<ActivityAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [missionTitle, setMissionTitle] = useState('');
  const [missionDescription, setMissionDescription] = useState('');
  const [learningGoal, setLearningGoal] = useState('');
  const [planActivities, setPlanActivities] = useState<SessionPlanActivityInput[]>([initialActivity()]);
  const [answerTarget, setAnswerTarget] = useState<SessionActivity | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [reviewTarget, setReviewTarget] = useState<ActivityAttempt | null>(null);
  const [reviewDraft, setReviewDraft] = useState(emptyReviewDraft);
  const [formError, setFormError] = useState<string | null>(null);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loadedMissions = await getSessionMissions([session.id]);
      setMissions(loadedMissions);

      if (loadedMissions.length === 0) {
        setActivities([]);
        setAttempts([]);
        return;
      }

      const loadedActivities = await getActivitiesForMissions(loadedMissions.map((mission) => mission.id));
      const loadedAttempts = await getActivityAttempts(loadedActivities.map((activity) => activity.id));
      setActivities(loadedActivities);
      setAttempts(loadedAttempts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the session activities.');
    } finally {
      setLoading(false);
    }
  }, [session.id]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const activitiesByMission = useMemo(() => {
    const grouped = new Map<string, SessionActivity[]>();
    activities.forEach((activity) => {
      const existing = grouped.get(activity.mission_id) ?? [];
      existing.push(activity);
      grouped.set(activity.mission_id, existing);
    });
    return grouped;
  }, [activities]);

  const attemptsByActivity = useMemo(() => {
    const grouped = new Map<string, ActivityAttempt[]>();
    attempts.forEach((attempt) => {
      const existing = grouped.get(attempt.activity_id) ?? [];
      existing.push(attempt);
      grouped.set(attempt.activity_id, existing);
    });
    return grouped;
  }, [attempts]);

  const isActivityPassed = useCallback(
    (activityId: string): boolean =>
      (attemptsByActivity.get(activityId) ?? []).some(
        (attempt) => attempt.status === 'reviewed' && attempt.passed,
      ),
    [attemptsByActivity],
  );

  const missionHasAllActivitiesPassed = (missionId: string): boolean => {
    const missionActivities = activitiesByMission.get(missionId) ?? [];
    return missionActivities.length > 0 && missionActivities.every((activity) => isActivityPassed(activity.id));
  };

  const progress = useMemo(() => {
    const totalActivities = activities.length;
    const passedActivities = activities.filter((activity) => isActivityPassed(activity.id)).length;
    const xpEarned = attempts.reduce(
      (total, attempt) => total + (attempt.status === 'reviewed' ? attempt.xp_earned : 0),
      0,
    );
    return {
      completedMissions: missions.filter((mission) => mission.status === 'completed').length,
      totalMissions: missions.length,
      passedActivities,
      totalActivities,
      xpEarned,
      ratio: totalActivities > 0 ? passedActivities / totalActivities : 0,
    };
  }, [missions, activities, attempts, isActivityPassed]);

  const allMissionsCompleted = missions.length > 0 && missions.every((mission) => mission.status === 'completed');

  const handleCreatePlan = async () => {
    if (!missionTitle.trim() || planActivities.some((activity) => !activity.title.trim())) {
      setFormError('Add a mission title and a title for every activity.');
      return;
    }
    setSaving(true);
    setFormError(null);
    setError(null);
    setMessage(null);
    try {
      await createSessionLearningPlan(
        session.id,
        missionTitle.trim(),
        missionDescription.trim(),
        learningGoal.trim(),
        planActivities.map((activity) => ({
          ...activity,
          title: activity.title.trim(),
          instructions: activity.instructions?.trim() || null,
          max_xp: Number(activity.max_xp),
        })),
      );
      setShowPlanForm(false);
      setMissionTitle('');
      setMissionDescription('');
      setLearningGoal('');
      setPlanActivities([initialActivity()]);
      setMessage('Session mission created.');
      await loadPlan();
    } catch (createError) {
      setFormError(createError instanceof Error ? createError.message : 'Could not create the session mission.');
    } finally {
      setSaving(false);
    }
  };

  const openPlanModal = () => {
    setFormError(null);
    setShowPlanForm(true);
  };

  const handleStartMission = async (missionId: string) => {
    setSaving(true);
    setError(null);
    try {
      const started = await startSessionMission(missionId);
      setMissions((current) => current.map((mission) => (mission.id === started.id ? started : mission)));
      setMessage('Mission started.');
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Could not start this mission.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!answerTarget) return;
    const trimmed = answerText.trim();
    if (!trimmed) {
      setFormError('Write an answer before submitting.');
      return;
    }
    setSaving(true);
    setFormError(null);
    setError(null);
    try {
      const activityAttempts = attemptsByActivity.get(answerTarget.id) ?? [];
      const attemptNumber = Math.max(0, ...activityAttempts.map((attempt) => attempt.attempt_number)) + 1;
      const attempt = await submitActivityAttempt(answerTarget.id, userId, attemptNumber, { response: trimmed });
      setAttempts((current) => [...current, attempt]);
      setAnswerTarget(null);
      setAnswerText('');
      setMessage('Work submitted to your teacher for review.');
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : 'Could not submit your work.');
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async () => {
    if (!reviewTarget) return;
    const score = Number(reviewDraft.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      setFormError('Score must be between 0 and 100.');
      return;
    }
    setSaving(true);
    setFormError(null);
    setError(null);
    try {
      const result = await reviewActivityAttempt(reviewTarget.id, score, reviewDraft.passed, reviewDraft.feedback.trim());
      setAttempts((current) => current.map((item) => item.id === reviewTarget.id ? {
        ...item,
        status: 'reviewed',
        score,
        passed: reviewDraft.passed,
        xp_earned: result.xp_awarded,
        teacher_feedback: reviewDraft.feedback.trim() || null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      } : item));
      setReviewTarget(null);
      setMessage(reviewDraft.passed ? `Work passed. ${result.xp_awarded} XP awarded.` : 'Work reviewed. The learner can try again.');
    } catch (reviewError) {
      setFormError(getFailureMessage(reviewError, 'Could not review this submission.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteMission = async (missionId: string) => {
    setSaving(true);
    setError(null);
    try {
      const completed = await completeSessionMission(missionId);
      setMissions((current) => current.map((mission) => (mission.id === completed.id ? completed : mission)));
      setMessage('Mission completed. All activities have passed teacher review.');
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : 'Could not complete this mission.');
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteSession = async () => {
    setSaving(true);
    setError(null);
    try {
      await completeLearningSession(session.id);
      setMessage('Session completed. Your verified progress has been recorded.');
      await onSessionCompleted?.();
    } catch (completeSessionError) {
      setError(getFailureMessage(completeSessionError, 'Could not complete this session.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="ion-padding"><IonSpinner name="crescent" /> <IonText color="medium">Loading mission…</IonText></div>;

  return (
    <section className="session-learning-panel" aria-label="Gamified session activities">
      <h3>Learning missions</h3>
      {error && <p className="session-learning-panel__error" role="alert">{error}</p>}
      {message && <p className="session-learning-panel__message" role="status">{message}</p>}

      {missions.length > 0 && (
        <div className="session-learning-panel__progress">
          <IonProgressBar value={progress.ratio} aria-label="Session progress" />
          <p>
            Missions completed {progress.completedMissions} of {progress.totalMissions}
            {' · '}Activities passed {progress.passedActivities} of {progress.totalActivities}
            {' · '}{progress.xpEarned} XP earned
          </p>
        </div>
      )}

      {isTeacher && missions.length === 0 ? (
        isTeacher ? (
          <div>
            <p>Create a mission and activities for this session. The learner earns XP only after passing teacher review.</p>
            <IonButton onClick={() => openPlanModal()}>Create session mission</IonButton>
          </div>
        ) : <IonText color="medium">The teacher has not added a mission yet.</IonText>
      ) : (
        <div>
          {missions.map((mission, missionIndex) => {
            const missionActivities = activitiesByMission.get(mission.id) ?? [];
            const allActivitiesPassed = missionHasAllActivitiesPassed(mission.id);
            return (
              <div className="session-learning-panel__mission" key={mission.id}>
                <div className="session-learning-panel__mission-heading">
                  <div>
                    <h4>Mission {missionIndex + 1}: {mission.title}</h4>
                    <IonBadge color={mission.status === 'completed' ? 'success' : 'primary'}>{mission.status.replace('_', ' ')}</IonBadge>
                  </div>
                  <span>{mission.total_xp} XP available</span>
                </div>
                {mission.description && <p>{mission.description}</p>}
                {mission.learning_goal && <p><strong>Goal:</strong> {mission.learning_goal}</p>}
                {mission.status === 'not_started' && <IonButton onClick={() => void handleStartMission(mission.id)} disabled={saving}>Start mission</IonButton>}

                <div className="session-learning-panel__activities">
                  {missionActivities.map((activity) => {
                    const activityAttempts = attemptsByActivity.get(activity.id) ?? [];
                    const latestAttempt = activityAttempts[activityAttempts.length - 1];
                    const passed = isActivityPassed(activity.id);
                    const waitingForReview = latestAttempt?.status === 'submitted';
                    return (
                      <article className="session-learning-panel__activity" key={activity.id}>
                        <div className="session-learning-panel__mission-heading">
                          <h5>{activity.sequence_number}. {activity.title}</h5>
                          <IonBadge color={passed ? 'success' : waitingForReview ? 'warning' : 'medium'}>
                            {passed ? 'Completed' : waitingForReview ? 'Awaiting review' : 'Practice'}
                          </IonBadge>
                        </div>
                        <p>{activity.activity_type.replace('_', ' ')} · up to {activity.max_xp} XP</p>
                        {activity.instructions && <p>{activity.instructions}</p>}

                        {activityAttempts.map((attempt) => (
                          <div className="session-learning-panel__attempt" key={attempt.id}>
                            <p><strong>Submission {attempt.attempt_number}:</strong> {getAnswerText(attempt.answer)}</p>
                            {attempt.status === 'reviewed' && (
                              <p>
                                {attempt.passed ? 'Passed' : 'Needs another attempt'} · Score {attempt.score ?? 0}/100 · {attempt.xp_earned} XP
                                {attempt.teacher_feedback ? ` · Feedback: ${attempt.teacher_feedback}` : ''}
                              </p>
                            )}
                            {isTeacher && attempt.status === 'submitted' && (
                              <div className="session-plan-form__review">
                                <IonButton size="small" fill="outline" onClick={() => {
                                  setReviewTarget(attempt);
                                  setReviewDraft(emptyReviewDraft);
                                  setFormError(null);
                                }}>Review submission</IonButton>
                              </div>
                            )}
                          </div>
                        ))}

                        {!isTeacher && mission.status === 'in_progress' && !passed && !waitingForReview && (
                          <div className="session-plan-form__submission">
                            <IonButton size="small" onClick={() => {
                              setAnswerTarget(activity);
                              setAnswerText('');
                              setFormError(null);
                            }}>Submit your work</IonButton>
                          </div>
                        )}
                        {!isTeacher && waitingForReview && <IonText color="medium">Your latest submission is with the teacher for review.</IonText>}
                      </article>
                    );
                  })}
                </div>

                {isTeacher && mission.status === 'in_progress' && allActivitiesPassed && (
                  <IonButton color="success" onClick={() => void handleCompleteMission(mission.id)} disabled={saving}>
                    {saving ? <IonSpinner name="crescent" /> : 'Complete mission'}
                  </IonButton>
                )}
              </div>
            );
          })}

          {isTeacher && !allMissionsCompleted && (
            <IonButton fill="outline" onClick={() => openPlanModal()}>Add another mission</IonButton>
          )}

          {isTeacher && allMissionsCompleted && (
            <IonButton color="success" onClick={() => void handleCompleteSession()} disabled={saving}>
              {saving ? <IonSpinner name="crescent" /> : 'Complete learning session'}
            </IonButton>
          )}
        </div>
      )}

      <FormModal
        isOpen={showPlanForm}
        title="Session mission"
        subtitle="The learner earns XP only after passing teacher review."
        onDismiss={() => setShowPlanForm(false)}
        onSubmit={() => void handleCreatePlan()}
        submitting={saving}
        submitLabel="Create mission"
      >
        {formError && <p className="app-modal__error" role="alert">{formError}</p>}
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Mission title</IonLabel>
          <IonInput
            value={missionTitle}
            placeholder="Understand the concept"
            onIonInput={(event) => setMissionTitle(event.detail.value ?? '')}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Description</IonLabel>
          <IonTextarea
            value={missionDescription}
            autoGrow
            onIonInput={(event) => setMissionDescription(event.detail.value ?? '')}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Learning goal</IonLabel>
          <IonTextarea
            value={learningGoal}
            autoGrow
            placeholder="What the learner should be able to do afterwards."
            onIonInput={(event) => setLearningGoal(event.detail.value ?? '')}
          />
        </IonItem>

        <h4 className="session-plan-form__heading">Activities</h4>
        {planActivities.map((activity, index) => (
          <div className="session-plan-form__activity" key={index}>
            <h5>Activity {index + 1}</h5>
            <IonItem className="app-form-field">
              <IonLabel position="stacked">Title</IonLabel>
              <IonInput
                value={activity.title}
                onIonInput={(event) => setPlanActivities((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.detail.value ?? '' } : item))}
              />
            </IonItem>
            <IonItem className="app-form-field">
              <IonLabel position="stacked">Activity type</IonLabel>
              <IonSelect
                value={activity.activity_type}
                onIonChange={(event) => setPlanActivities((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, activity_type: event.detail.value } : item))}
              >
                {activityTypes.map((type) => (
                  <IonSelectOption key={type} value={type}>{type.replace('_', ' ')}</IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>
            <IonItem className="app-form-field">
              <IonLabel position="stacked">Instructions</IonLabel>
              <IonTextarea
                value={activity.instructions ?? ''}
                autoGrow
                onIonInput={(event) => setPlanActivities((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, instructions: event.detail.value ?? '' } : item))}
              />
            </IonItem>
            <IonItem className="app-form-field">
              <IonLabel position="stacked">Maximum XP</IonLabel>
              <IonInput
                type="number"
                min="0"
                step="1"
                value={activity.max_xp}
                onIonInput={(event) => setPlanActivities((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, max_xp: Number(event.detail.value) } : item))}
              />
            </IonItem>
            {planActivities.length > 1 && (
              <IonButton fill="clear" color="danger" onClick={() => setPlanActivities((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                Remove activity
              </IonButton>
            )}
          </div>
        ))}
        <div className="student-page__inline-actions">
          <IonButton fill="outline" onClick={() => setPlanActivities((current) => [...current, initialActivity()])}>
            Add activity
          </IonButton>
        </div>
      </FormModal>

      <FormModal
        isOpen={answerTarget !== null}
        title="Submit your work"
        subtitle={answerTarget ? answerTarget.title : undefined}
        onDismiss={() => setAnswerTarget(null)}
        onSubmit={() => void handleSubmitAnswer()}
        submitting={saving}
        submitLabel="Submit for review"
      >
        {formError && <p className="app-modal__error" role="alert">{formError}</p>}
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Your answer or work</IonLabel>
          <IonTextarea
            rows={5}
            autoGrow
            value={answerText}
            placeholder="Paste your answer, code, or a short description of what you built."
            onIonInput={(event) => setAnswerText(event.detail.value ?? '')}
          />
        </IonItem>
      </FormModal>

      <FormModal
        isOpen={reviewTarget !== null}
        title="Review submission"
        subtitle={reviewTarget ? `Submission ${reviewTarget.attempt_number}` : undefined}
        onDismiss={() => setReviewTarget(null)}
        onSubmit={() => void handleReview()}
        submitting={saving}
        submitLabel="Submit review"
      >
        {formError && <p className="app-modal__error" role="alert">{formError}</p>}
        {reviewTarget && (
          <p className="student-page__card-note">{getAnswerText(reviewTarget.answer)}</p>
        )}
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Score (0–100)</IonLabel>
          <IonInput
            type="number"
            min="0"
            max="100"
            value={reviewDraft.score}
            onIonInput={(event) => setReviewDraft((current) => ({ ...current, score: event.detail.value ?? '' }))}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Result</IonLabel>
          <IonSelect
            value={reviewDraft.passed ? 'passed' : 'retry'}
            onIonChange={(event) => setReviewDraft((current) => ({
              ...current,
              passed: event.detail.value === 'passed',
            }))}
          >
            <IonSelectOption value="passed">Pass</IonSelectOption>
            <IonSelectOption value="retry">Needs another attempt</IonSelectOption>
          </IonSelect>
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Feedback for learner</IonLabel>
          <IonTextarea
            value={reviewDraft.feedback}
            autoGrow
            placeholder="What worked, and what to improve."
            onIonInput={(event) => setReviewDraft((current) => ({ ...current, feedback: event.detail.value ?? '' }))}
          />
        </IonItem>
      </FormModal>
    </section>
  );
};

export default SessionLearningPanel;