import { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
} from '@ionic/react';
import FormModal from '../components/FormModal';
import NotificationsButton from '../components/NotificationsButton';
import { useAuth } from '../hooks/useAuth';
import {
  getFriendlyStudentError,
  getMyChallengeSubmissions,
  getReviewableSubmissions,
  getSkillCatalog,
  getSkillChallenges,
  reviewChallengeSubmission,
  submitChallengeSubmission,
  type ChallengeSubmission,
  type ReviewableSubmission,
  type Skill,
  type SkillChallengeWithSkill,
} from '../services/student';
import './StudentPages.css';

const difficultyColors: Record<string, string> = {
  beginner: 'success',
  intermediate: 'primary',
  advanced: 'tertiary',
  expert: 'warning',
};

const submissionStatusLabels: Record<ChallengeSubmission['status'], string> = {
  draft: 'Draft',
  submitted: 'Awaiting review',
  under_review: 'Under review',
  passed: 'Passed',
  needs_revision: 'Needs revision',
};

const statusColors: Record<ChallengeSubmission['status'], string> = {
  draft: 'medium',
  submitted: 'warning',
  under_review: 'warning',
  passed: 'success',
  needs_revision: 'danger',
};

const statusIcons: Record<ChallengeSubmission['status'], string> = {
  draft: '📝',
  submitted: '⏳',
  under_review: '⏳',
  passed: '✅',
  needs_revision: '🔁',
};

const formatDate = (value: string | null): string =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : '';

const Challenges = () => {
  const { user } = useAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [challenges, setChallenges] = useState<SkillChallengeWithSkill[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState('all');
  const [submissions, setSubmissions] = useState<ChallengeSubmission[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewableSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [openChallenge, setOpenChallenge] = useState<SkillChallengeWithSkill | null>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [submissionUrl, setSubmissionUrl] = useState('');
  const [submissionAttachment, setSubmissionAttachment] = useState('');
  const [reviewTarget, setReviewTarget] = useState<ReviewableSubmission | null>(null);
  const [reviewDraft, setReviewDraft] = useState({ passed: true, feedback: '' });
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [loadedChallenges, loadedSkills, loadedSubmissions, loadedQueue] = await Promise.all([
        getSkillChallenges(),
        getSkillCatalog(),
        getMyChallengeSubmissions(user.id),
        getReviewableSubmissions(),
      ]);
      setChallenges(loadedChallenges);
      setSkills(loadedSkills);
      setSubmissions(loadedSubmissions);
      setReviewQueue(loadedQueue);
    } catch (loadError) {
      setError(getFriendlyStudentError(loadError, 'We could not load the Skill Challenges.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  const filteredChallenges = useMemo(
    () => selectedSkillId === 'all'
      ? challenges
      : challenges.filter((challenge) => challenge.skill_id === selectedSkillId),
    [challenges, selectedSkillId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const mySubmissionsByChallenge = useMemo(() => {
    const grouped = new Map<string, ChallengeSubmission>();
    submissions.forEach((submission) => {
      const existing = grouped.get(submission.challenge_id);
      if (!existing || (submission.submitted_at ?? '') > (existing.submitted_at ?? '')) {
        grouped.set(submission.challenge_id, submission);
      }
    });
    return grouped;
  }, [submissions]);

  const handleOpenSubmit = (challenge: SkillChallengeWithSkill) => {
    setOpenChallenge(challenge);
    setSubmissionText('');
    setSubmissionUrl('');
    setSubmissionAttachment('');
    setSubmitError(null);
    setError(null);
    setMessage(null);
  };

  const handleSubmit = async () => {
    if (!openChallenge) return;
    if (!submissionText.trim() && !submissionUrl.trim() && !submissionAttachment.trim()) {
      setSubmitError('Add your work, a link, or an attachment before submitting.');
      return;
    }
    setSaving(true);
    setSubmitError(null);
    setError(null);
    setMessage(null);
    try {
      await submitChallengeSubmission(
        openChallenge.id,
        submissionText.trim(),
        submissionUrl.trim(),
        submissionAttachment.trim(),
      );
      setMessage(`Work submitted for "${openChallenge.title}".`);
      setOpenChallenge(null);
      await load();
    } catch (submitError) {
      setSubmitError(getFriendlyStudentError(submitError, 'We could not submit your work.'));
    } finally {
      setSaving(false);
    }
  };

  const openReview = (submission: ReviewableSubmission) => {
    setReviewTarget(submission);
    setReviewDraft({ passed: true, feedback: '' });
    setReviewError(null);
    setError(null);
    setMessage(null);
  };

  const handleReview = async () => {
    if (!reviewTarget) return;
    setSaving(true);
    setReviewError(null);
    setError(null);
    setMessage(null);
    try {
      const result = await reviewChallengeSubmission(
        reviewTarget.submission_id,
        reviewDraft.passed,
        reviewDraft.feedback.trim(),
      );
      setMessage(
        result.xp_awarded > 0
          ? `"${reviewTarget.challenge_title}" passed. ${result.xp_awarded} XP awarded.`
          : reviewDraft.passed
            ? `"${reviewTarget.challenge_title}" passed. No further XP was awarded for this challenge.`
            : `"${reviewTarget.challenge_title}" marked as needing revision.`,
      );
      setReviewTarget(null);
      await load();
    } catch (reviewError) {
      setReviewError(getFriendlyStudentError(reviewError, 'We could not record that review.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <IonPage className="challenges-page">
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton fill="clear" routerLink="/tabs/learning" aria-label="Back to Learning">Back</IonButton>
          </IonButtons>
          <IonTitle>Skill Challenges</IonTitle>
          <IonButtons slot="end"><NotificationsButton /></IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="student-page">
        <main className="student-page__content">
          <section className="student-page__hero">
            <p className="student-page__eyebrow">LEARN → PRACTICE → SUBMIT → REVIEW → PROVE</p>
            <h1>Skill Challenges</h1>
            <p className="student-page__lead">
              A challenge measures practical ability, not whether you attended a session. Submit
              your work, and the challenge author or a moderator reviews it.
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

          {loading && (
            <div className="student-page__empty">
              <IonSpinner name="crescent" /> <IonText color="medium">Loading challenges…</IonText>
            </div>
          )}

          {!loading && !error && reviewQueue.length > 0 && (
            <IonCard className="challenges-page__queue">
              <IonCardHeader>
                <IonCardSubtitle>Awaiting your review</IonCardSubtitle>
                <IonCardTitle>{reviewQueue.length} submission{reviewQueue.length === 1 ? '' : 's'}</IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                <p className="student-page__card-note">
                  You can review submissions for challenges you authored, or for any challenge if
                  you are a moderator.
                </p>
                {reviewQueue.map((item) => (
                  <article className="challenges-page__queue-item" key={item.submission_id}>
                    <div className="student-page__goal-heading">
                      <div>
                        <h2>{item.challenge_title}</h2>
                        <p>{item.skill_name} · {item.skill_category} · up to {item.xp_reward} XP</p>
                      </div>
                      <IonBadge color="warning">Awaiting review</IonBadge>
                    </div>
                    <p>
                      <strong>{item.student_name}</strong>
                      {item.submitted_at ? ` · submitted ${formatDate(item.submitted_at)}` : ''}
                    </p>
                    {item.submission_text && <p className="challenges-page__work">{item.submission_text}</p>}
                    {item.submission_url && (
                      <p><a href={item.submission_url} target="_blank" rel="noreferrer">Project link</a></p>
                    )}
                    {item.attachment_url && (
                      <p><a href={item.attachment_url} target="_blank" rel="noreferrer">Attachment</a></p>
                    )}

                    <div className="challenges-page__review">
                      <IonButton size="small" fill="outline" onClick={() => openReview(item)}>
                        Review submission
                      </IonButton>
                    </div>
                  </article>
                ))}
              </IonCardContent>
            </IonCard>
          )}

          {!loading && !error && challenges.length === 0 && (
            <div className="student-page__empty">
              <IonText color="medium">No challenges have been published yet.</IonText>
            </div>
          )}

          {!loading && !error && challenges.length > 0 && (
            <IonItem className="app-form-field">
              <IonLabel position="stacked">Filter challenges by skill</IonLabel>
              <IonSelect
                value={selectedSkillId}
                onIonChange={(event) => setSelectedSkillId(event.detail.value ?? 'all')}
                aria-label="Filter challenges by skill"
              >
                <IonSelectOption value="all">All skills</IonSelectOption>
                {skills.map((skill) => (
                  <IonSelectOption key={skill.id} value={skill.id}>{skill.name}</IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>
          )}

          {!loading && !error && challenges.length > 0 && filteredChallenges.length === 0 && (
            <div className="student-page__empty">
              <IonText color="medium">No challenges are available for this skill yet.</IonText>
            </div>
          )}

          {!loading && !error && filteredChallenges.map((challenge) => {
            const mine = mySubmissionsByChallenge.get(challenge.id);
            const pendingReview = mine?.status === 'submitted';
            const canReview = pendingReview && mine?.student_id !== user?.id;
            return (
              <IonCard key={challenge.id}>
                <IonCardHeader>
                  <IonCardSubtitle>
                    {challenge.skill_name} · {challenge.skill_category}
                  </IonCardSubtitle>
                  <IonCardTitle>{challenge.title}</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                  <div className="challenges-page__meta">
                    <IonBadge color={difficultyColors[challenge.difficulty]}>{challenge.difficulty}</IonBadge>
                    <IonBadge color="primary">up to {challenge.xp_reward} XP</IonBadge>
                    {mine && (
                      <IonBadge color={statusColors[mine.status]}>
                        {statusIcons[mine.status]} {submissionStatusLabels[mine.status]}
                      </IonBadge>
                    )}
                  </div>

                  {challenge.description && <p>{challenge.description}</p>}
                  {challenge.instructions && <p><strong>Task:</strong> {challenge.instructions}</p>}

                  {mine && (
                    <div className="challenges-page__my-submission">
                      <p>
                        <strong>Your result:</strong> {submissionStatusLabels[mine.status]}
                        {mine.reviewed_at ? ` · reviewed ${formatDate(mine.reviewed_at)}` : ''}
                      </p>
                      {mine.reviewer_feedback && (
                        <p><strong>Feedback:</strong> {mine.reviewer_feedback}</p>
                      )}
                    </div>
                  )}

                  {!mine && (
                    <IonButton onClick={() => handleOpenSubmit(challenge)}>Start this challenge</IonButton>
                  )}

                  {mine?.status === 'needs_revision' && (
                    <IonButton fill="outline" onClick={() => handleOpenSubmit(challenge)}>
                      Try again
                    </IonButton>
                  )}

                  {canReview && (
                    <p className="student-page__card-note">
                      This one is waiting for a reviewer — see the review queue above.
                    </p>
                  )}
                </IonCardContent>
              </IonCard>
            );
          })}
        </main>

      </IonContent>

      <FormModal
        isOpen={openChallenge !== null}
        title={openChallenge?.title ?? 'Submit your work'}
        subtitle={openChallenge?.instructions ? `Task: ${openChallenge.instructions}` : undefined}
        onDismiss={() => setOpenChallenge(null)}
        onSubmit={() => void handleSubmit()}
        submitting={saving}
        submitLabel="Submit for review"
      >
        {submitError && <p className="app-modal__error" role="alert">{submitError}</p>}
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Your work</IonLabel>
          <IonTextarea
            rows={8}
            autoGrow
            value={submissionText}
            placeholder="Paste your answer, code, or a description of what you built."
            onIonInput={(event) => setSubmissionText(event.detail.value ?? '')}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Link to your project (optional)</IonLabel>
          <IonInput
            value={submissionUrl}
            placeholder="https://"
            onIonInput={(event) => setSubmissionUrl(event.detail.value ?? '')}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Attachment link (optional)</IonLabel>
          <IonInput
            value={submissionAttachment}
            placeholder="https://"
            onIonInput={(event) => setSubmissionAttachment(event.detail.value ?? '')}
          />
        </IonItem>
      </FormModal>

      <FormModal
        isOpen={reviewTarget !== null}
        title="Review submission"
        subtitle={reviewTarget ? `${reviewTarget.challenge_title} · ${reviewTarget.skill_name}` : undefined}
        onDismiss={() => setReviewTarget(null)}
        onSubmit={() => void handleReview()}
        submitting={saving}
        submitLabel="Submit review"
      >
        {reviewError && <p className="app-modal__error" role="alert">{reviewError}</p>}

        {reviewTarget && (
          <ul className="student-page__info-list">
            <li>
              <span>Student</span>
              <strong>{reviewTarget.student_name}</strong>
            </li>
            <li>
              <span>Submitted</span>
              {reviewTarget.submitted_at
                ? <strong>{formatDate(reviewTarget.submitted_at)}</strong>
                : <em>Unknown</em>}
            </li>
            <li>
              <span>XP on offer</span>
              <strong>{reviewTarget.xp_reward} XP</strong>
            </li>
            {reviewTarget.submission_text && (
              <li>
                <span>Work</span>
                <strong>{reviewTarget.submission_text}</strong>
              </li>
            )}
            {reviewTarget.submission_url && (
              <li>
                <span>Project link</span>
                <a href={reviewTarget.submission_url} target="_blank" rel="noreferrer">
                  Open link
                </a>
              </li>
            )}
            {reviewTarget.attachment_url && (
              <li>
                <span>Attachment</span>
                <a href={reviewTarget.attachment_url} target="_blank" rel="noreferrer">
                  Open attachment
                </a>
              </li>
            )}
          </ul>
        )}

        <IonItem className="app-form-field">
          <IonLabel position="stacked">Result</IonLabel>
          <IonSelect
            value={reviewDraft.passed ? 'passed' : 'revision'}
            onIonChange={(event) => setReviewDraft((current) => ({
              ...current,
              passed: event.detail.value === 'passed',
            }))}
          >
            <IonSelectOption value="passed">Pass</IonSelectOption>
            <IonSelectOption value="revision">Needs revision</IonSelectOption>
          </IonSelect>
        </IonItem>

        <IonItem className="app-form-field">
          <IonLabel position="stacked">Feedback</IonLabel>
          <IonTextarea
            autoGrow
            value={reviewDraft.feedback}
            placeholder="What worked, and what to improve."
            onIonInput={(event) => setReviewDraft((current) => ({
              ...current,
              feedback: event.detail.value ?? '',
            }))}
          />
        </IonItem>
      </FormModal>
    </IonPage>
  );
};

export default Challenges;