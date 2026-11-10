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
import { addOutline, chevronBackOutline, peopleOutline, ribbonOutline } from 'ionicons/icons';
import FormModal from '../components/FormModal';
import NotificationsButton from '../components/NotificationsButton';
import { useAuth } from '../hooks/useAuth';
import {
  addProjectFile,
  addProjectMember,
  completeProjectMilestone,
  createProject,
  createProjectMilestone,
  createProjectTask,
  deleteProject,
  deleteProjectTask,
  getFriendlyStudentError,
  getMyProjects,
  getProjectDetail,
  getProjectTeamRecommendations,
  getSkillCatalog,
  getStudentDirectory,
  removeProjectMember,
  setProjectMemberRole,
  setProjectStatus,
  setProjectTaskStatus,
  type ProjectDetail,
  type ProjectRecommendation,
  type ProjectStatus,
  type ProjectSummary,
  type ProjectTaskStatus,
  type Skill,
  type StudentDirectoryEntry,
} from '../services/student';
import './StudentPages.css';
import './Collaboration.css';

const statusLabels: Record<ProjectStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

const statusColors: Record<ProjectStatus, string> = {
  planning: 'medium',
  active: 'primary',
  completed: 'success',
  archived: 'medium',
};

const taskStatusLabels: Record<ProjectTaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

const taskStatusColors: Record<ProjectTaskStatus, string> = {
  todo: 'medium',
  in_progress: 'primary',
  blocked: 'warning',
  done: 'success',
};

const formatDate = (value: string | null): string => {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(value));
};

const formatWhen = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const emptyDraft = { name: '', description: '', skillIds: [] as string[], memberIds: [] as string[] };

type CollaborationModal = 'create' | 'milestone' | 'task' | 'file' | null;

const Collaboration = () => {
  const { user } = useAuth();
  const router = useIonRouter();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [modal, setModal] = useState<CollaborationModal>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [catalog, setCatalog] = useState<Skill[]>([]);
  const [directory, setDirectory] = useState<StudentDirectoryEntry[]>([]);

  const [detail, setDetail] = useState<ProjectDetail | null>(null);  const [detailLoading, setDetailLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<ProjectRecommendation[]>([]);
  const [busy, setBusy] = useState(false);
  const [newMemberId, setNewMemberId] = useState('');

  const [milestoneDraft, setMilestoneDraft] = useState({ title: '', dueDate: '' });
  const [taskDraft, setTaskDraft] = useState({
    title: '',
    assignedTo: '',
    milestoneId: '',
    dueDate: '',
  });
  const [fileDraft, setFileDraft] = useState({ label: '', url: '' });

  const loadProjects = useCallback(async () => {
    if (!user) return;
    try {
      setProjects(await getMyProjects());
      setError(null);
    } catch (loadError) {
      setError(getFriendlyStudentError(loadError, 'We could not load your project rooms.'));
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const [projectsData, catalogData, directoryData] = await Promise.all([
          getMyProjects(),
          getSkillCatalog(),
          getStudentDirectory(user.id),
        ]);
        if (!mounted) return;
        setProjects(projectsData);
        setCatalog(catalogData);
        setDirectory(directoryData);
        setError(null);
      } catch (loadError) {
        if (mounted) {
          setError(getFriendlyStudentError(loadError, 'We could not load your project rooms.'));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => { mounted = false; };
  }, [user]);

  const openProject = useCallback(async (projectId: string) => {
    setDetailLoading(true);
    setNewMemberId('');
    setError(null);
    setMessage(null);
    try {
      const [projectDetail, team] = await Promise.all([
        getProjectDetail(projectId),
        getProjectTeamRecommendations(projectId),
      ]);
      setDetail(projectDetail);
      setRecommendations(team);
    } catch (loadError) {
      setError(getFriendlyStudentError(loadError, 'We could not open that project room.'));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeProject = () => {
    setDetail(null);
    setRecommendations([]);
    setNewMemberId('');
    setMilestoneDraft({ title: '', dueDate: '' });
    setTaskDraft({ title: '', assignedTo: '', milestoneId: '', dueDate: '' });
    setFileDraft({ label: '', url: '' });
    setModal(null);
    setModalError(null);
    setError(null);
    setMessage(null);
  };

  const refreshDetail = async (projectId: string) => {
    setDetail(await getProjectDetail(projectId));
    setRecommendations(await getProjectTeamRecommendations(projectId));
    await loadProjects();
  };

  const runAction = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (actionError) {
      setError(getFriendlyStudentError(actionError, 'That change could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!draft.name.trim()) {
      setModalError('Give the project room a name first.');
      return;
    }
    setBusy(true);
    setModalError(null);
    setError(null);
    setMessage(null);
    try {
      const projectId = await createProject({
        name: draft.name.trim(),
        description: draft.description.trim(),
        skillIds: draft.skillIds,
        memberIds: draft.memberIds,
      });
      setDraft(emptyDraft);
      setModal(null);
      await loadProjects();
      setMessage('Project room created. Invite more teammates or start adding tasks.');
      await openProject(projectId);
    } catch (createError) {
      setModalError(getFriendlyStudentError(createError, 'We could not create that project room.'));
    } finally {
      setBusy(false);
    }
  };

  const openModal = (next: Exclude<CollaborationModal, null>) => {
    setModalError(null);
    setModal(next);
  };

  const handleAddMilestone = async () => {
    if (!detail) return;
    if (!milestoneDraft.title.trim()) {
      setModalError('Give the milestone a title.');
      return;
    }
    setBusy(true);
    setModalError(null);
    try {
      await createProjectMilestone(
        detail.project.project_id,
        milestoneDraft.title.trim(),
        '',
        milestoneDraft.dueDate || null,
      );
      setMilestoneDraft({ title: '', dueDate: '' });
      setModal(null);
      await refreshDetail(detail.project.project_id);
      setMessage('Milestone added.');
    } catch (milestoneError) {
      setModalError(getFriendlyStudentError(milestoneError, 'We could not add that milestone.'));
    } finally {
      setBusy(false);
    }
  };

  const handleAddTask = async () => {
    if (!detail) return;
    if (!taskDraft.title.trim()) {
      setModalError('Give the task a title.');
      return;
    }
    setBusy(true);
    setModalError(null);
    try {
      await createProjectTask({
        projectId: detail.project.project_id,
        title: taskDraft.title.trim(),
        description: '',
        assignedTo: taskDraft.assignedTo || null,
        milestoneId: taskDraft.milestoneId || null,
        dueDate: taskDraft.dueDate || null,
      });
      setTaskDraft({ title: '', assignedTo: '', milestoneId: '', dueDate: '' });
      setModal(null);
      await refreshDetail(detail.project.project_id);
      setMessage('Task added.');
    } catch (taskError) {
      setModalError(getFriendlyStudentError(taskError, 'We could not add that task.'));
    } finally {
      setBusy(false);
    }
  };

  const handleShareFile = async () => {
    if (!detail) return;
    if (!fileDraft.label.trim() || !fileDraft.url.trim()) {
      setModalError('Add a label and a link.');
      return;
    }
    setBusy(true);
    setModalError(null);
    try {
      await addProjectFile(detail.project.project_id, fileDraft.label.trim(), fileDraft.url.trim());
      setFileDraft({ label: '', url: '' });
      setModal(null);
      await refreshDetail(detail.project.project_id);
      setMessage('File link shared.');
    } catch (fileError) {
      setModalError(getFriendlyStudentError(fileError, 'We could not share that link.'));
    } finally {
      setBusy(false);
    }
  };

  const activeProject = detail?.project ?? null;
  const memberOptions = useMemo(
    () => detail?.members ?? [],
    [detail],
  );
  const availableMembers = useMemo(
    () => directory.filter((candidate) =>
      !detail?.members.some((member) => member.student_id === candidate.student_id),
    ),
    [detail, directory],
  );
  const selectedMember = availableMembers.find((candidate) => candidate.student_id === newMemberId);

  const taskOwnerName = (taskId: string): string => {
    const task = detail?.tasks.find((item) => item.task_id === taskId);
    return task?.title ?? 'this task';
  };

  return (
    <IonPage className="collaboration-page">
      <IonHeader>
        <IonToolbar>
          {activeProject && (
            <IonButtons slot="start">
              <IonButton fill="clear" onClick={closeProject} aria-label="Back to project rooms">
                <IonIcon slot="start" icon={chevronBackOutline} />
                Back
              </IonButton>
            </IonButtons>
          )}
          <IonTitle>{activeProject ? activeProject.name : 'Collaboration'}</IonTitle>
          <IonButtons slot="end"><NotificationsButton /></IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="student-page">
        <main className="student-page__content">
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
              <IonSpinner name="crescent" /> <IonText color="medium">Loading project rooms…</IonText>
            </div>
          )}

          {!loading && !detail && !detailLoading && (
            <>
              <section className="student-page__hero">
                <p className="student-page__eyebrow">BUILD TOGETHER</p>
                <h1>Collaboration rooms</h1>
                <p className="student-page__lead">
                  Bring complementary skills into one room: a group chat, shared milestones, tasks
                  with owners, and a record of what the team actually finished.
                </p>
                <IonButton onClick={() => openModal('create')}>
                  <IonIcon slot="start" icon={addOutline} />
                  New project room
                </IonButton>
              </section>

              {projects.length === 0 && (
                <div className="student-page__empty">
                  <IonIcon icon={peopleOutline} />
                  <IonText color="medium">
                    No project rooms yet. Create one when you have a project and need a team.
                  </IonText>
                  <IonButton fill="outline" onClick={() => openModal('create')}>
                    Create your first project room
                  </IonButton>
                </div>
              )}

              {projects.map((project) => (
                <IonCard key={project.project_id} button onClick={() => void openProject(project.project_id)}>
                  <IonCardHeader>
                    <div className="collaboration-page__card-heading">
                      <div>
                        <IonCardTitle>{project.name}</IonCardTitle>
                        <IonCardSubtitle>
                          {project.member_count} member{project.member_count === 1 ? '' : 's'}
                          {project.is_owner ? ' · you own this room' : ''}
                        </IonCardSubtitle>
                      </div>
                      <IonBadge color={statusColors[project.status]}>
                        {statusLabels[project.status]}
                      </IonBadge>
                    </div>
                  </IonCardHeader>
                  <IonCardContent>
                    {project.description && <p>{project.description}</p>}
                    {project.skills.length > 0 && (
                      <p className="student-page__card-note">
                        Needs: {project.skills.map((skill) => skill.name).join(' · ')}
                      </p>
                    )}
                    <div className="collaboration-page__progress" aria-label={`${project.progress}% complete`}>
                      <div style={{ width: `${project.progress}%` }} />
                    </div>
                    <p className="student-page__card-note">
                      {project.progress}% · {project.task_done}/{project.task_total} tasks ·{' '}
                      {project.milestone_done}/{project.milestone_total} milestones
                      {project.next_milestone
                        ? ` · next: ${project.next_milestone.title}`
                        : ''}
                    </p>
                  </IonCardContent>
                </IonCard>
              ))}
            </>
          )}

          {detailLoading && (
            <div className="student-page__empty">
              <IonSpinner name="crescent" /> <IonText color="medium">Opening the room…</IonText>
            </div>
          )}

          {!detailLoading && detail && (
            <>
              <IonCard>
                <IonCardHeader>
                  <div className="collaboration-page__card-heading">
                    <div>
                      <IonCardSubtitle>
                        Owned by {detail.project.owner_name}
                        {detail.project.is_owner ? ' (you)' : ''}
                      </IonCardSubtitle>
                      <IonCardTitle>{detail.project.name}</IonCardTitle>
                    </div>
                    <IonBadge color={statusColors[detail.project.status]}>
                      {statusLabels[detail.project.status]}
                    </IonBadge>
                  </div>
                </IonCardHeader>
                <IonCardContent>
                  {detail.project.description && <p>{detail.project.description}</p>}
                  <div className="collaboration-page__progress" aria-label={`${detail.progress.percent}% complete`}>
                    <div style={{ width: `${detail.progress.percent}%` }} />
                  </div>
                  <p className="student-page__card-note">
                    {detail.progress.percent}% complete · {detail.progress.task_done}/
                    {detail.progress.task_total} tasks · {detail.progress.milestone_done}/
                    {detail.progress.milestone_total} milestones
                  </p>
                  <div className="collaboration-page__actions">
                    {detail.conversation_id && (
                      <IonButton
                        size="small"
                        onClick={() => router.push(`/tabs/messages?open=${detail.conversation_id}`)}
                      >
                        Open group chat
                      </IonButton>
                    )}
                    {detail.project.is_owner && (
                      <IonSelect
                        className="collaboration-page__status-select"
                        value={detail.project.status}
                        disabled={busy}
                        onIonChange={(event) => {
                          const next = event.detail.value as ProjectStatus;
                          void runAction(async () => {
                            await setProjectStatus(detail.project.project_id, next);
                            await refreshDetail(detail.project.project_id);
                          }, `Project marked ${statusLabels[next].toLowerCase()}.`);
                        }}
                      >
                        {(Object.keys(statusLabels) as ProjectStatus[]).map((status) => (
                          <IonSelectOption key={status} value={status}>
                            {statusLabels[status]}
                          </IonSelectOption>
                        ))}
                      </IonSelect>
                    )}
                  </div>
                </IonCardContent>
              </IonCard>

              {detail.skills.length > 0 && (
                <section className="collaboration-page__chips">
                  {detail.skills.map((skill) => (
                    <span className="collaboration-page__chip" key={skill.skill_id}>
                      <IonIcon icon={ribbonOutline} aria-hidden="true" /> {skill.name}
                    </span>
                  ))}
                </section>
              )}

              <IonCard>
                <IonCardHeader>
                  <IonCardTitle>Team</IonCardTitle>
                  <IonCardSubtitle>{detail.members.length} member(s)</IonCardSubtitle>
                </IonCardHeader>
                <IonCardContent>
                  {detail.members.map((member) => (
                    <article className="collaboration-page__member" key={member.student_id}>
                      <div className="student-page__goal-heading">
                        <div>
                          <h2>
                            {member.full_name}
                            {member.student_id === user?.id ? ' (you)' : ''}
                          </h2>
                          <p>
                            {member.role ?? 'Contributor'}
                            {member.course ? ` · ${member.course}` : ''}
                          </p>
                        </div>
                        {detail.project.is_owner && member.student_id !== detail.project.owner_id && (
                          <div className="collaboration-page__member-actions">
                          <IonButton
                            size="small"
                            fill="clear"
                            color="danger"
                            disabled={busy}
                            onClick={() => {
                              void runAction(async () => {
                                await removeProjectMember(detail.project.project_id, member.student_id);
                                await refreshDetail(detail.project.project_id);
                              }, `${member.full_name} was removed from the project.`);
                            }}
                          >
                            Remove
                          </IonButton>
                          <IonSelect
                            className="collaboration-page__role-select"
                            value={member.role ?? 'Contributor'}
                            disabled={busy}
                            onIonChange={(event) => {
                              const role = String(event.detail.value);
                              void runAction(async () => {
                                await setProjectMemberRole(
                                  detail.project.project_id,
                                  member.student_id,
                                  role,
                                );
                                await refreshDetail(detail.project.project_id);
                              }, `${member.full_name} is now ${role}.`);
                            }}
                          >
                            <IonSelectOption value="Contributor">Contributor</IonSelectOption>
                            <IonSelectOption value="Designer">Designer</IonSelectOption>
                            <IonSelectOption value="Developer">Developer</IonSelectOption>
                            <IonSelectOption value="Documentation">Documentation</IonSelectOption>
                            <IonSelectOption value="Reviewer">Reviewer</IonSelectOption>
                          </IonSelect>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}

                  {!detail.project.is_owner && (
                    <IonButton
                      size="small"
                      fill="outline"
                      color="danger"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(
                          `Are you sure you want to leave "${detail.project.name}"? You will need another member to invite you back.`,
                        )) return;
                        void runAction(async () => {
                          await removeProjectMember(detail.project.project_id, user!.id);
                          closeProject();
                        }, 'You left the project.');
                      }}
                    >
                      Leave project
                    </IonButton>
                  )}

                  <h3 className="collaboration-page__subtitle">Add a member</h3>
                  {availableMembers.length > 0 ? (
                    <>
                      <IonItem className="collaboration-page__invite-select">
                        <IonLabel position="stacked">Choose a student</IonLabel>
                        <IonSelect
                          value={newMemberId}
                          placeholder="Select a student"
                          disabled={busy}
                          onIonChange={(event) => setNewMemberId(event.detail.value ?? '')}
                          aria-label="Choose a student to add to this project"
                        >
                          {availableMembers.map((candidate) => (
                            <IonSelectOption
                              key={candidate.student_id}
                              value={candidate.student_id}
                            >
                              {candidate.full_name}
                              {candidate.course ? ` · ${candidate.course}` : ''}
                            </IonSelectOption>
                          ))}
                        </IonSelect>
                      </IonItem>
                      <IonButton
                        size="small"
                        disabled={busy || !selectedMember}
                        onClick={() => {
                          if (!detail || !selectedMember) return;
                          void runAction(async () => {
                            await addProjectMember(
                              detail.project.project_id,
                              selectedMember.student_id,
                              'Contributor',
                            );
                            setNewMemberId('');
                            await refreshDetail(detail.project.project_id);
                          }, `${selectedMember.full_name} was added to the project.`);
                        }}
                      >
                        Invite member
                      </IonButton>
                    </>
                  ) : (
                    <p className="student-page__card-note">
                      All available students are already members of this project.
                    </p>
                  )}

                  {detail.project.is_owner && recommendations.length > 0 && (
                    <>
                      <h3 className="collaboration-page__subtitle">Suggested teammates</h3>
                      <p className="student-page__card-note">
                        Ranked by the project skills your current team cannot cover yet.
                      </p>
                      {recommendations.map((candidate) => (
                        <article className="collaboration-page__member" key={candidate.student_id}>
                          <div className="student-page__goal-heading">
                            <div>
                              <h2>{candidate.full_name}</h2>
                              <p>
                                Covers {candidate.covered_skills.map((skill) => skill.name).join(', ')}
                                {candidate.course ? ` · ${candidate.course}` : ''}
                              </p>
                            </div>
                            <IonButton
                              size="small"
                              disabled={busy}
                              onClick={() => {
                                void runAction(async () => {
                                  await addProjectMember(
                                    detail.project.project_id,
                                    candidate.student_id,
                                    'Contributor',
                                  );
                                  await refreshDetail(detail.project.project_id);
                                }, `${candidate.full_name} joined the project.`);
                              }}
                            >
                              Invite
                            </IonButton>
                          </div>
                        </article>
                      ))}
                    </>
                  )}

                  {detail.project.is_owner && recommendations.length === 0 && detail.skills.length > 0 && (
                    <p className="student-page__card-note">
                      Every skill this project needs is already covered by the team.
                    </p>
                  )}
                </IonCardContent>
              </IonCard>

              <IonCard>
                <IonCardHeader>
                  <IonCardTitle>Milestones</IonCardTitle>
                  <IonCardSubtitle>
                    {detail.progress.milestone_done}/{detail.progress.milestone_total} completed
                  </IonCardSubtitle>
                </IonCardHeader>
                <IonCardContent>
                  {detail.milestones.length === 0 && (
                    <p className="student-page__card-note">No milestones yet.</p>
                  )}
                  {detail.milestones.map((milestone) => (
                    <article className="collaboration-page__milestone" key={milestone.milestone_id}>
                      <div className="student-page__goal-heading">
                        <div>
                          <h2>{milestone.title}</h2>
                          <p>
                            {formatDate(milestone.due_date)} · {milestone.task_done}/
                            {milestone.task_total} linked tasks
                          </p>
                        </div>
                        <IonBadge color={milestone.status === 'completed' ? 'success' : 'medium'}>
                          {milestone.status === 'completed' ? 'Completed' : 'Open'}
                        </IonBadge>
                      </div>
                      {milestone.description && <p>{milestone.description}</p>}
                      {milestone.status !== 'completed' && (
                        <IonButton
                          size="small"
                          fill="outline"
                          disabled={busy}
                          onClick={() => {
                            void runAction(async () => {
                              await completeProjectMilestone(milestone.milestone_id);
                              await refreshDetail(detail.project.project_id);
                            }, `"${milestone.title}" marked complete.`);
                          }}
                        >
                          Mark complete
                        </IonButton>
                      )}
                    </article>
                  ))}

                  <IonButton size="small" fill="outline" onClick={() => openModal('milestone')}>
                    <IonIcon slot="start" icon={addOutline} />
                    Add milestone
                  </IonButton>
                </IonCardContent>
              </IonCard>

              <IonCard>
                <IonCardHeader>
                  <IonCardTitle>Tasks</IonCardTitle>
                  <IonCardSubtitle>
                    {detail.progress.task_done}/{detail.progress.task_total} done
                  </IonCardSubtitle>
                </IonCardHeader>
                <IonCardContent>
                  {detail.tasks.length === 0 && (
                    <p className="student-page__card-note">No tasks yet.</p>
                  )}
                  {detail.tasks.map((task) => (
                    <article className="collaboration-page__task" key={task.task_id}>
                      <div className="student-page__goal-heading">
                        <div>
                          <h2>{task.title}</h2>
                          <p>
                            {task.assigned_to_name ? `Assigned to ${task.assigned_to_name}` : 'Unassigned'}
                            {task.due_date ? ` · due ${formatDate(task.due_date)}` : ''}
                          </p>
                        </div>
                        <IonBadge color={taskStatusColors[task.status]}>
                          {taskStatusLabels[task.status]}
                        </IonBadge>
                      </div>
                      {task.description && <p>{task.description}</p>}
                      <div className="collaboration-page__actions">
                        <IonSelect
                          className="collaboration-page__status-select"
                          value={task.status}
                          disabled={busy}
                          onIonChange={(event) => {
                            const next = event.detail.value as ProjectTaskStatus;
                            void runAction(async () => {
                              await setProjectTaskStatus(task.task_id, next);
                              await refreshDetail(detail.project.project_id);
                            }, `"${taskOwnerName(task.task_id)}" moved to ${taskStatusLabels[next].toLowerCase()}.`);
                          }}
                        >
                          {(Object.keys(taskStatusLabels) as ProjectTaskStatus[]).map((status) => (
                            <IonSelectOption key={status} value={status}>
                              {taskStatusLabels[status]}
                            </IonSelectOption>
                          ))}
                        </IonSelect>
                        {detail.project.is_owner && (
                          <IonButton
                            size="small"
                            fill="clear"
                            color="danger"
                            disabled={busy}
                            onClick={() => {
                              void runAction(async () => {
                                await deleteProjectTask(task.task_id);
                                await refreshDetail(detail.project.project_id);
                              }, 'Task deleted.');
                            }}
                          >
                            Delete
                          </IonButton>
                        )}
                      </div>
                    </article>
                  ))}

                  <IonButton size="small" fill="outline" onClick={() => openModal('task')}>
                    <IonIcon slot="start" icon={addOutline} />
                    Add task
                  </IonButton>
                </IonCardContent>
              </IonCard>

              <IonCard>
                <IonCardHeader>
                  <IonCardTitle>Shared files</IonCardTitle>
                  <IonCardSubtitle>Links the whole team can open</IonCardSubtitle>
                </IonCardHeader>
                <IonCardContent>
                  {detail.files.length === 0 && (
                    <p className="student-page__card-note">Nothing shared yet.</p>
                  )}
                  {detail.files.map((file) => (
                    <article className="collaboration-page__file" key={file.file_id}>
                      <div>
                        <a href={file.url} target="_blank" rel="noreferrer">{file.label}</a>
                        <p className="student-page__card-note">
                          Shared by {file.added_by_name} · {formatWhen(file.created_at)}
                        </p>
                      </div>
                    </article>
                  ))}

                  <IonButton size="small" fill="outline" onClick={() => openModal('file')}>
                    <IonIcon slot="start" icon={addOutline} />
                    Share link
                  </IonButton>
                </IonCardContent>
              </IonCard>

              <IonCard>
                <IonCardHeader>
                  <IonCardTitle>Collaboration history</IonCardTitle>
                  <IonCardSubtitle>Recorded from what the team actually did</IonCardSubtitle>
                </IonCardHeader>
                <IonCardContent>
                  {detail.events.length === 0 && (
                    <p className="student-page__card-note">No activity recorded yet.</p>
                  )}
                  <ol className="collaboration-page__history">
                    {detail.events.map((event) => (
                      <li key={event.event_id}>
                        <strong>{event.actor_name}</strong> {event.summary}
                        <span>{formatWhen(event.created_at)}</span>
                      </li>
                    ))}
                  </ol>
                </IonCardContent>
              </IonCard>

              {detail.project.is_owner && (
                <IonButton
                  expand="block"
                  color="danger"
                  fill="outline"
                  disabled={busy}
                  onClick={() => {
                    void runAction(async () => {
                      await deleteProject(detail.project.project_id);
                      closeProject();
                      await loadProjects();
                    }, 'Project room deleted.');
                  }}
                >
                  Delete project room
                </IonButton>
              )}
            </>
          )}
        </main>
      </IonContent>

      <FormModal
        isOpen={modal === 'create'}
        title="New project room"
        subtitle="Pick the skills the project needs. You can invite teammates now or later."
        onDismiss={() => setModal(null)}
        onSubmit={() => void handleCreate()}
        submitting={busy}
        submitLabel="Create room"
      >
        {modalError && <p className="app-modal__error" role="alert">{modalError}</p>}
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Project name</IonLabel>
          <IonInput
            value={draft.name}
            placeholder="Campus event tracker"
            onIonInput={(event) => setDraft((current) => ({
              ...current,
              name: event.detail.value ?? '',
            }))}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">What are you building?</IonLabel>
          <IonTextarea
            autoGrow
            value={draft.description}
            placeholder="A small web app so student orgs can track event tasks."
            onIonInput={(event) => setDraft((current) => ({
              ...current,
              description: event.detail.value ?? '',
            }))}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Skills this project needs</IonLabel>
          <IonSelect
            multiple
            value={draft.skillIds}
            onIonChange={(event) => setDraft((current) => ({
              ...current,
              skillIds: (event.detail.value as string[]) ?? [],
            }))}
          >
            {catalog.map((skill) => (
              <IonSelectOption key={skill.id} value={skill.id}>
                {skill.name} · {skill.category}
              </IonSelectOption>
            ))}
          </IonSelect>
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Invite teammates</IonLabel>
          <IonSelect
            multiple
            value={draft.memberIds}
            onIonChange={(event) => setDraft((current) => ({
              ...current,
              memberIds: (event.detail.value as string[]) ?? [],
            }))}
          >
            {directory.map((student) => (
              <IonSelectOption key={student.student_id} value={student.student_id}>
                {student.full_name}
                {student.course ? ` · ${student.course}` : ''}
              </IonSelectOption>
            ))}
          </IonSelect>
        </IonItem>
      </FormModal>

      <FormModal
        isOpen={modal === 'milestone'}
        title="Add milestone"
        subtitle="A milestone is a stage the whole team works towards."
        onDismiss={() => setModal(null)}
        onSubmit={() => void handleAddMilestone()}
        submitting={busy}
        submitLabel="Add milestone"
      >
        {modalError && <p className="app-modal__error" role="alert">{modalError}</p>}
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Milestone</IonLabel>
          <IonInput
            value={milestoneDraft.title}
            placeholder="Working prototype"
            onIonInput={(event) => setMilestoneDraft((current) => ({
              ...current,
              title: event.detail.value ?? '',
            }))}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Due date</IonLabel>
          <IonInput
            type="date"
            value={milestoneDraft.dueDate}
            onIonInput={(event) => setMilestoneDraft((current) => ({
              ...current,
              dueDate: event.detail.value ?? '',
            }))}
          />
        </IonItem>
      </FormModal>

      <FormModal
        isOpen={modal === 'task'}
        title="Add task"
        subtitle="Tasks can be assigned to any member of the team."
        onDismiss={() => setModal(null)}
        onSubmit={() => void handleAddTask()}
        submitting={busy}
        submitLabel="Add task"
      >
        {modalError && <p className="app-modal__error" role="alert">{modalError}</p>}
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Task</IonLabel>
          <IonInput
            value={taskDraft.title}
            placeholder="Sketch the dashboard"
            onIonInput={(event) => setTaskDraft((current) => ({
              ...current,
              title: event.detail.value ?? '',
            }))}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Assign to</IonLabel>
          <IonSelect
            value={taskDraft.assignedTo || undefined}
            placeholder="Unassigned"
            onIonChange={(event) => setTaskDraft((current) => ({
              ...current,
              assignedTo: (event.detail.value as string) ?? '',
            }))}
          >
            {memberOptions.map((member) => (
              <IonSelectOption key={member.student_id} value={member.student_id}>
                {member.full_name}
              </IonSelectOption>
            ))}
          </IonSelect>
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Milestone</IonLabel>
          <IonSelect
            value={taskDraft.milestoneId || undefined}
            placeholder="None"
            onIonChange={(event) => setTaskDraft((current) => ({
              ...current,
              milestoneId: (event.detail.value as string) ?? '',
            }))}
          >
            {detail?.milestones.map((milestone) => (
              <IonSelectOption key={milestone.milestone_id} value={milestone.milestone_id}>
                {milestone.title}
              </IonSelectOption>
            ))}
          </IonSelect>
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Due date</IonLabel>
          <IonInput
            type="date"
            value={taskDraft.dueDate}
            onIonInput={(event) => setTaskDraft((current) => ({
              ...current,
              dueDate: event.detail.value ?? '',
            }))}
          />
        </IonItem>
      </FormModal>

      <FormModal
        isOpen={modal === 'file'}
        title="Share a link"
        subtitle="Shared links are visible to everyone in the project."
        onDismiss={() => setModal(null)}
        onSubmit={() => void handleShareFile()}
        submitting={busy}
        submitLabel="Share link"
      >
        {modalError && <p className="app-modal__error" role="alert">{modalError}</p>}
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Label</IonLabel>
          <IonInput
            value={fileDraft.label}
            placeholder="Figma prototype"
            onIonInput={(event) => setFileDraft((current) => ({
              ...current,
              label: event.detail.value ?? '',
            }))}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Link</IonLabel>
          <IonInput
            type="url"
            inputmode="url"
            value={fileDraft.url}
            placeholder="https://"
            onIonInput={(event) => setFileDraft((current) => ({
              ...current,
              url: event.detail.value ?? '',
            }))}
          />
        </IonItem>
      </FormModal>
    </IonPage>
  );
};

export default Collaboration;
