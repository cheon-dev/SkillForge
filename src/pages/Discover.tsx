import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
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
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  useIonViewWillEnter,
useIonRouter,
} from '@ionic/react';
import { refreshOutline } from 'ionicons/icons';
import FormModal from '../components/FormModal';
import NotificationsButton from '../components/NotificationsButton';
import { useAuth } from '../hooks/useAuth';
import {
  getDiscoverableStudents,
  getFriendlyStudentError,
  getMyCredits,
  getSkillMatches,
  requestLearningSession,
  startDirectConversation,
  type CreditSummary,
  type DiscoverableStudent,
  type SkillMatch,
} from '../services/student';
import { calculateCreditCost } from '../utils/credits';
import '../components/AuthLoading.css';
import './Discover.css';

const formatLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const toLocalDateTimeInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const getInitials = (name: string | null) => {
  const initials = (name ?? 'Student')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return initials || 'S';
};

const Discover = () => {
  const { user, loading: authLoading } = useAuth();
  const router = useIonRouter();
  const [students, setStudents] = useState<DiscoverableStudent[]>([]);
  const [matches, setMatches] = useState<SkillMatch[]>([]);
  const [openingChatFor, setOpeningChatFor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [requestTarget, setRequestTarget] = useState<{
    teacherId: string;
    teacherName: string;
    skillId: string;
    skillName: string;
  } | null>(null);
  const [scheduledAt, setScheduledAt] = useState(() => toLocalDateTimeInput(new Date(Date.now() + 86_400_000)));
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [learningObjectives, setLearningObjectives] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [credits, setCredits] = useState<CreditSummary | null>(null);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const refreshCredits = useCallback(async () => {
    if (!user) {
      setCredits(null);
      setCreditsError(null);
      return;
    }

    try {
      setCredits(await getMyCredits());
      setCreditsError(null);
    } catch (creditLoadError) {
      setCreditsError(getFriendlyStudentError(creditLoadError, 'We could not load your Skill Credits balance.'));
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let isMounted = true;

    const loadStudents = async () => {
      setLoading(true);
      setError(null);

      try {
        const discoverableStudents = await getDiscoverableStudents(user.id);
        // Matching is a ranked view layered on top of the directory. A failure
        // here must not hide the browsable list below it.
        let rankedMatches: SkillMatch[] = [];
        try {
          rankedMatches = await getSkillMatches();
        } catch {
          rankedMatches = [];
        }
        if (isMounted) {
          setStudents(discoverableStudents);
          setMatches(rankedMatches);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(getFriendlyStudentError(loadError, 'We could not load discoverable students.'));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadStudents();

    return () => {
      isMounted = false;
    };
  }, [reloadKey, user]);

  useIonViewWillEnter(() => {
    void refreshCredits();
  }, [refreshCredits, reloadKey]);

  const categories = useMemo(() => {
    const values = students.flatMap((student) => student.skills.map(({ skill }) => skill.category));
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
  }, [students]);

  const filteredStudents = useMemo(() => {
    return students.flatMap((student) => {
      const profileSearchText = [
        student.profile.full_name,
        student.profile.course,
        student.profile.bio,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const profileMatches = deferredSearch.length === 0 || profileSearchText.includes(deferredSearch);
      const matchingSkills = student.skills.filter(({ skill }) => {
        const categoryMatches = category === 'all' || skill.category === category;
        const skillMatches = `${skill.name} ${skill.category} ${skill.description ?? ''}`
          .toLowerCase()
          .includes(deferredSearch);
        return categoryMatches && (deferredSearch.length === 0 || skillMatches);
      });

      if (category !== 'all' && matchingSkills.length === 0) {
        return [];
      }

      if (deferredSearch.length > 0 && !profileMatches && matchingSkills.length === 0) {
        return [];
      }

      return [{
        ...student,
        skills: profileMatches && deferredSearch.length > 0
          ? student.skills.filter(({ skill }) => category === 'all' || skill.category === category)
          : matchingSkills,
      }];
    });
  }, [category, deferredSearch, students]);

  const handleOpenChat = async (peerId: string, peerName: string) => {
    setOpeningChatFor(peerId);
    setError(null);
    try {
      const conversationId = await startDirectConversation(peerId);
      await router.push(`/tabs/messages?open=${conversationId}`);
    } catch (chatError) {
      setError(getFriendlyStudentError(chatError, `We could not open a chat with ${peerName}.`));
    } finally {
      setOpeningChatFor(null);
    }
  };

  const submitSessionRequest = async () => {
    if (!user || !requestTarget) return;
    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
      setRequestError('Choose a future date and time for the session.');
      return;
    }

    setSubmittingRequest(true);
    setRequestError(null);
    setError(null);
    setRequestMessage(null);
    try {
      await requestLearningSession({
        teacher_id: requestTarget.teacherId,
        skill_id: requestTarget.skillId,
        scheduled_at: scheduledDate.toISOString(),
        duration_minutes: Number(durationMinutes),
        learning_objectives: learningObjectives.trim() || null,
      });
      setRequestMessage(`Request sent to ${requestTarget.teacherName} for ${requestTarget.skillName}.`);
      setRequestTarget(null);
      setLearningObjectives('');
      await refreshCredits();
    } catch (requestError) {
      setRequestError(getFriendlyStudentError(requestError, 'We could not send that session request.'));
    } finally {
      setSubmittingRequest(false);
    }
  };

  if (authLoading || loading || !user) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Discover</IonTitle>
            <IonButtons slot="end"><NotificationsButton /></IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="discover-page">
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
          <IonTitle>Discover</IonTitle>
          <IonButtons slot="end"><NotificationsButton /></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="discover-page">
        <main className="discover-page__content">
          <section className="discover-page__hero">
            <p className="discover-page__eyebrow">PEER-POWERED GROWTH</p>
            <h1>Find someone who can teach it.</h1>
            <p>Explore students who are open to sharing what they know, then request a time to learn together.</p>
            <p className="discover-page__credits" aria-live="polite">
              Skill Credits: <strong>{credits ? credits.balance : 'Loading...'}</strong>
              {' · '}Requests cost 10 credits per hour, rounded down; teachers earn credits when sessions are completed.
            </p>
          </section>

          {creditsError && (
            <div className="discover-page__alert" role="alert">
              <IonText color="danger">{creditsError}</IonText>
              <IonButton fill="clear" onClick={() => setReloadKey((current) => current + 1)}>
                <IonIcon slot="start" icon={refreshOutline} />
                Retry balance
              </IonButton>
            </div>
          )}

          {!loading && matches.length > 0 && (
            <section className="discover-page__matches" aria-label="Recommended peers">
              <h2 className="discover-page__matches-heading">Recommended for you</h2>
              <p className="discover-page__matches-note">
                Ranked by shared and related skills, your learning goals, proficiency fit, and
                how much your weekly availability overlaps. Your exact times are never shown.
              </p>
              {matches.slice(0, 5).map((match) => (
                <IonCard key={match.student_id} className="discover-page__match-card">
                  <IonCardContent>
                    <div className="student-page__goal-heading">
                      <div className="discover-page__identity">
                        <div className="discover-page__avatar" aria-hidden="true">
                          {getInitials(match.full_name)}
                        </div>
                        <div>
                          <h3>{match.full_name}</h3>
                          <p>
                            {match.course ?? 'Course not set'}
                            {match.year_level ? ` · Year ${match.year_level}` : ''}
                          </p>
                        </div>
                      </div>
                      <IonBadge color="primary">Match score {match.score}</IonBadge>
                    </div>

                    {match.bio && <p>{match.bio}</p>}

                    <ul className="discover-page__reasons">
                      {match.matched_skills.slice(0, 4).map((skill) => (
                        <li key={`${match.student_id}-${skill.skill_id}-${skill.relation}`}>
                          <IonBadge color={skill.interest === 'goal' ? 'success' : 'tertiary'}>
                            {skill.interest === 'goal' ? 'Your goal' : 'You hold this'}
                          </IonBadge>
                          <span>
                            Teaches <strong>{skill.name}</strong> ({formatLabel(skill.their_level)})
                            {skill.relation !== 'direct' && ` · ${skill.relation}`}
                            {skill.my_level && skill.their_level !== skill.my_level
                              && ` · you are ${formatLabel(skill.my_level)}`}
                          </span>
                        </li>
                      ))}
                      {match.availability_overlap_minutes > 0 && (
                        <li>
                          <IonBadge color="warning">Availability</IonBadge>
                          <span>
                            {Math.round((match.availability_overlap_minutes / 60) * 10) / 10} hours overlap in your week
                          </span>
                        </li>
                      )}
                      {match.sessions_taught > 0 && (
                        <li>
                          <IonBadge color="medium">Experience</IonBadge>
                          <span>
                            {match.sessions_taught} session{match.sessions_taught === 1 ? '' : 's'} taught,
                            {' '}{match.verified_activities} verified activit{match.verified_activities === 1 ? 'y' : 'ies'}
                          </span>
                        </li>
                      )}
                      {match.previous_sessions > 0 && (
                        <li>
                          <IonBadge color="medium">History</IonBadge>
                          <span>
                            You have had {match.previous_sessions} session{match.previous_sessions === 1 ? '' : 's'} together
                          </span>
                        </li>
                      )}
                    </ul>

                    {match.matched_skills.length > 0 && (
                      <IonButton
                        size="small"
                        onClick={() => setRequestTarget({
                          teacherId: match.student_id,
                          teacherName: match.full_name,
                          skillId: match.matched_skills[0].skill_id,
                          skillName: match.matched_skills[0].name,
                        })}
                      >
                        Request {match.matched_skills[0].name}
                      </IonButton>
                    )}
                  </IonCardContent>
                </IonCard>
              ))}
            </section>
          )}

          {!loading && matches.length === 0 && students.length > 0 && (
            <section className="discover-page__matches" aria-label="Recommendations">
              <IonCard className="discover-page__match-empty">
                <IonCardContent>
                  <strong>No recommendations yet</strong>
                  <p>
                    Matching needs two things: skills you hold or an active learning goal, and
                    peers who marked a matching skill as teachable. Add a skill or goal and you
                    will start seeing ranked peers here.
                  </p>
                </IonCardContent>
              </IonCard>
            </section>
          )}

          <IonCard className="discover-page__filters">
            <IonCardContent>
              <div className="discover-page__filter-controls">
                <IonSearchbar
                  value={search}
                  placeholder="Search names, courses, or skills"
                  onIonInput={(event) => setSearch(event.detail.value ?? '')}
                />
                <IonItem lines="none" className="app-form-field">
                  <IonLabel position="stacked">Filter by category</IonLabel>
                  <IonSelect value={category} onIonChange={(event) => setCategory(event.detail.value)}>
                    <IonSelectOption value="all">All categories</IonSelectOption>
                    {categories.map((value) => <IonSelectOption key={value} value={value}>{value}</IonSelectOption>)}
                  </IonSelect>
                </IonItem>
              </div>
            </IonCardContent>
          </IonCard>

          {error && (
            <div className="discover-page__alert" role="alert">
              <IonText color="danger">{error}</IonText>
              <IonButton fill="clear" onClick={() => setReloadKey((current) => current + 1)}>
                <IonIcon slot="start" icon={refreshOutline} />
                Try again
              </IonButton>
            </div>
          )}

          {requestMessage && (
            <div className="discover-page__alert" role="status">
              <IonText color="success">{requestMessage}</IonText>
              <IonButton fill="clear" routerLink="/tabs/learning">View sessions</IonButton>
            </div>
          )}

          {!error && students.length === 0 && (
            <div className="discover-page__empty">
              <h2>No teachable skills yet</h2>
              <p>When students mark a skill as teachable, they will appear here.</p>
              <IonButton routerLink="/tabs/profile">Add your skills</IonButton>
            </div>
          )}

          {!error && students.length > 0 && filteredStudents.length === 0 && (
            <div className="discover-page__empty">
              <h2>No students match those filters</h2>
              <p>Try a broader search or clear the category filter.</p>
              <IonButton fill="outline" onClick={() => { setSearch(''); setCategory('all'); }}>Clear filters</IonButton>
            </div>
          )}

          <section className="discover-page__results" aria-label="Students with teachable skills">
            {filteredStudents.map((student) => (
              <IonCard key={student.profile.id} className="discover-page__student-card">
                <IonCardHeader>
                  <div className="discover-page__student-heading">
                    <div className="discover-page__student-identity">
                      <div className="discover-page__avatar" aria-hidden="true">
                        {getInitials(student.profile.full_name)}
                      </div>
                      <div>
                        <IonCardTitle>{student.profile.full_name || 'SkillForge student'}</IonCardTitle>
                        {student.profile.course && <p>{student.profile.course}</p>}
                      </div>
                    </div>
                    <IonBadge color="success">Teaches</IonBadge>
                  </div>
                </IonCardHeader>
                <IonCardContent>
                  {student.profile.bio && <p className="discover-page__bio">{student.profile.bio}</p>}
                  <IonButton
                    size="small"
                    fill="outline"
                    disabled={openingChatFor === student.profile.id}
                    onClick={() => void handleOpenChat(student.profile.id, student.profile.full_name || 'this peer')}
                  >
                    {openingChatFor === student.profile.id ? <IonSpinner name="crescent" /> : 'Message'}
                  </IonButton>
                  <div className="discover-page__skill-list">
                    {student.skills.map(({ association, skill }) => (
                      <div className="discover-page__skill" key={association.id}>
                        <div>
                          <strong>{skill.name}</strong>
                          <span>{skill.category}</span>
                        </div>
                        <div className="discover-page__skill-meta">
                          <IonBadge color="light">{formatLabel(association.proficiency_level)}</IonBadge>
                          <span>{association.years_experience} years</span>
                        </div>
                        <IonButton
                          size="small"
                          onClick={() => {
                            setScheduledAt(toLocalDateTimeInput(new Date(Date.now() + 86_400_000)));
                            setRequestTarget({
                              teacherId: student.profile.id,
                              teacherName: student.profile.full_name || 'SkillForge student',
                              skillId: skill.id,
                              skillName: skill.name,
                            });
                          }}
                        >Request session</IonButton>
                      </div>
                    ))}
                  </div>
                </IonCardContent>
              </IonCard>
            ))}
          </section>

          <IonText color="medium">
            <p className="discover-page__note">Session requests are sent to the peer who teaches that skill. They become accepted only after the teacher responds.</p>
          </IonText>
        </main>
      </IonContent>

      <FormModal
        isOpen={requestTarget !== null}
        title="Request a session"
        subtitle={requestTarget ? `${requestTarget.skillName} with ${requestTarget.teacherName}` : undefined}
        onDismiss={() => setRequestTarget(null)}
        onSubmit={() => void submitSessionRequest()}
        submitting={submittingRequest}
        submitLabel="Send request"
      >
        {requestError && <p className="app-modal__error" role="alert">{requestError}</p>}
        <p className="discover-page__credits" aria-live="polite">
          This request costs <strong>{calculateCreditCost(Number(durationMinutes))} Skill Credits</strong>.
          {' '}Your balance: <strong>{credits ? credits.balance : 'Loading...'}</strong>.
        </p>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Preferred date and time</IonLabel>
          <IonInput
            fill="outline"
            type="datetime-local"
            min={toLocalDateTimeInput(new Date())}
            value={scheduledAt}
            onIonInput={(event) => setScheduledAt(event.detail.value ?? '')}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Duration</IonLabel>
          <IonSelect
            fill="outline"
            value={durationMinutes}
            onIonChange={(event) => setDurationMinutes(String(event.detail.value))}
          >
            {[30, 45, 60, 90, 120].map((minutes) => (
              <IonSelectOption key={minutes} value={String(minutes)}>{minutes} minutes</IonSelectOption>
            ))}
          </IonSelect>
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">What would you like to learn?</IonLabel>
          <IonInput
            fill="outline"
            value={learningObjectives}
            placeholder="Build a small project that uses it."
            onIonInput={(event) => setLearningObjectives(event.detail.value ?? '')}
          />
        </IonItem>
      </FormModal>
    </IonPage>
  );
};

export default Discover;
