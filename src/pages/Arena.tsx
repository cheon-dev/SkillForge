import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
  IonInput,
  IonLabel,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/react';
import {
  addOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  flameOutline,
  flashOutline,
  gameControllerOutline,
  hourglassOutline,
  playOutline,
  podiumOutline,
  refreshOutline,
  trophyOutline,
} from 'ionicons/icons';
import FormModal from '../components/FormModal';
import NotificationsButton from '../components/NotificationsButton';
import {
  createDuel,
  findDuelOpponent,
  finishArenaRound,
  getArenaLeaderboard,
  getArenaSkills,
  getArenaState,
  getFriendlyStudentError,
  getMyQuestionBank,
  saveQuizQuestion,
  setArenaLeaderboardOptOut,
  startArenaRound,
  submitArenaAnswer,
  type ArenaAnswerResult,
  type ArenaDifficulty,
  type ArenaLeaderboardRow,
  type ArenaOpponent,
  type ArenaQuestionBank,
  type ArenaRound,
  type ArenaRoundSummary,
  type ArenaSkill,
  type ArenaState,
} from '../services/student';
import './Arena.css';

type View = 'lobby' | 'playing' | 'summary';

interface QuestionDraft {
  id?: string;
  skill_id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
  difficulty: ArenaDifficulty;
}

const emptyQuestionDraft: QuestionDraft = {
  skill_id: '',
  prompt: '',
  options: ['', '', '', ''],
  correct_index: 0,
  explanation: '',
  difficulty: 'medium',
};

const tierColor: Record<string, string> = {
  Bronze: 'medium',
  Silver: 'tertiary',
  Gold: 'warning',
  Platinum: 'secondary',
  Diamond: 'primary',
};

const difficultyColor: Record<ArenaDifficulty, string> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
};

const formatExpiry = (value: string) => {
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d left`;
  if (hours >= 1) return `${hours}h left`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m left`;
};

const Arena = () => {
  const location = useLocation();
  const requestedSkill = useMemo(
    () => new URLSearchParams(location.search).get('skill'),
    [location.search],
  );

  const [arena, setArena] = useState<ArenaState | null>(null);
  const [skills, setSkills] = useState<ArenaSkill[]>([]);
  const [bank, setBank] = useState<ArenaQuestionBank>({ skills: [], questions: [] });
  const [leaderboard, setLeaderboard] = useState<ArenaLeaderboardRow[]>([]);

  const [selectedSkill, setSelectedSkill] = useState('');
  const [leaderboardSkill, setLeaderboardSkill] = useState<string>('all');
  const [period, setPeriod] = useState<'week' | 'all'>('week');
  const [scope, setScope] = useState<'global' | 'course'>('global');

  const [view, setView] = useState<View>('lobby');
  const [round, setRound] = useState<ArenaRound | null>(null);
  const [index, setIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<ArenaAnswerResult | null>(null);
  const [summary, setSummary] = useState<ArenaRoundSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [opponent, setOpponent] = useState<ArenaOpponent | null>(null);
  const [duelModalOpen, setDuelModalOpen] = useState(false);

  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [questionDraft, setQuestionDraft] = useState<QuestionDraft>(emptyQuestionDraft);
  const [questionError, setQuestionError] = useState<string | null>(null);

  const loadLobby = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextArena, nextSkills, nextBank] = await Promise.all([
        getArenaState(),
        getArenaSkills(),
        getMyQuestionBank(),
      ]);
      setArena(nextArena);
      setSkills(nextSkills);
      setBank(nextBank);
      setSelectedSkill((current) => {
        if (requestedSkill && nextSkills.some((s) => s.id === requestedSkill)) {
          return requestedSkill;
        }
        if (current && nextSkills.some((s) => s.id === current)) return current;
        return nextSkills[0]?.id ?? '';
      });
    } catch (loadError) {
      setError(getFriendlyStudentError(loadError, 'We could not load the Arena.'));
    } finally {
      setLoading(false);
    }
  }, [requestedSkill]);

  const loadLeaderboard = useCallback(async () => {
    try {
      const rows = await getArenaLeaderboard(
        scope,
        period,
        leaderboardSkill === 'all' ? null : leaderboardSkill,
      );
      setLeaderboard(rows);
    } catch {
      setLeaderboard([]);
    }
  }, [leaderboardSkill, period, scope]);

  useEffect(() => { void loadLobby(); }, [loadLobby]);
  useEffect(() => { void loadLeaderboard(); }, [loadLeaderboard]);

  const currentSkill = skills.find((skill) => skill.id === selectedSkill) ?? null;
  const question = round?.questions[index] ?? null;
  const progress = round ? ((index + (feedback ? 1 : 0)) / round.questions.length) * 100 : 0;

  const beginRound = async (mode: 'solo' | 'duel', skillId: string, duelId: string | null) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const nextRound = await startArenaRound(mode, skillId, duelId);
      setRound(nextRound);
      setIndex(0);
      setSelectedOption(null);
      setFeedback(null);
      setSummary(null);
      setView('playing');
    } catch (startError) {
      setError(getFriendlyStudentError(startError, 'That round could not be started.'));
    } finally {
      setBusy(false);
    }
  };

  const answerQuestion = async (optionIndex: number) => {
    if (!round || !question || selectedOption !== null || busy) return;
    setSelectedOption(optionIndex);
    setBusy(true);
    setError(null);
    try {
      const result = await submitArenaAnswer(round.round_id, question.id, optionIndex);
      setFeedback(result);
    } catch (answerError) {
      setSelectedOption(null);
      setError(getFriendlyStudentError(answerError, 'That answer could not be scored.'));
    } finally {
      setBusy(false);
    }
  };

  const finishRound = async () => {
    if (!round) return;
    setBusy(true);
    setError(null);
    try {
      const result = await finishArenaRound(round.round_id);
      setSummary(result);
      setView('summary');
      await loadLobby();
      await loadLeaderboard();
    } catch (finishError) {
      setError(getFriendlyStudentError(finishError, 'That round could not be finished.'));
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    if (!round) return;
    if (index + 1 < round.questions.length) {
      setIndex(index + 1);
      setSelectedOption(null);
      setFeedback(null);
      return;
    }
    await finishRound();
  };

  const findOpponent = async () => {
    if (!selectedSkill) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const found = await findDuelOpponent(selectedSkill);
      if (!found) {
        setNotice('No one else has this skill right now. Try another skill or check back soon.');
        return;
      }
      setOpponent(found);
      setDuelModalOpen(true);
    } catch (findError) {
      setError(getFriendlyStudentError(findError, 'We could not find an opponent.'));
    } finally {
      setBusy(false);
    }
  };

  const sendChallenge = async () => {
    if (!opponent || !selectedSkill) return;
    setBusy(true);
    try {
      await createDuel(opponent.id, selectedSkill);
      setDuelModalOpen(false);
      setNotice(`Challenge sent to ${opponent.full_name}. You can play your side now.`);
      setOpponent(null);
      await loadLobby();
    } catch (challengeError) {
      setError(getFriendlyStudentError(challengeError, 'That challenge could not be sent.'));
      setDuelModalOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const toggleLeaderboard = async () => {
    if (!arena) return;
    setBusy(true);
    try {
      await setArenaLeaderboardOptOut(!arena.leaderboard_opt_out);
      await loadLobby();
      await loadLeaderboard();
    } catch (toggleError) {
      setError(getFriendlyStudentError(toggleError, 'That setting could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const openQuestionModal = (draft: QuestionDraft = emptyQuestionDraft) => {
    setQuestionError(null);
    setQuestionDraft({
      ...draft,
      skill_id: draft.skill_id || bank.skills[0]?.id || '',
    });
    setQuestionModalOpen(true);
  };

  const saveQuestion = async () => {
    const options = questionDraft.options.map((option) => option.trim());
    if (!questionDraft.skill_id) {
      setQuestionError('Choose the skill this question belongs to.');
      return;
    }
    if (!questionDraft.prompt.trim()) {
      setQuestionError('Write the question first.');
      return;
    }
    if (options.some((option) => !option)) {
      setQuestionError('Fill in all four answer options.');
      return;
    }
    setBusy(true);
    setQuestionError(null);
    try {
      await saveQuizQuestion({
        id: questionDraft.id,
        skill_id: questionDraft.skill_id,
        prompt: questionDraft.prompt.trim(),
        options,
        correct_index: questionDraft.correct_index,
        explanation: questionDraft.explanation.trim() || null,
        difficulty: questionDraft.difficulty,
      });
      setQuestionModalOpen(false);
      setQuestionDraft(emptyQuestionDraft);
      setNotice('Question saved. Solo Rush can use it now; an admin approves it for Duels.');
      await loadLobby();
    } catch (saveError) {
      setQuestionError(getFriendlyStudentError(saveError, 'That question could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const backToLobby = () => {
    setView('lobby');
    setRound(null);
    setFeedback(null);
    setSelectedOption(null);
    setSummary(null);
  };

  if (loading && !arena) {
    return (
      <IonPage>
        <IonHeader><IonToolbar><IonTitle>Skill Arena</IonTitle></IonToolbar></IonHeader>
        <IonContent className="student-page">
          <div className="student-page__empty"><IonSpinner name="crescent" /></div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Skill Arena</IonTitle>
          <IonButtons slot="end"><NotificationsButton /></IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="student-page arena-page">
        <main className="student-page__content">
          {error && (
            <div className="student-page__alert">
              <IonText color="danger">{error}</IonText>
            </div>
          )}
          {notice && (
            <div className="student-page__alert">
              <IonText>{notice}</IonText>
            </div>
          )}

          {view === 'lobby' && arena && (
            <>
              <section className="arena-hero">
                <div className="arena-hero__top">
                  <div>
                    <p className="student-page__eyebrow">YOUR RANK</p>
                    <h1>{arena.tier}</h1>
                    <p className="arena-hero__rating">{arena.rating} rating</p>
                  </div>
                  <IonBadge color={tierColor[arena.tier] ?? 'medium'} className="arena-hero__badge">
                    <IonIcon icon={trophyOutline} /> {arena.tier}
                  </IonBadge>
                </div>

                <div className="arena-hero__stats">
                  <div>
                    <strong>{arena.wins}</strong>
                    <span>Wins</span>
                  </div>
                  <div>
                    <strong>{arena.losses}</strong>
                    <span>Losses</span>
                  </div>
                  <div>
                    <strong>{arena.draws}</strong>
                    <span>Draws</span>
                  </div>
                  <div>
                    <strong>
                      <IonIcon icon={flameOutline} /> {arena.current_streak}
                    </strong>
                    <span>Day streak</span>
                  </div>
                </div>

                <div className="arena-hero__xp">
                  <div className="arena-hero__xp-label">
                    <span>XP today</span>
                    <span>{arena.xp_today} / {arena.xp_cap}</span>
                  </div>
                  <div className="arena-hero__xp-track">
                    <span style={{ width: `${Math.min(100, (arena.xp_today / arena.xp_cap) * 100)}%` }} />
                  </div>
                </div>
              </section>

              {arena.open_duels.length > 0 && (
                <IonCard>
                  <IonCardHeader>
                    <IonCardTitle>Your duels</IonCardTitle>
                    <IonCardSubtitle>Both sides must play before a result is decided.</IonCardSubtitle>
                  </IonCardHeader>
                  <IonCardContent>
                    {arena.open_duels.map((duel) => (
                      <article className="arena-duel" key={duel.id}>
                        <div>
                          <h2>{duel.opponent_name}</h2>
                          <p>
                            {duel.skill_name}
                            {' · '}
                            {duel.i_played
                              ? 'you have played'
                              : duel.opponent_played
                                ? 'waiting for you'
                                : 'waiting for both players'}
                            {' · '}
                            {formatExpiry(duel.expires_at)}
                          </p>
                        </div>
                        {duel.i_played ? (
                          <IonBadge color="medium">
                            <IonIcon icon={hourglassOutline} /> Waiting
                          </IonBadge>
                        ) : (
                          <IonButton
                            size="small"
                            disabled={busy}
                            onClick={() => void beginRound('duel', duel.skill_id, duel.id)}
                          >
                            <IonIcon slot="start" icon={playOutline} />
                            Play
                          </IonButton>
                        )}
                      </article>
                    ))}
                  </IonCardContent>
                </IonCard>
              )}

              <IonCard className="arena-play-card">
                <IonCardHeader>
                  <IonCardTitle>Pick a skill and play</IonCardTitle>
                  <IonCardSubtitle>
                    Solo Rush is a fast personal run. Duels are ranked, one against one.
                  </IonCardSubtitle>
                </IonCardHeader>
                <IonCardContent>
                  <div className="arena-play__picker">
                    <IonSelect
                      label="Skill"
                      labelPlacement="stacked"
                      value={selectedSkill}
                      onIonChange={(event) => setSelectedSkill(String(event.detail.value))}
                    >
                      {skills.map((skill) => (
                        <IonSelectOption key={skill.id} value={skill.id}>
                          {skill.name} ({skill.question_count} questions)
                        </IonSelectOption>
                      ))}
                    </IonSelect>
                    {currentSkill && (
                      <p className="arena-play__meta">
                        {currentSkill.category}
                        {' · '}
                        {currentSkill.duel_question_count} approved for duels
                      </p>
                    )}
                  </div>

                  <div className="arena-play__actions">
                    <IonButton
                      expand="block"
                      disabled={busy || !selectedSkill || (currentSkill?.question_count ?? 0) < 4}
                      onClick={() => void beginRound('solo', selectedSkill, null)}
                    >
                      <IonIcon slot="start" icon={flashOutline} />
                      Solo Rush
                    </IonButton>
                    <IonButton
                      expand="block"
                      fill="outline"
                      disabled={
                        busy
                        || !selectedSkill
                        || (currentSkill?.duel_question_count ?? 0) < 5
                        || !currentSkill?.on_my_profile
                      }
                      onClick={() => void findOpponent()}
                    >
                      <IonIcon slot="start" icon={gameControllerOutline} />
                      Find a Duel
                    </IonButton>
                  </div>

                  {currentSkill && !currentSkill.on_my_profile && (
                    <p className="student-page__card-note">
                      Add this skill to your profile before starting a ranked duel. Solo Rush is
                      open to every skill.
                    </p>
                  )}
                  {currentSkill && currentSkill.on_my_profile && currentSkill.duel_question_count < 5 && (
                    <p className="student-page__card-note">
                      Duels unlock once at least five questions for this skill are approved.
                    </p>
                  )}
                </IonCardContent>
              </IonCard>

              <IonCard>
                <IonCardHeader>
                  <div className="student-page__card-heading">
                    <div>
                      <IonCardTitle>Leaderboard</IonCardTitle>
                      <IonCardSubtitle>
                        {period === 'week' ? 'XP earned in the last seven days.' : 'All-time rating.'}
                      </IonCardSubtitle>
                    </div>
                    <IonIcon icon={podiumOutline} className="arena-leaderboard__icon" />
                  </div>
                </IonCardHeader>
                <IonCardContent>
                  <IonSegment
                    value={period}
                    onIonChange={(event) => setPeriod(event.detail.value as 'week' | 'all')}
                  >
                    <IonSegmentButton value="week"><IonLabel>This week</IonLabel></IonSegmentButton>
                    <IonSegmentButton value="all"><IonLabel>All time</IonLabel></IonSegmentButton>
                  </IonSegment>

                  <div className="arena-leaderboard__filters">
                    <IonSelect
                      value={leaderboardSkill}
                      interface="popover"
                      onIonChange={(event) => setLeaderboardSkill(String(event.detail.value))}
                    >
                      <IonSelectOption value="all">All skills</IonSelectOption>
                      {skills.map((skill) => (
                        <IonSelectOption key={skill.id} value={skill.id}>{skill.name}</IonSelectOption>
                      ))}
                    </IonSelect>
                    <IonSelect
                      value={scope}
                      interface="popover"
                      onIonChange={(event) => setScope(event.detail.value as 'global' | 'course')}
                    >
                      <IonSelectOption value="global">Everyone</IonSelectOption>
                      <IonSelectOption value="course">My course</IonSelectOption>
                    </IonSelect>
                  </div>

                  {leaderboard.length === 0 ? (
                    <p className="student-page__card-note">
                      No one has played this board yet. Finish a round to claim the first spot.
                    </p>
                  ) : (
                    <ol className="arena-leaderboard">
                      {leaderboard.map((row) => (
                        <li
                          key={row.student_id}
                          className={row.is_me ? 'arena-leaderboard__row arena-leaderboard__row--me' : 'arena-leaderboard__row'}
                        >
                          <span className="arena-leaderboard__rank">{row.rank_no}</span>
                          <span className="arena-leaderboard__name">
                            {row.full_name}
                            {row.is_me ? ' (you)' : ''}
                          </span>
                          <IonBadge color={tierColor[row.tier] ?? 'medium'}>{row.tier}</IonBadge>
                          <span className="arena-leaderboard__points">
                            {period === 'week' ? `${row.points} XP` : `${row.rating} rating`}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}

                  <div className="arena-leaderboard__optout">
                    <IonLabel>
                      <h2>Show me on the leaderboard</h2>
                      <p>Turning this off hides your name and rating from everyone.</p>
                    </IonLabel>
                    <IonToggle
                      checked={!arena.leaderboard_opt_out}
                      disabled={busy}
                      onIonChange={() => void toggleLeaderboard()}
                    />
                  </div>
                </IonCardContent>
              </IonCard>

              {bank.skills.length > 0 && (
                <IonCard>
                  <IonCardHeader>
                    <div className="student-page__card-heading">
                      <div>
                        <IonCardTitle>Your questions</IonCardTitle>
                        <IonCardSubtitle>
                          Questions you write are playable in Solo Rush straight away. An admin
                          approves them before they enter ranked Duels.
                        </IonCardSubtitle>
                      </div>
                      <IonButton size="small" onClick={() => openQuestionModal()}>
                        <IonIcon slot="start" icon={addOutline} />
                        Add question
                      </IonButton>
                    </div>
                  </IonCardHeader>
                  <IonCardContent>
                    {bank.questions.length === 0 ? (
                      <p className="student-page__card-note">
                        You have not written any questions yet.
                      </p>
                    ) : (
                      bank.questions.map((item) => (
                        <article className="arena-question-row" key={item.id}>
                          <div>
                            <h2>{item.prompt}</h2>
                            <p>
                              {item.skill_name}
                              {' · '}
                              {item.answer_count} answer(s)
                            </p>
                          </div>
                          <div className="arena-question-row__actions">
                            <IonBadge color={item.approved_for_duel ? 'success' : 'medium'}>
                              {item.approved_for_duel ? 'In duels' : 'Practice only'}
                            </IonBadge>
                            <IonButton
                              size="small"
                              fill="clear"
                              onClick={() => openQuestionModal({
                                id: item.id,
                                skill_id: item.skill_id,
                                prompt: item.prompt,
                                options: [...item.options],
                                correct_index: item.correct_index,
                                explanation: item.explanation ?? '',
                                difficulty: item.difficulty,
                              })}
                            >
                              Edit
                            </IonButton>
                          </div>
                        </article>
                      ))
                    )}
                  </IonCardContent>
                </IonCard>
              )}

            </>
          )}

          {view === 'playing' && round && question && (
            <section className="arena-round">
              <div className="arena-round__top">
                <span>Question {index + 1} of {round.questions.length}</span>
                <span className="arena-round__score">{feedback?.score ?? 0} pts</span>
              </div>

              <div className="arena-round__timer" key={question.id}>
                <span style={{ animationDuration: `${round.question_limit_ms}ms` }} />
              </div>

              <div className="arena-round__progress">
                <span style={{ width: `${progress}%` }} />
              </div>

              {feedback && feedback.combo >= 3 && (
                <p className="arena-round__combo">
                  <IonIcon icon={flameOutline} /> {feedback.combo} in a row
                </p>
              )}

              <IonCard className="arena-round__card">
                <IonCardContent>
                  <div className="arena-round__meta">
                    <IonBadge color={difficultyColor[question.difficulty]}>
                      {question.difficulty}
                    </IonBadge>
                    <span>{round.mode === 'duel' ? 'Ranked duel' : 'Solo Rush'}</span>
                  </div>
                  <h1>{question.prompt}</h1>

                  <div className="arena-round__options">
                    {question.options.map((option, optionIndex) => {
                      const isCorrect = feedback ? optionIndex === feedback.correct_index : false;
                      const isChosen = optionIndex === selectedOption;
                      const showWrong = !!feedback && isChosen && !feedback.is_correct;
                      return (
                        <button
                          key={optionIndex}
                          type="button"
                          className={[
                            'arena-option',
                            isCorrect ? 'arena-option--correct' : '',
                            showWrong ? 'arena-option--wrong' : '',
                            isChosen ? 'arena-option--chosen' : '',
                          ].filter(Boolean).join(' ')}
                          disabled={selectedOption !== null}
                          onClick={() => void answerQuestion(optionIndex)}
                        >
                          <span className="arena-option__letter">
                            {String.fromCharCode(65 + optionIndex)}
                          </span>
                          <span>{option}</span>
                          {isCorrect && <IonIcon icon={checkmarkCircleOutline} />}
                          {showWrong && <IonIcon icon={closeCircleOutline} />}
                        </button>
                      );
                    })}
                  </div>

                  {feedback && (
                    <div className={feedback.is_correct ? 'arena-feedback arena-feedback--good' : 'arena-feedback arena-feedback--bad'}>
                      <strong>
                        {feedback.is_correct ? 'Correct' : 'Not quite'}
                        {feedback.points > 0 ? ` · +${feedback.points}` : ''}
                      </strong>
                      {feedback.explanation && <p>{feedback.explanation}</p>}
                    </div>
                  )}
                </IonCardContent>
              </IonCard>

              <div className="arena-round__actions">
                {feedback ? (
                  <IonButton expand="block" disabled={busy} onClick={() => void advance()}>
                    {index + 1 < round.questions.length ? 'Next question' : 'See results'}
                  </IonButton>
                ) : (
                  <IonButton
                    expand="block"
                    fill="clear"
                    disabled={busy || selectedOption !== null}
                    onClick={() => void finishRound()}
                  >
                    Finish early
                  </IonButton>
                )}
              </div>
            </section>
          )}

          {view === 'summary' && summary && (
            <section className="arena-summary">
              <div className="arena-summary__hero">
                <p className="student-page__eyebrow">
                  {summary.mode === 'duel' ? 'DUEL RESULT' : 'SOLO RUSH'}
                </p>
                <h1>{summary.score} points</h1>
                <p>
                  {summary.correct_count} of {summary.answered_count} correct
                  {summary.personal_best ? ' · new personal best' : ''}
                </p>
              </div>

              <div className="arena-summary__grid">
                <div>
                  <strong>+{summary.xp_awarded}</strong>
                  <span>XP earned</span>
                </div>
                <div>
                  <strong>{summary.total_xp}</strong>
                  <span>Total XP</span>
                </div>
                <div>
                  <strong>{summary.level}</strong>
                  <span>Level</span>
                </div>
                <div>
                  <strong><IonIcon icon={flameOutline} /> {summary.streak}</strong>
                  <span>Day streak</span>
                </div>
              </div>

              {summary.duel && (
                <IonCard className="arena-summary__duel">
                  <IonCardContent>
                    {summary.duel.status === 'waiting' ? (
                      <>
                        <h2>Waiting for your opponent</h2>
                        <p>
                          Your score of {summary.duel.my_score} is locked in. The result appears
                          here once they play.
                        </p>
                      </>
                    ) : (
                      <>
                        <h2>
                          {summary.duel.result === 'win'
                            ? 'You won'
                            : summary.duel.result === 'loss'
                              ? 'You lost'
                              : 'Draw'}
                        </h2>
                        <p>
                          You {summary.duel.my_score} · them {summary.duel.opponent_score}
                          {' · '}
                          rating {summary.duel.rating_change >= 0 ? '+' : ''}
                          {summary.duel.rating_change}
                        </p>
                      </>
                    )}
                  </IonCardContent>
                </IonCard>
              )}

              <div className="arena-summary__actions">
                {summary.mode === 'solo' ? (
                  <IonButton
                    expand="block"
                    disabled={busy}
                    onClick={() => void beginRound('solo', round?.skill_id ?? selectedSkill, null)}
                  >
                    <IonIcon slot="start" icon={refreshOutline} />
                    Rematch
                  </IonButton>
                ) : (
                  <IonButton expand="block" disabled={busy} onClick={() => void loadLobby()}>
                    <IonIcon slot="start" icon={refreshOutline} />
                    Refresh duels
                  </IonButton>
                )}
                <IonButton expand="block" fill="clear" onClick={backToLobby}>
                  Back to Arena
                </IonButton>
              </div>
            </section>
          )}
        </main>
      </IonContent>

      <FormModal
        isOpen={duelModalOpen}
        title="Send a duel challenge"
        subtitle="Your opponent gets 48 hours to play. You can play your side straight away."
        onDismiss={() => setDuelModalOpen(false)}
        onSubmit={() => void sendChallenge()}
        submitLabel="Send challenge"
        submitting={busy}
      >
        {opponent && (
          <div className="arena-opponent">
            <h2>{opponent.full_name}</h2>
            <p>
              {opponent.course ? `${opponent.course} · ` : ''}
              {opponent.rating} rating
            </p>
            <IonBadge color={tierColor[opponent.tier] ?? 'medium'}>{opponent.tier}</IonBadge>
          </div>
        )}
      </FormModal>

      <FormModal
        isOpen={questionModalOpen}
        title={questionDraft.id ? 'Edit question' : 'Add a question'}
        subtitle="Write a question you can teach. Four options keeps marking simple."
        onDismiss={() => setQuestionModalOpen(false)}
        onSubmit={() => void saveQuestion()}
        submitLabel="Save question"
        submitting={busy}
      >
        {questionError && (
          <div className="student-page__alert">
            <IonText color="danger">{questionError}</IonText>
          </div>
        )}

        <IonSelect
          label="Skill"
          labelPlacement="stacked"
          value={questionDraft.skill_id}
          onIonChange={(event) => setQuestionDraft({ ...questionDraft, skill_id: String(event.detail.value) })}
        >
          {bank.skills.map((skill) => (
            <IonSelectOption key={skill.id} value={skill.id}>{skill.name}</IonSelectOption>
          ))}
        </IonSelect>

        <IonTextarea
          label="Question"
          labelPlacement="stacked"
          autoGrow
          rows={2}
          value={questionDraft.prompt}
          onIonInput={(event) => setQuestionDraft({ ...questionDraft, prompt: String(event.detail.value ?? '') })}
        />

        {questionDraft.options.map((option, optionIndex) => (
          <div className="arena-question-option" key={optionIndex}>
            <IonInput
              label={`Option ${String.fromCharCode(65 + optionIndex)}`}
              labelPlacement="stacked"
              value={option}
              onIonInput={(event) => {
                const next = [...questionDraft.options];
                next[optionIndex] = String(event.detail.value ?? '');
                setQuestionDraft({ ...questionDraft, options: next });
              }}
            />
            <IonToggle
              checked={questionDraft.correct_index === optionIndex}
              onIonChange={() => setQuestionDraft({ ...questionDraft, correct_index: optionIndex })}
            >
              Correct
            </IonToggle>
          </div>
        ))}

        <IonSelect
          label="Difficulty"
          labelPlacement="stacked"
          value={questionDraft.difficulty}
          onIonChange={(event) => setQuestionDraft({ ...questionDraft, difficulty: event.detail.value as ArenaDifficulty })}
        >
          <IonSelectOption value="easy">Easy</IonSelectOption>
          <IonSelectOption value="medium">Medium</IonSelectOption>
          <IonSelectOption value="hard">Hard</IonSelectOption>
        </IonSelect>

        <IonTextarea
          label="Why is that answer right?"
          labelPlacement="stacked"
          autoGrow
          rows={2}
          value={questionDraft.explanation}
          onIonInput={(event) => setQuestionDraft({ ...questionDraft, explanation: String(event.detail.value ?? '') })}
        />
      </FormModal>
    </IonPage>
  );
};

export default Arena;
