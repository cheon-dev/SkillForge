import { useCallback, useEffect, useState } from 'react';
import {
  IonAlert,
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
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import {
  addOutline,
  documentTextOutline,
  folderOpenOutline,
  imageOutline,
  linkOutline,
  openOutline,
  ribbonOutline,
  trashOutline,
  videocamOutline,
} from 'ionicons/icons';
import FormModal from '../components/FormModal';
import NotificationsButton from '../components/NotificationsButton';
import { useAuth } from '../hooks/useAuth';
import {
  addSkillEvidence,
  deleteSkillEvidence,
  getEvidenceSignedUrl,
  getFriendlyStudentError,
  getMyEvidence,
  getMyProjects,
  getSkillPassport,
  MAX_EVIDENCE_FILE_SIZE,
  removeEvidenceFile,
  syncMyAchievements,
  uploadSkillEvidenceFile,
  type EvidenceType,
  type PassportSkill,
  type ProjectSummary,
  type SkillEvidence,
  type UnlockedAchievement,
  type SkillPassport,
} from '../services/student';
import './StudentPages.css';

const proficiencyLabels: Record<PassportSkill['proficiency_level'], string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};

const proficiencyColors: Record<PassportSkill['proficiency_level'], string> = {
  beginner: 'medium',
  intermediate: 'primary',
  advanced: 'tertiary',
  expert: 'success',
};

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));

const formatFileSize = (bytes: number | null): string => {
  if (!bytes) {
    return '';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const evidenceTypeLabels: Record<EvidenceType, string> = {
  screenshot: 'Screenshot',
  certificate: 'Certificate',
  document: 'Document',
  video: 'Video',
  link: 'Link',
  project: 'Project',
};

const evidenceTypeIcons: Record<EvidenceType, string> = {
  screenshot: imageOutline,
  certificate: ribbonOutline,
  document: documentTextOutline,
  video: videocamOutline,
  link: linkOutline,
  project: folderOpenOutline,
};

const evidenceFileAccept = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4',
  'video/webm',
  'video/quicktime',
].join(',');

interface EvidenceDraft {
  skillId: string;
  title: string;
  description: string;
  evidenceType: EvidenceType;
  file: File | null;
  externalUrl: string;
}

const emptyEvidenceDraft: EvidenceDraft = {
  skillId: '',
  title: '',
  description: '',
  evidenceType: 'screenshot',
  file: null,
  externalUrl: '',
};

const SkillPassportPage = () => {
  const { user } = useAuth();
  const [passport, setPassport] = useState<SkillPassport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<UnlockedAchievement[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [evidence, setEvidence] = useState<SkillEvidence[]>([]);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [evidenceDraft, setEvidenceDraft] = useState<EvidenceDraft>(emptyEvidenceDraft);
  const [evidenceModalError, setEvidenceModalError] = useState<string | null>(null);
  const [savingEvidence, setSavingEvidence] = useState(false);
  const [evidenceToDelete, setEvidenceToDelete] = useState<SkillEvidence | null>(null);
  const [openingEvidenceId, setOpeningEvidenceId] = useState<string | null>(null);
  const [evidenceNotice, setEvidenceNotice] = useState<string | null>(null);

  const loadPassport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Re-evaluate achievements first: some milestones (such as marking a skill
      // teachable) happen outside the RPCs that award them, so the passport is
      // the right place to catch up. This is a catch-up convenience, not a
      // prerequisite, so a failure here must not take down the whole page.
      try {
        const unlocked = await syncMyAchievements();
        if (unlocked.count > 0) {
          setUnlocked(unlocked.achievements);
        }
      } catch {
        // ignored on purpose; the passport below is still correct
      }
      setPassport(await getSkillPassport());
      // Project rooms are shown as collaboration history. A failure here must
      // not hide the rest of the passport.
      try {
        setProjects(await getMyProjects());
      } catch {
        setProjects([]);
      }
      // Evidence is an optional part of the passport, so a failure here must
      // not hide the rest of the page.
      try {
        setEvidence(await getMyEvidence());
      } catch {
        setEvidence([]);
      }
    } catch (loadError) {
      setError(getFriendlyStudentError(loadError, 'We could not load your Skill Passport.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPassport();
  }, [loadPassport]);

  const openEvidenceModal = () => {
    setEvidenceDraft({
      ...emptyEvidenceDraft,
      skillId: passport?.skills[0]?.skill_id ?? '',
    });
    setEvidenceModalError(null);
    setEvidenceModalOpen(true);
  };

  const closeEvidenceModal = () => {
    if (savingEvidence) {
      return;
    }
    setEvidenceModalOpen(false);
    setEvidenceModalError(null);
  };

  const handleEvidenceSubmit = async () => {
    if (!user) {
      return;
    }

    const title = evidenceDraft.title.trim();
    const url = evidenceDraft.externalUrl.trim();
    const type = evidenceDraft.evidenceType;

    if (!evidenceDraft.skillId) {
      setEvidenceModalError('Choose a skill for this evidence.');
      return;
    }
    if (!title) {
      setEvidenceModalError('Give this evidence a title.');
      return;
    }
    if (type === 'link' && !url) {
      setEvidenceModalError('Paste a link for link evidence.');
      return;
    }
    if (type !== 'link' && type !== 'project' && !evidenceDraft.file) {
      setEvidenceModalError('Choose a file to upload.');
      return;
    }
    if (type === 'project' && !evidenceDraft.file && !url) {
      setEvidenceModalError('Add a file or a link for this project.');
      return;
    }
    if (evidenceDraft.file && evidenceDraft.file.size > MAX_EVIDENCE_FILE_SIZE) {
      setEvidenceModalError('Files must be 25 MB or smaller.');
      return;
    }
    if (url && !/^https?:\/\//i.test(url)) {
      setEvidenceModalError('Links must start with http:// or https://.');
      return;
    }

    setSavingEvidence(true);
    setEvidenceModalError(null);
    let uploadedPath: string | null = null;

    try {
      let filePath: string | null = null;
      let mimeType: string | null = null;
      let fileSize: number | null = null;

      if (evidenceDraft.file) {
        const uploaded = await uploadSkillEvidenceFile(evidenceDraft.file, user.id);
        uploadedPath = uploaded.path;
        filePath = uploaded.path;
        mimeType = uploaded.mimeType;
        fileSize = uploaded.size;
      }

      await addSkillEvidence({
        skillId: evidenceDraft.skillId,
        title,
        description: evidenceDraft.description.trim(),
        evidenceType: type,
        filePath,
        externalUrl: url || null,
        mimeType,
        fileSize,
      });

      setEvidence(await getMyEvidence());
      setEvidenceModalOpen(false);
      setEvidenceDraft(emptyEvidenceDraft);
      setEvidenceNotice('Evidence added to your passport.');
    } catch (submitError) {
      // The row was not saved, so do not leave an orphaned file in Storage.
      if (uploadedPath) {
        try {
          await removeEvidenceFile(uploadedPath);
        } catch {
          // best effort only
        }
      }
      setEvidenceModalError(
        getFriendlyStudentError(submitError, 'We could not save that evidence.'),
      );
    } finally {
      setSavingEvidence(false);
    }
  };

  const handleDeleteEvidence = async (item: SkillEvidence) => {
    try {
      const removed = await deleteSkillEvidence(item.id);
      if (removed.file_path) {
        try {
          await removeEvidenceFile(removed.file_path);
        } catch {
          // The row is already gone; an orphaned object is preferable to
          // blocking the removal.
        }
      }
      setEvidence(await getMyEvidence());
      setEvidenceNotice('Evidence removed from your passport.');
    } catch (deleteError) {
      setError(getFriendlyStudentError(deleteError, 'We could not remove that evidence.'));
    } finally {
      setEvidenceToDelete(null);
    }
  };

  const openEvidenceFile = async (item: SkillEvidence) => {
    if (!item.file_path) {
      return;
    }

    setOpeningEvidenceId(item.id);
    try {
      const url = await getEvidenceSignedUrl(item.file_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (openError) {
      setError(getFriendlyStudentError(openError, 'We could not open that file.'));
    } finally {
      setOpeningEvidenceId(null);
    }
  };

  const openEvidenceLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const displayName = passport?.profile?.full_name?.trim() || 'SkillForge student';
  const { totals, xp } = passport ?? {
    totals: {
      skills: 0, completed_sessions: 0, sessions_taught: 0,
      verified_activities: 0, challenges_passed: 0, endorsements_received: 0,
    },
    xp: { total_xp: 0, level: 1 },
  };

  const summary = [
    { label: 'Skills tracked', value: totals.skills },
    { label: 'Sessions completed', value: totals.completed_sessions },
    { label: 'Verified activities', value: totals.verified_activities },
    { label: 'Challenges passed', value: totals.challenges_passed },
    { label: 'Peer endorsements', value: totals.endorsements_received },
    { label: 'Sessions taught', value: totals.sessions_taught },
    { label: 'Evidence items', value: evidence.length },
  ];

  return (
    <IonPage className="passport-page">
      <IonHeader>
        <IonToolbar>
          <IonTitle>Skill Passport</IonTitle>
          <IonButtons slot="end"><NotificationsButton /></IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="student-page">
        <main className="student-page__content">
          <section className="student-page__hero">
            <p className="student-page__eyebrow">YOUR VERIFIED RECORD</p>
            <div className="student-page__identity">
              <div className="student-page__avatar" aria-hidden="true">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1>{displayName}</h1>
                <p>
                  {user?.email}
                  {passport?.profile?.course ? ` · ${passport.profile.course}` : ''}
                  {passport?.profile?.year_level ? ` · Year ${passport.profile.year_level}` : ''}
                </p>
              </div>
            </div>
          </section>

          {loading && (
            <div className="student-page__empty">
              <IonSpinner name="crescent" /> <IonText color="medium">Loading your passport…</IonText>
            </div>
          )}

          {error && (
            <div className="student-page__alert student-page__alert--error" role="alert">
              <IonText color="danger">{error}</IonText>
            </div>
          )}

          {evidenceNotice && (
            <div className="student-page__alert student-page__alert--success" role="status">
              <IonText color="success">{evidenceNotice}</IonText>
              <IonButton size="small" fill="clear" onClick={() => setEvidenceNotice(null)}>
                Dismiss
              </IonButton>
            </div>
          )}

          {unlocked.length > 0 && (
            <div className="passport-page__unlock-toast" role="status">
              <strong>
                {unlocked.length === 1 ? 'Achievement unlocked' : `${unlocked.length} achievements unlocked`}
              </strong>
              <ul>
                {unlocked.map((item) => (
                  <li key={item.id}>
                    <span aria-hidden="true">{item.icon ?? '🏅'}</span> {item.name}
                  </li>
                ))}
              </ul>
              <IonButton size="small" fill="clear" onClick={() => setUnlocked([])}>Dismiss</IonButton>
            </div>
          )}

          {!loading && !error && passport && totals.skills === 0 && (
            <div className="student-page__alert">
              <IonText>
                Your passport is empty because you have not added any skills to your profile yet.
                Until you do, completed sessions and passed challenges for a skill have nowhere
                to be listed.
              </IonText>
            </div>
          )}

          {!loading && !error && passport && (
            <>
              <IonCard className="passport-page__level-card">
                <IonCardContent>
                  <div className="passport-page__level">
                    <div>
                      <p className="student-page__eyebrow">LEVEL</p>
                      <strong>{xp.level}</strong>
                    </div>
                    <div>
                      <p className="student-page__eyebrow">TOTAL XP</p>
                      <strong>{xp.total_xp}</strong>
                    </div>
                  </div>
                  <p className="student-page__card-note">
                    XP is awarded by the platform only after a teacher reviews your work. It is
                    separate from Skill Credits.
                  </p>
                </IonCardContent>
              </IonCard>

              <ul className="passport-page__summary">
                {summary.map((item) => (
                  <li key={item.label}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>

              <IonCard>
                <IonCardHeader>
                  <IonCardTitle>Skills and evidence</IonCardTitle>
                  <IonCardSubtitle>Each count below comes from recorded, reviewed activity.</IonCardSubtitle>
                </IonCardHeader>
                <IonCardContent>
                  {passport.skills.length === 0 ? (
                    <div className="student-page__empty">
                      <IonText color="medium">
                        You have not added any skills yet. Add them in your profile to start building
                        your passport.
                      </IonText>
                      <IonButton fill="outline" routerLink="/tabs/profile">Add your skills</IonButton>
                    </div>
                  ) : (
                    <div className="passport-page__skills">
                      {passport.skills.map((skill) => (
                        <article className="passport-page__skill" key={skill.skill_id}>
                          <div className="student-page__goal-heading">
                            <div>
                              <h2>{skill.name}</h2>
                              <p>{skill.category}</p>
                            </div>
                            <IonBadge color={proficiencyColors[skill.proficiency_level]}>
                              {proficiencyLabels[skill.proficiency_level]}
                            </IonBadge>
                          </div>

                          {skill.is_teachable && <IonBadge color="tertiary">You can teach this</IonBadge>}

                          <ul className="passport-page__evidence">
                            <li><strong>{skill.completed_sessions}</strong> completed sessions</li>
                            <li><strong>{skill.verified_activities}</strong> verified activities</li>
                            <li><strong>{skill.challenges_passed}</strong> challenges passed</li>
                            <li><strong>{skill.endorsements_received}</strong> peer endorsements</li>
                            <li><strong>{skill.xp_earned}</strong> XP earned</li>
                            <li><strong>{skill.sessions_taught}</strong> sessions taught</li>
                          </ul>

                          {skill.completed_sessions === 0 && skill.verified_activities === 0 && skill.challenges_passed === 0 && skill.endorsements_received === 0 && (
                            <p className="student-page__card-note">
                              No verified evidence recorded for this skill yet.
                            </p>
                          )}

                          <IonButton
                            size="small"
                            fill="clear"
                            routerLink={`/tabs/arena?skill=${skill.skill_id}`}
                          >
                            Practice in Arena
                          </IonButton>
                        </article>
                      ))}
                    </div>
                  )}
                </IonCardContent>
              </IonCard>

              <IonCard>
                <IonCardHeader>
                  <div className="student-page__card-heading">
                    <div>
                      <IonCardTitle>Evidence and portfolio</IonCardTitle>
                      <IonCardSubtitle>
                        Screenshots, certificates, documents, videos, or project links that
                        prove your practice.
                      </IonCardSubtitle>
                    </div>
                    <IonButton
                      size="small"
                      fill="outline"
                      onClick={openEvidenceModal}
                      disabled={passport.skills.length === 0}
                    >
                      <IonIcon slot="start" icon={addOutline} />
                      Add evidence
                    </IonButton>
                  </div>
                </IonCardHeader>
                <IonCardContent>
                  {passport.skills.length === 0 ? (
                    <div className="student-page__empty">
                      <IonText color="medium">
                        Add a skill to your profile before uploading evidence for it.
                      </IonText>
                      <IonButton fill="outline" routerLink="/tabs/profile">
                        Add your skills
                      </IonButton>
                    </div>
                  ) : evidence.length === 0 ? (
                    <div className="student-page__empty">
                      <IonText color="medium">
                        No evidence yet. Add a screenshot, certificate, document, video, or
                        project link to start building your portfolio.
                      </IonText>
                    </div>
                  ) : (
                    <ul className="passport-page__evidence-list">
                      {evidence.map((item) => (
                        <li className="passport-page__evidence-item" key={item.id}>
                          <span className="passport-page__evidence-icon" aria-hidden="true">
                            <IonIcon icon={evidenceTypeIcons[item.evidence_type]} />
                          </span>
                          <div className="passport-page__evidence-body">
                            <div className="passport-page__evidence-heading">
                              <strong>{item.title}</strong>
                              <IonBadge color="medium">
                                {evidenceTypeLabels[item.evidence_type]}
                              </IonBadge>
                            </div>
                            <p className="student-page__card-note">
                              {item.skill_name}
                              {' · '}{formatDate(item.created_at)}
                              {item.file_size ? ` · ${formatFileSize(item.file_size)}` : ''}
                            </p>
                            {item.description && <p>{item.description}</p>}
                            <div className="passport-page__evidence-actions">
                              {item.external_url && (
                                <IonButton
                                  size="small"
                                  fill="clear"
                                  onClick={() => openEvidenceLink(item.external_url!)}
                                >
                                  <IonIcon slot="start" icon={openOutline} />
                                  Open link
                                </IonButton>
                              )}
                              {item.file_path && (
                                <IonButton
                                  size="small"
                                  fill="clear"
                                  onClick={() => void openEvidenceFile(item)}
                                  disabled={openingEvidenceId === item.id}
                                >
                                  <IonIcon slot="start" icon={openOutline} />
                                  {openingEvidenceId === item.id ? 'Opening…' : 'View file'}
                                </IonButton>
                              )}
                              <IonButton
                                size="small"
                                fill="clear"
                                color="danger"
                                onClick={() => setEvidenceToDelete(item)}
                              >
                                <IonIcon slot="start" icon={trashOutline} />
                                Remove
                              </IonButton>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </IonCardContent>
              </IonCard>

              <IonCard>
                <IonCardHeader>
                  <IonCardTitle>Project rooms</IonCardTitle>
                  <IonCardSubtitle>
                    Collaboration history recorded while working on real projects.
                  </IonCardSubtitle>
                </IonCardHeader>
                <IonCardContent>
                  {projects.length === 0 ? (
                    <div className="student-page__empty">
                      <IonText color="medium">
                        No project rooms yet. Join a team to turn your skills into something built.
                      </IonText>
                      <IonButton fill="outline" routerLink="/tabs/collaboration">
                        Open collaboration
                      </IonButton>
                    </div>
                  ) : (
                    <ul className="passport-page__endorsements">
                      {projects.map((project) => (
                        <li key={project.project_id}>
                          <p>
                            <strong>{project.name}</strong>
                            {' — '}
                            {project.status === 'completed'
                              ? 'Completed'
                              : `${project.progress}% complete`}
                          </p>
                          <p className="student-page__card-note">
                            {project.member_count} member{project.member_count === 1 ? '' : 's'}
                            {' · '}{project.milestone_done}/{project.milestone_total} milestones
                            {' · '}{project.task_done}/{project.task_total} tasks
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {projects.length > 0 && (
                    <IonButton fill="clear" routerLink="/tabs/collaboration">
                      Open collaboration
                    </IonButton>
                  )}
                </IonCardContent>
              </IonCard>

              <IonCard>
                <IonCardHeader>
                  <IonCardTitle>Peer endorsements</IonCardTitle>
                  <IonCardSubtitle>Recognition from students who observed your work.</IonCardSubtitle>
                </IonCardHeader>
                <IonCardContent>
                  {passport.endorsements.length === 0 ? (
                    <div className="student-page__empty">
                      <IonText color="medium">
                        No endorsements yet. After you complete a session with a peer you can
                        endorse the skill you studied together.
                      </IonText>
                      <IonButton fill="outline" routerLink="/tabs/endorsements">
                        View endorsement opportunities
                      </IonButton>
                    </div>
                  ) : (
                    <ul className="passport-page__endorsements">
                      {passport.endorsements.map((endorsement) => (
                        <li key={endorsement.id}>
                          <p>
                            <strong>{endorsement.skill_name}</strong>
                            {endorsement.comment ? ` — ${endorsement.comment}` : ''}
                          </p>
                          <p className="student-page__card-note">
                            Endorsed by {endorsement.endorsed_by_name ?? 'a SkillForge student'}
                            {' · '}{formatDate(endorsement.created_at)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {passport.endorsements.length > 0 && (
                    <IonButton fill="clear" routerLink="/tabs/endorsements">View all endorsements</IonButton>
                  )}
                </IonCardContent>
              </IonCard>

              <IonCard>
                <IonCardHeader>
                  <IonCardTitle>Achievements and badges</IonCardTitle>
                  <IonCardSubtitle>
                    Milestones the platform awards you. Locked ones show what to work toward.
                  </IonCardSubtitle>
                </IonCardHeader>
                <IonCardContent>
                  {passport.achievements.length === 0 ? (
                    <IonText color="medium">No achievements have been defined yet.</IonText>
                  ) : (
                    <ul className="passport-page__achievements">
                      {passport.achievements.map((achievement) => (
                        <li
                          className={`passport-page__achievement${achievement.earned ? '' : ' passport-page__achievement--locked'}`}
                          key={achievement.id}
                        >
                          <span className="passport-page__achievement-icon" aria-hidden="true">
                            {achievement.icon ?? '🏅'}
                          </span>
                          <div className="passport-page__achievement-body">
                            <strong>{achievement.name}</strong>
                            {achievement.description && <p>{achievement.description}</p>}
                            <p className="student-page__card-note">
                              {achievement.earned && achievement.earned_at
                                ? `Earned ${formatDate(achievement.earned_at)}`
                                : 'Not unlocked yet'}
                            </p>
                          </div>
                          <IonBadge color={achievement.earned ? 'success' : 'medium'} className="passport-page__achievement-state">
                            {achievement.earned ? 'Earned' : 'Locked'}
                          </IonBadge>
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
        isOpen={evidenceModalOpen}
        title="Add evidence"
        subtitle="Attach proof to a skill you already list on your profile. Files can be up to 25 MB."
        onDismiss={closeEvidenceModal}
        onSubmit={() => void handleEvidenceSubmit()}
        submitting={savingEvidence}
        submitLabel="Add evidence"
      >
        {evidenceModalError && (
          <IonText color="danger" className="app-modal__error">
            {evidenceModalError}
          </IonText>
        )}

        <IonItem className="app-form-field">
          <IonLabel position="stacked">Skill</IonLabel>
          <IonSelect
            value={evidenceDraft.skillId}
            placeholder="Choose a skill"
            onIonChange={(event) => setEvidenceDraft((draft) => ({
              ...draft,
              skillId: event.detail.value as string,
            }))}
          >
            {(passport?.skills ?? []).map((skill) => (
              <IonSelectOption key={skill.skill_id} value={skill.skill_id}>
                {skill.name}
              </IonSelectOption>
            ))}
          </IonSelect>
        </IonItem>

        <IonItem className="app-form-field">
          <IonLabel position="stacked">Title</IonLabel>
          <IonInput
            value={evidenceDraft.title}
            maxlength={120}
            placeholder="e.g. Python certificate"
            onIonInput={(event) => setEvidenceDraft((draft) => ({
              ...draft,
              title: event.detail.value ?? '',
            }))}
          />
        </IonItem>

        <IonItem className="app-form-field">
          <IonLabel position="stacked">Type</IonLabel>
          <IonSelect
            value={evidenceDraft.evidenceType}
            onIonChange={(event) => setEvidenceDraft((draft) => ({
              ...draft,
              evidenceType: event.detail.value as EvidenceType,
              file: null,
              externalUrl: '',
            }))}
          >
            {Object.entries(evidenceTypeLabels).map(([value, label]) => (
              <IonSelectOption key={value} value={value}>
                {label}
              </IonSelectOption>
            ))}
          </IonSelect>
        </IonItem>

        {evidenceDraft.evidenceType !== 'link' && (
          <div className="passport-page__file-field">
            <label htmlFor="evidence-file">
              {evidenceDraft.evidenceType === 'project' ? 'File (optional)' : 'File'}
            </label>
            <input
              id="evidence-file"
              type="file"
              accept={evidenceFileAccept}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setEvidenceDraft((draft) => ({ ...draft, file }));
              }}
            />
          </div>
        )}

        {(evidenceDraft.evidenceType === 'link' || evidenceDraft.evidenceType === 'project') && (
          <IonItem className="app-form-field">
            <IonLabel position="stacked">
              {evidenceDraft.evidenceType === 'project' ? 'Project link (optional)' : 'Link'}
            </IonLabel>
            <IonInput
              value={evidenceDraft.externalUrl}
              inputmode="url"
              placeholder="https://..."
              onIonInput={(event) => setEvidenceDraft((draft) => ({
                ...draft,
                externalUrl: event.detail.value ?? '',
              }))}
            />
          </IonItem>
        )}

        {evidenceDraft.file && (
          <p className="student-page__card-note">
            Selected: {evidenceDraft.file.name} ({formatFileSize(evidenceDraft.file.size)})
          </p>
        )}

        <IonItem className="app-form-field">
          <IonLabel position="stacked">Description (optional)</IonLabel>
          <IonTextarea
            value={evidenceDraft.description}
            maxlength={2000}
            autoGrow
            placeholder="What does this prove?"
            onIonInput={(event) => setEvidenceDraft((draft) => ({
              ...draft,
              description: event.detail.value ?? '',
            }))}
          />
        </IonItem>
      </FormModal>

      <IonAlert
        isOpen={!!evidenceToDelete}
        header="Remove evidence?"
        message={evidenceToDelete
          ? `"${evidenceToDelete.title}" will be removed from your passport.`
          : undefined}
        buttons={[
          {
            text: 'Cancel',
            role: 'cancel',
            handler: () => setEvidenceToDelete(null),
          },
          {
            text: 'Remove',
            role: 'destructive',
            handler: () => {
              if (evidenceToDelete) {
                void handleDeleteEvidence(evidenceToDelete);
              }
            },
          },
        ]}
        onDidDismiss={() => setEvidenceToDelete(null)}
      />
    </IonPage>
  );
};

export default SkillPassportPage;