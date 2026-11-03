import { useCallback, useEffect, useState } from 'react';
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
  IonItem,
  IonLabel,
  IonPage,
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
  endorsePeerSkill,
  getEndorsementOpportunities,
  getFriendlyStudentError,
  getGivenEndorsements,
  getSkillPassport,
  type EndorsementOpportunity,
  type GivenEndorsement,
} from '../services/student';
import './StudentPages.css';

const Endorsements = () => {
  const { user } = useAuth();
  const [opportunities, setOpportunities] = useState<EndorsementOpportunity[]>([]);
  const [received, setReceived] = useState<{ id: string; skill_name: string; comment: string | null; created_at: string; endorsed_by_name: string | null }[]>([]);
  const [given, setGiven] = useState<GivenEndorsement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [target, setTarget] = useState<EndorsementOpportunity | null>(null);
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [loadedOpportunities, passport, mine] = await Promise.all([
        getEndorsementOpportunities(),
        getSkillPassport(),
        getGivenEndorsements(user.id),
      ]);
      setOpportunities(loadedOpportunities);
      setReceived(passport.endorsements);
      setGiven(mine);
    } catch (loadError) {
      setError(getFriendlyStudentError(loadError, 'We could not load your endorsements.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleEndorse = async () => {
    if (!target) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await endorsePeerSkill(target.student_id, target.skill_id, comment.trim());
      setMessage(`You endorsed ${target.student_name} for ${target.skill_name}.`);
      setTarget(null);
      setComment('');
      await load();
    } catch (endorseError) {
      setError(getFriendlyStudentError(endorseError, 'We could not record that endorsement.'));
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (value: string): string =>
    new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));

  return (
    <IonPage className="endorsements-page">
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton fill="clear" routerLink="/tabs/skill-passport" aria-label="Back to Skill Passport">Back</IonButton>
          </IonButtons>
          <IonTitle>Peer Endorsements</IonTitle>
          <IonButtons slot="end"><NotificationsButton /></IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="student-page">
        <main className="student-page__content">
          <section className="student-page__hero">
            <p className="student-page__eyebrow">PEER RECOGNITION</p>
            <h1>Endorsements</h1>
            <p className="student-page__lead">
              You can endorse a skill you have actually studied with someone in a completed
              session. An endorsement is a record of what you observed, not a proficiency score.
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
              <IonSpinner name="crescent" /> <IonText color="medium">Loading endorsements…</IonText>
            </div>
          )}

          {!loading && (
            <>
              <IonCard>
                <IonCardHeader>
                  <IonCardSubtitle>Awaiting your endorsement</IonCardSubtitle>
                  <IonCardTitle>
                    {opportunities.length} opportunit{opportunities.length === 1 ? 'y' : 'ies'}
                  </IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                  {opportunities.length === 0 ? (
                    <IonText color="medium">
                      Nothing to endorse right now. Endorsements become available after you and a
                      peer complete a learning session together for that skill.
                    </IonText>
                  ) : (
                    <div className="endorsements-page__list">
                      {opportunities.map((item) => (
                        <article className="endorsements-page__item" key={`${item.student_id}-${item.skill_id}`}>
                          <div className="student-page__goal-heading">
                            <div>
                              <h2>{item.student_name}</h2>
                              <p>{item.skill_name} · {item.skill_category}</p>
                            </div>
                            <IonBadge color="primary">You studied this together</IonBadge>
                          </div>
                          <IonButton size="small" onClick={() => { setTarget(item); setComment(''); }}>
                            Endorse this skill
                          </IonButton>
                        </article>
                      ))}
                    </div>
                  )}
                </IonCardContent>
              </IonCard>

              <IonCard>
                <IonCardHeader>
                  <IonCardTitle>Endorsements you received</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                  {received.length === 0 ? (
                    <IonText color="medium">No endorsements yet.</IonText>
                  ) : (
                    <ul className="endorsements-page__list">
                      {received.map((item) => (
                        <li key={item.id}>
                          <p>
                            <strong>{item.skill_name}</strong>
                            {item.comment ? ` — ${item.comment}` : ''}
                          </p>
                          <p className="student-page__card-note">
                            From {item.endorsed_by_name ?? 'a SkillForge student'} · {formatDate(item.created_at)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </IonCardContent>
              </IonCard>

              <IonCard>
                <IonCardHeader>
                  <IonCardTitle>Endorsements you gave</IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                  {given.length === 0 ? (
                    <IonText color="medium">You have not endorsed anyone yet.</IonText>
                  ) : (
                    <ul className="endorsements-page__list">
                      {given.map((item) => (
                        <li key={item.id}>
                          <p>
                            <strong>{item.student_name}</strong> — {item.skill_name}
                            {item.comment ? `: ${item.comment}` : ''}
                          </p>
                          <p className="student-page__card-note">{formatDate(item.created_at)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </IonCardContent>
              </IonCard>
            </>
          )}
        </main>
      </IonContent>

      <FormModal
        isOpen={target !== null}
        title={`Endorse ${target?.skill_name ?? ''}`}
        subtitle={target
          ? `You are endorsing ${target.student_name} for ${target.skill_name}. Describe what you observed during your sessions together.`
          : undefined}
        onDismiss={() => setTarget(null)}
        onSubmit={() => void handleEndorse()}
        submitting={saving}
        submitLabel="Give endorsement"
      >
        <IonItem className="app-form-field">
          <IonLabel position="stacked">What did you observe? (optional)</IonLabel>
          <IonTextarea
            fill="outline"
            rows={5}
            autoGrow
            value={comment}
            placeholder="They explained recursion clearly and helped me debug my own function."
            onIonInput={(event) => setComment(event.detail.value ?? '')}
          />
        </IonItem>
      </FormModal>
    </IonPage>
  );
};

export default Endorsements;