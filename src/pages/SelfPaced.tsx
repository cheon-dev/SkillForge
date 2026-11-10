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
  IonIcon,
  IonItem,
  IonLabel,
  IonPage,
  IonProgressBar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { chevronDownOutline, chevronUpOutline } from 'ionicons/icons';
import NotificationsButton from '../components/NotificationsButton';
import { selfPacedCourses, type SelfPacedCourse } from '../data/selfPacedCourses';
import { useAuth } from '../hooks/useAuth';
import {
  completeSelfPacedLesson,
  getFriendlyStudentError,
  getSelfPacedLessonProgress,
  getSkillCatalog,
  type SelfPacedLessonProgress,
  type Skill,
} from '../services/student';
import { getSelfPacedCourseProgress } from '../utils/selfPaced';
import './StudentPages.css';
import './SelfPaced.css';

const SelfPaced = () => {
  const { user } = useAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [completedLessons, setCompletedLessons] = useState<SelfPacedLessonProgress[]>([]);
  const [selectedSkill, setSelectedSkill] = useState('all');
  const [selectedCourseSkill, setSelectedCourseSkill] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [checkedAnswer, setCheckedAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [catalog, progress] = await Promise.all([
        getSkillCatalog(),
        getSelfPacedLessonProgress(user.id),
      ]);
      setSkills(catalog);
      setCompletedLessons(progress);
    } catch (loadError) {
      setError(getFriendlyStudentError(loadError, 'We could not load self-paced learning.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const catalogSkillNames = useMemo(() => new Set(skills.map((skill) => skill.name)), [skills]);
  const courses = useMemo(
    () => selfPacedCourses.filter((course) => catalogSkillNames.has(course.skill)),
    [catalogSkillNames],
  );
  const filteredCourses = useMemo(
    () => selectedSkill === 'all'
      ? courses
      : courses.filter((course) => course.skill === selectedSkill),
    [courses, selectedSkill],
  );
  const completedIds = useMemo(
    () => new Set(completedLessons.map((item) => item.lesson_key)),
    [completedLessons],
  );
  const selectedCourse = courses.find((course) => course.skill === selectedCourseSkill) ?? null;
  const selectedLesson = selectedCourse?.lessons.find((lesson) => lesson.id === selectedLessonId) ?? null;
  const totalLessons = courses.reduce((total, course) => total + course.lessons.length, 0);
  const totalCompleted = completedLessons.filter((item) =>
    selfPacedCourses.some((course) =>
      catalogSkillNames.has(course.skill) && course.lessons.some((lesson) => lesson.id === item.lesson_key),
    ),
  ).length;

  const openCourse = (course: SelfPacedCourse) => {
    const progress = getSelfPacedCourseProgress(course, completedIds);
    setSelectedCourseSkill(course.skill);
    setSelectedLessonId(progress.nextLessonId ?? course.lessons[0]?.id ?? null);
    setSelectedAnswer(null);
    setCheckedAnswer(false);
    setNotice(null);
  };

  const toggleCourse = (course: SelfPacedCourse) => {
    if (selectedCourseSkill === course.skill) {
      setSelectedCourseSkill(null);
      setSelectedLessonId(null);
      setSelectedAnswer(null);
      setCheckedAnswer(false);
      return;
    }
    openCourse(course);
  };

  const openLesson = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    setSelectedAnswer(null);
    setCheckedAnswer(false);
    setNotice(null);
  };

  const markLessonComplete = async () => {
    if (!user || !selectedLesson || selectedAnswer !== selectedLesson.answer || completedIds.has(selectedLesson.id)) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const progress = await completeSelfPacedLesson(user.id, selectedLesson.id);
      setCompletedLessons((current) => current.some((item) => item.lesson_key === progress.lesson_key)
        ? current
        : [...current, progress]);
      setNotice(`"${selectedLesson.title}" marked complete. Your self-paced progress is saved.`);
    } catch (saveError) {
      setError(getFriendlyStudentError(saveError, 'We could not save your lesson progress.'));
    } finally {
      setSaving(false);
    }
  };

  const moveLesson = (direction: -1 | 1) => {
    if (!selectedCourse || !selectedLesson) return;
    const index = selectedCourse.lessons.findIndex((lesson) => lesson.id === selectedLesson.id);
    const next = selectedCourse.lessons[index + direction];
    if (next) openLesson(next.id);
  };

  const filterCourses = (skill: string) => {
    setSelectedSkill(skill);
    if (selectedCourseSkill && skill !== 'all' && selectedCourseSkill !== skill) {
      setSelectedCourseSkill(null);
      setSelectedLessonId(null);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Self-paced learning</IonTitle>
          <IonButtons slot="end"><NotificationsButton /></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="student-page self-paced-page">
        <main className="student-page__content">
          <section className="student-page__hero">
            <p className="student-page__eyebrow">LEARN AT YOUR OWN PACE</p>
            <h1>Self-paced learning</h1>
            <p className="student-page__lead">
              Short guided lessons with examples and practice prompts. Check your understanding,
              save progress, then try a Skill Challenge to demonstrate what you learned.
            </p>
          </section>

          {error && <div className="student-page__alert student-page__alert--error" role="alert"><IonText color="danger">{error}</IonText></div>}
          {notice && <div className="student-page__alert student-page__alert--success" role="status"><IonText color="success">{notice}</IonText></div>}

          {loading ? (
            <div className="student-page__empty"><IonSpinner name="crescent" /> Loading lessons…</div>
          ) : !error && (
            <>
              <IonCard className="self-paced-page__summary">
                <IonCardContent>
                  <div className="self-paced-page__summary-row">
                    <div>
                      <strong>{totalCompleted} / {totalLessons}</strong>
                      <span>lessons completed</span>
                    </div>
                    <IonProgressBar value={totalLessons ? totalCompleted / totalLessons : 0} />
                  </div>
                  <p className="student-page__card-note">
                    Self-paced lesson completion tracks your study progress; it does not award XP or Skill Credits.
                  </p>
                </IonCardContent>
              </IonCard>

              <IonItem className="app-form-field">
                <IonLabel position="stacked">Filter learning paths by skill</IonLabel>
                <IonSelect
                  value={selectedSkill}
                  onIonChange={(event) => filterCourses(event.detail.value ?? 'all')}
                  aria-label="Filter learning paths by skill"
                >
                  <IonSelectOption value="all">All skills</IonSelectOption>
                  {courses.map((course) => (
                    <IonSelectOption key={course.skill} value={course.skill}>{course.skill}</IonSelectOption>
                  ))}
                </IonSelect>
              </IonItem>

              <section className="self-paced-page__courses" aria-label="Learning paths">
                {filteredCourses.map((course) => {
                  const progress = getSelfPacedCourseProgress(course, completedIds);
                  const isExpanded = selectedCourseSkill === course.skill && selectedLesson !== null;
                  const lessonPanelId = `self-paced-lesson-${course.skill.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
                  return (
                    <IonCard
                      key={course.skill}
                      className={`self-paced-page__course${isExpanded ? ' self-paced-page__course--expanded' : ''}`}
                    >
                      <IonCardHeader>
                        <div className="student-page__goal-heading">
                          <div>
                            <IonCardSubtitle>{course.skill} · {course.lessons.length} lessons</IonCardSubtitle>
                            <IonCardTitle>{course.title}</IonCardTitle>
                          </div>
                          <IonBadge color={progress.percentComplete === 100 ? 'success' : 'primary'}>
                            {progress.percentComplete}%
                          </IonBadge>
                        </div>
                      </IonCardHeader>
                      <IonCardContent>
                        <p>{course.description}</p>
                        <IonProgressBar value={progress.percentComplete / 100} />
                        <p className="student-page__card-note">
                          {progress.completedLessons} of {progress.totalLessons} lessons complete
                        </p>
                        <IonButton
                          size="small"
                          aria-expanded={isExpanded}
                          aria-controls={lessonPanelId}
                          onClick={() => toggleCourse(course)}
                        >
                          {isExpanded
                            ? 'Hide lesson'
                            : progress.percentComplete === 100
                              ? 'Review course'
                              : progress.completedLessons
                                ? 'Continue learning'
                                : 'Start learning'}
                          <IonIcon
                            slot="end"
                            icon={isExpanded ? chevronUpOutline : chevronDownOutline}
                          />
                        </IonButton>
                        {isExpanded && selectedLesson && (
                          <section
                            id={lessonPanelId}
                            className="self-paced-page__lesson-area"
                            aria-label={`${course.title} lesson`}
                          >
                            <div className="student-page__goal-heading">
                              <div>
                                <p className="student-page__eyebrow">{course.title}</p>
                                <h2>{selectedLesson.title}</h2>
                              </div>
                              <IonBadge color={completedIds.has(selectedLesson.id) ? 'success' : 'medium'}>
                                {completedIds.has(selectedLesson.id)
                                  ? 'Completed'
                                  : `${selectedLesson.minutes} min`}
                              </IonBadge>
                            </div>

                            <IonCard>
                              <IonCardHeader>
                                <IonCardTitle>Learn</IonCardTitle>
                              </IonCardHeader>
                              <IonCardContent>
                                <ul className="self-paced-page__learn-list">
                                  {selectedLesson.learn.map((point) => <li key={point}>{point}</li>)}
                                </ul>
                                <h3>Example</h3>
                                <pre className="self-paced-page__example">
                                  <code>{selectedLesson.example}</code>
                                </pre>
                                <h3>Try it</h3>
                                <p>{selectedLesson.practice}</p>
                              </IonCardContent>
                            </IonCard>

                            <IonCard>
                              <IonCardHeader>
                                <IonCardTitle>Check your understanding</IonCardTitle>
                              </IonCardHeader>
                              <IonCardContent>
                                <p>{selectedLesson.question}</p>
                                <IonSelect
                                  placeholder="Choose an answer"
                                  value={selectedAnswer === null ? undefined : String(selectedAnswer)}
                                  onIonChange={(event) => {
                                    const answer = Number(event.detail.value);
                                    setSelectedAnswer(Number.isInteger(answer) ? answer : null);
                                    setCheckedAnswer(false);
                                  }}
                                  aria-label="Choose your answer"
                                >
                                  {selectedLesson.options.map((option, index) => (
                                    <IonSelectOption key={option} value={String(index)}>
                                      {option}
                                    </IonSelectOption>
                                  ))}
                                </IonSelect>
                                <div className="student-page__actions">
                                  <IonButton
                                    fill="outline"
                                    disabled={selectedAnswer === null || completedIds.has(selectedLesson.id)}
                                    onClick={() => setCheckedAnswer(true)}
                                  >
                                    Check answer
                                  </IonButton>
                                  {checkedAnswer && selectedAnswer !== null && (
                                    <IonText color={selectedAnswer === selectedLesson.answer ? 'success' : 'danger'}>
                                      {selectedAnswer === selectedLesson.answer
                                        ? selectedLesson.explanation
                                        : 'Not quite. Review the lesson and try again.'}
                                    </IonText>
                                  )}
                                </div>
                                <IonButton
                                  disabled={
                                    saving
                                    || completedIds.has(selectedLesson.id)
                                    || !checkedAnswer
                                    || selectedAnswer !== selectedLesson.answer
                                  }
                                  onClick={() => void markLessonComplete()}
                                >
                                  {saving
                                    ? <IonSpinner name="crescent" />
                                    : completedIds.has(selectedLesson.id)
                                      ? 'Lesson completed'
                                      : 'Mark lesson complete'}
                                </IonButton>
                              </IonCardContent>
                            </IonCard>

                            <div className="self-paced-page__lesson-navigation">
                              <IonButton
                                fill="clear"
                                disabled={course.lessons[0]?.id === selectedLesson.id}
                                onClick={() => moveLesson(-1)}
                              >
                                Previous lesson
                              </IonButton>
                              <IonButton
                                fill="clear"
                                disabled={course.lessons.at(-1)?.id === selectedLesson.id}
                                onClick={() => moveLesson(1)}
                              >
                                Next lesson
                              </IonButton>
                            </div>
                            <IonButton fill="outline" routerLink="/tabs/challenges">
                              Practice in Skill Challenges
                            </IonButton>
                          </section>
                        )}
                      </IonCardContent>
                    </IonCard>
                  );
                })}
              </section>

              {filteredCourses.length === 0 && (
                <div className="student-page__empty">
                  No self-paced lessons are available for this skill yet.
                </div>
              )}

            </>
          )}
        </main>
      </IonContent>
    </IonPage>
  );
};

export default SelfPaced;
