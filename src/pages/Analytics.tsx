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
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import NotificationsButton from '../components/NotificationsButton';
import { useAuth } from '../hooks/useAuth';
import {
  getFriendlyStudentError,
  getMyChallengeSubmissions,
  getMyProjects,
  getSessionMissions,
  getSkillPassport,
  getStudentLearningSessions,
  type ChallengeSubmission,
  type LearningSession,
  type ProjectSummary,
  type SessionMission,
  type SkillPassport,
} from '../services/student';
import '../components/AuthLoading.css';
import './Analytics.css';

interface MonthActivity {
  key: string;
  label: string;
  sessions: number;
  challenges: number;
  missions: number;
}

const buildActivityByMonth = (
  sessions: LearningSession[],
  submissions: ChallengeSubmission[],
  missions: SessionMission[],
): MonthActivity[] => {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    date.setMonth(date.getMonth() - (5 - index));
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date),
      sessions: 0,
      challenges: 0,
      missions: 0,
    };
  });
  const byKey = new Map(months.map((month) => [month.key, month]));

  sessions
    .filter((session) => session.status === 'completed')
    .forEach((session) => {
      const date = new Date(session.updated_at);
      const month = byKey.get(`${date.getFullYear()}-${date.getMonth()}`);
      if (month) month.sessions += 1;
    });

  submissions
    .filter((submission) => submission.status === 'passed' && submission.reviewed_at)
    .forEach((submission) => {
      const date = new Date(submission.reviewed_at!);
      const month = byKey.get(`${date.getFullYear()}-${date.getMonth()}`);
      if (month) month.challenges += 1;
    });

  missions
    .filter((mission) => mission.status === 'completed' && mission.completed_at)
    .forEach((mission) => {
      const date = new Date(mission.completed_at!);
      const month = byKey.get(`${date.getFullYear()}-${date.getMonth()}`);
      if (month) month.missions += 1;
    });

  return months;
};

const Analytics = () => {
  const { user } = useAuth();
  const [passport, setPassport] = useState<SkillPassport | null>(null);
  const [sessions, setSessions] = useState<LearningSession[]>([]);
  const [submissions, setSubmissions] = useState<ChallengeSubmission[]>([]);
  const [missions, setMissions] = useState<SessionMission[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [loadedPassport, loadedSessions, loadedSubmissions, loadedProjects] = await Promise.all([
          getSkillPassport(),
          getStudentLearningSessions(user.id),
          getMyChallengeSubmissions(user.id),
          getMyProjects(),
        ]);
        const loadedMissions = await getSessionMissions(loadedSessions.map((session) => session.id));
        if (!active) return;
        setPassport(loadedPassport);
        setSessions(loadedSessions);
        setSubmissions(loadedSubmissions);
        setMissions(loadedMissions);
        setProjects(loadedProjects);
      } catch (loadError) {
        if (active) {
          setError(getFriendlyStudentError(loadError, 'We could not load your learning analytics.'));
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [user]);

  const activity = useMemo(
    () => buildActivityByMonth(sessions, submissions, missions),
    [sessions, submissions, missions],
  );
  const maximum = Math.max(1, ...activity.map((month) => month.sessions + month.challenges + month.missions));
  const maximumSkillActivity = Math.max(
    1,
    ...((passport?.skills ?? []).map((skill) =>
      skill.completed_sessions + skill.verified_activities + skill.challenges_passed)),
  );
  const metrics = [
    { label: 'Skills tracked', value: passport?.totals.skills ?? 0 },
    { label: 'Sessions completed', value: passport?.totals.completed_sessions ?? 0 },
    { label: 'Sessions taught', value: passport?.totals.sessions_taught ?? 0 },
    { label: 'Verified activities', value: passport?.totals.verified_activities ?? 0 },
    { label: 'Missions completed', value: missions.filter((mission) => mission.status === 'completed').length },
    { label: 'Challenges passed', value: passport?.totals.challenges_passed ?? 0 },
    { label: 'Achievements', value: passport?.achievements.filter((achievement) => achievement.earned).length ?? 0 },
    { label: 'Peer endorsements', value: passport?.totals.endorsements_received ?? 0 },
    { label: 'Projects', value: projects.length },
    { label: 'XP earned', value: passport?.xp.total_xp ?? 0 },
  ];

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButton slot="start" fill="clear" routerLink="/tabs/skill-passport">Back</IonButton>
          <IonTitle>Learning analytics</IonTitle>
          <IonButtons slot="end"><NotificationsButton /></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="student-page analytics-page">
        <main className="student-page__content">
          <section className="student-page__hero">
            <p className="student-page__eyebrow">YOUR LEARNING, OVER TIME</p>
            <h1>Learning analytics</h1>
            <p className="student-page__lead">
              A summary of verified learning progress, challenges, recognition, and collaboration.
            </p>
          </section>

          {loading && <div className="student-page__empty"><IonSpinner name="crescent" /> Loading analytics…</div>}
          {error && <div className="student-page__alert student-page__alert--error" role="alert"><IonText color="danger">{error}</IonText></div>}

          {!loading && !error && passport && (
            <>
              <ul className="analytics-page__metrics">
                {metrics.map((metric) => (
                  <li key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></li>
                ))}
              </ul>

              <IonCard>
                <IonCardHeader>
                  <IonCardTitle>Verified learning activity</IonCardTitle>
                  <p className="student-page__card-note">Completed sessions, missions, and passed challenges over the last six months.</p>
                </IonCardHeader>
                <IonCardContent>
                  <div className="analytics-page__chart" role="img" aria-label="Monthly completed session and passed challenge counts">
                    {activity.map((month) => {
                      const total = month.sessions + month.challenges + month.missions;
                      return (
                        <div className="analytics-page__month" key={month.key}>
                          <div className="analytics-page__bar-track">
                            <div
                              className="analytics-page__bar"
                              style={{ height: `${total === 0 ? 0 : Math.max(8, total / maximum * 100)}%` }}
                              title={`${month.sessions} sessions, ${month.missions} missions, ${month.challenges} challenges`}
                            />
                          </div>
                          <strong>{total}</strong>
                          <span>{month.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="analytics-page__legend">
                    <IonBadge color="primary">Completed sessions, missions, and passed challenges</IonBadge>
                  </div>
                </IonCardContent>
              </IonCard>

              <IonCard>
                <IonCardHeader><IonCardTitle>Progress by skill</IonCardTitle></IonCardHeader>
                <IonCardContent>
                  <p className="student-page__card-note">
                    Bars compare each skill’s recorded learning activity with your most active skill; they are not proficiency scores.
                  </p>
                  {passport.skills.length === 0 ? (
                    <p className="student-page__card-note">Add skills to your profile to start tracking progress.</p>
                  ) : passport.skills.map((skill) => {
                    const activityCount = skill.completed_sessions + skill.verified_activities + skill.challenges_passed;
                    const relativeActivity = Math.round(activityCount / maximumSkillActivity * 100);
                    return (
                      <article className="analytics-page__skill" key={skill.skill_id}>
                        <div className="analytics-page__skill-heading">
                          <strong>{skill.name}</strong>
                          <span>{skill.proficiency_level} · {skill.xp_earned} XP · {skill.completed_sessions} sessions</span>
                        </div>
                        <div
                          className="analytics-page__progress"
                          role="progressbar"
                          aria-label={`${skill.name} relative recorded learning activity`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={relativeActivity}
                        >
                          <span style={{ width: `${relativeActivity}%` }} />
                        </div>
                        <p className="student-page__card-note">
                          {skill.verified_activities} verified activities · {skill.challenges_passed} challenges · {skill.endorsements_received} endorsements
                        </p>
                      </article>
                    );
                  })}
                </IonCardContent>
              </IonCard>

              <IonCard>
                <IonCardHeader><IonCardTitle>Collaboration history</IonCardTitle></IonCardHeader>
                <IonCardContent>
                  {projects.length === 0 ? (
                    <p className="student-page__card-note">Join a project room to see collaboration here.</p>
                  ) : projects.map((project) => (
                    <article className="analytics-page__project" key={project.project_id}>
                      <div>
                        <strong>{project.name}</strong>
                        <p className="student-page__card-note">{project.progress}% complete · Updated {new Date(project.updated_at).toLocaleDateString()}</p>
                      </div>
                      <IonBadge color={project.status === 'completed' ? 'success' : 'primary'}>{project.status}</IonBadge>
                    </article>
                  ))}
                </IonCardContent>
              </IonCard>

              <IonButton fill="outline" routerLink="/tabs/skill-passport">View Skill Passport</IonButton>
            </>
          )}
        </main>
      </IonContent>
    </IonPage>
  );
};

export default Analytics;
