import { useEffect, useMemo, useRef, useState } from 'react';
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
  IonList,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/react';
import { addOutline, createOutline, settingsOutline } from 'ionicons/icons';
import FormModal from '../components/FormModal';
import NotificationsButton from '../components/NotificationsButton';
import { useAuth } from '../hooks/useAuth';
import {
  addStudentSkill,
  getMyAvailability,
  setMyAvailability,
  type AvailabilitySlot,
  getFriendlyStudentError,
  getSkillCatalog,
  getSkillPassport,
  getStudentProfile,
  getStudentSkills,
  removeStudentSkill,
  saveStudentProfile,
  updateStudentSkill,
  type PassportAchievement,
  type Profile,
  type Skill,
  type StudentSkill,
} from '../services/student';
import type { ProficiencyLevel } from '../types/supabase';
import { uploadStudentAvatar } from '../services/profileAvatar';
import '../components/AuthLoading.css';
import './StudentPages.css';

const proficiencyLevels: ProficiencyLevel[] = ['beginner', 'intermediate', 'advanced', 'expert'];

interface ProfileFormState {
  fullName: string;
  course: string;
  yearLevel: string;
  bio: string;
  avatarUrl: string;
}

interface SkillDraft {
  skillId: string;
  proficiencyLevel: ProficiencyLevel;
  yearsExperience: string;
  isTeachable: boolean;
}

interface PageMessage {
  text: string;
  tone: 'success' | 'danger';
}

const emptyProfileForm: ProfileFormState = {
  fullName: '',
  course: '',
  yearLevel: '',
  bio: '',
  avatarUrl: '',
};

const emptySkillDraft: SkillDraft = {
  skillId: '',
  proficiencyLevel: 'beginner',
  yearsExperience: '0',
  isTeachable: false,
};

const profileToForm = (profile: Profile | null, fallbackName: string): ProfileFormState => ({
  fullName: profile?.full_name ?? fallbackName,
  course: profile?.course ?? '',
  yearLevel: profile?.year_level === null || profile?.year_level === undefined
    ? ''
    : String(profile.year_level),
  bio: profile?.bio ?? '',
  avatarUrl: profile?.avatar_url ?? '',
});

const skillToDraft = (skill: StudentSkill): SkillDraft => ({
  skillId: skill.skill_id,
  proficiencyLevel: skill.proficiency_level,
  yearsExperience: String(skill.years_experience),
  isTeachable: skill.is_teachable,
});

const formatLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const Profile = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(emptyProfileForm);
  const [catalog, setCatalog] = useState<Skill[]>([]);
  const [studentSkills, setStudentSkills] = useState<StudentSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageMessage, setPageMessage] = useState<PageMessage | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [badges, setBadges] = useState<PassportAchievement[]>([]);

  // Modal state. Nothing below is shown on the page until a dialog opens.
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalError, setProfileModalError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<StudentSkill | null>(null);
  const [skillDraft, setSkillDraft] = useState<SkillDraft>(emptySkillDraft);
  const [skillModalError, setSkillModalError] = useState<string | null>(null);
  const [savingSkill, setSavingSkill] = useState(false);

  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const [slotDraft, setSlotDraft] = useState({ day: 1, start: '18:00', end: '20:00' });
  const [availabilityModalError, setAvailabilityModalError] = useState<string | null>(null);
  const [savingAvailability, setSavingAvailability] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    let isMounted = true;

    const loadStudentData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [loadedProfile, loadedCatalog, loadedStudentSkills, loadedAvailability] = await Promise.all([
          getStudentProfile(user.id),
          getSkillCatalog(),
          getStudentSkills(user.id),
          getMyAvailability(user.id),
        ]);

        if (!isMounted) {
          return;
        }

        setAvailability(loadedAvailability);
        setProfile(loadedProfile);
        setProfileForm(profileToForm(loadedProfile, user.user_metadata?.full_name ?? ''));
        setCatalog(loadedCatalog);
        setStudentSkills(loadedStudentSkills);
      } catch (loadError) {
        if (isMounted) {
          setError(getFriendlyStudentError(loadError, 'We could not load your student profile.'));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }

      // Badges are a highlight, not a prerequisite for the profile form, so
      // load them separately and never let a passport failure hide the page.
      try {
        const passport = await getSkillPassport();
        if (isMounted) {
          setBadges(passport.achievements.filter((achievement) => achievement.earned));
        }
      } catch {
        if (isMounted) {
          setBadges([]);
        }
      }
    };

    void loadStudentData();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const catalogById = useMemo(
    () => new Map(catalog.map((skill) => [skill.id, skill])),
    [catalog],
  );
  const existingSkillIds = useMemo(
    () => new Set(studentSkills.map((skill) => skill.skill_id)),
    [studentSkills],
  );
  const displayName = profile?.full_name?.trim() || user?.user_metadata?.full_name || 'Student';

  // ---------- personal details ----------

  const openProfileModal = () => {
    setProfileForm(profileToForm(profile, user?.user_metadata?.full_name ?? ''));
    setAvatarFile(null);
    setProfileModalError(null);
    setProfileModalOpen(true);
  };

  const handleProfileSubmit = async () => {
    setProfileModalError(null);

    const trimmedYearLevel = profileForm.yearLevel.trim();
    const yearLevel = trimmedYearLevel ? Number(trimmedYearLevel) : null;

    if (
      yearLevel !== null
      && (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 8)
    ) {
      setProfileModalError('Year level must be a whole number from 1 to 8.');
      return;
    }

    if (!user) {
      return;
    }

    setSavingProfile(true);

    try {
      const avatarUrl = avatarFile
        ? await uploadStudentAvatar(user.id, avatarFile)
        : profileForm.avatarUrl.trim() || null;
      const savedProfile = await saveStudentProfile(user.id, {
        full_name: profileForm.fullName.trim() || null,
        course: profileForm.course.trim() || null,
        year_level: yearLevel,
        bio: profileForm.bio.trim() || null,
        avatar_url: avatarUrl,
      });
      setProfile(savedProfile);
      setProfileForm(profileToForm(savedProfile, user.user_metadata?.full_name ?? ''));
      setAvatarFile(null);
      setProfileModalOpen(false);
      setPageMessage({ text: 'Profile saved successfully.', tone: 'success' });
    } catch (saveError) {
      setProfileModalError(
        getFriendlyStudentError(saveError, 'We could not save your profile.'),
      );
    } finally {
      setSavingProfile(false);
    }
  };

  // ---------- skills ----------

  const openAddSkillModal = () => {
    setEditingSkill(null);
    setSkillDraft(emptySkillDraft);
    setSkillModalError(null);
    setSkillModalOpen(true);
  };

  const openEditSkillModal = (skill: StudentSkill) => {
    setEditingSkill(skill);
    setSkillDraft(skillToDraft(skill));
    setSkillModalError(null);
    setSkillModalOpen(true);
  };

  const handleSkillSubmit = async () => {
    setSkillModalError(null);

    if (!user) {
      return;
    }

    const yearsExperience = Number(skillDraft.yearsExperience);
    if (!Number.isFinite(yearsExperience) || yearsExperience < 0 || yearsExperience > 999.9) {
      setSkillModalError('Years of experience must be between 0 and 999.9.');
      return;
    }

    setSavingSkill(true);

    try {
      if (editingSkill) {
        const updatedSkill = await updateStudentSkill(user.id, editingSkill.id, {
          proficiency_level: skillDraft.proficiencyLevel,
          years_experience: Number(yearsExperience.toFixed(1)),
          is_teachable: skillDraft.isTeachable,
        });
        setStudentSkills((current) =>
          current.map((currentSkill) => (currentSkill.id === editingSkill.id ? updatedSkill : currentSkill)),
        );
        setSkillModalOpen(false);
        setPageMessage({ text: 'Skill updated.', tone: 'success' });
      } else {
        if (!skillDraft.skillId) {
          setSkillModalError('Choose a skill from the catalog first.');
          setSavingSkill(false);
          return;
        }

        if (existingSkillIds.has(skillDraft.skillId)) {
          setSkillModalError('That skill is already in your profile.');
          setSavingSkill(false);
          return;
        }

        const addedSkill = await addStudentSkill(user.id, {
          skill_id: skillDraft.skillId,
          proficiency_level: skillDraft.proficiencyLevel,
          years_experience: Number(yearsExperience.toFixed(1)),
          is_teachable: skillDraft.isTeachable,
        });
        setStudentSkills((current) => [...current, addedSkill]);
        setSkillModalOpen(false);
        setPageMessage({ text: 'Skill added to your profile.', tone: 'success' });
      }
    } catch (skillError) {
      setSkillModalError(getFriendlyStudentError(skillError, 'We could not save that skill.'));
    } finally {
      setSavingSkill(false);
    }
  };

  const handleRemoveSkill = async (skill: StudentSkill) => {
    if (!user) {
      return;
    }

    setPageMessage(null);
    setSavingSkill(true);

    try {
      await removeStudentSkill(user.id, skill.id);
      setStudentSkills((current) => current.filter((currentSkill) => currentSkill.id !== skill.id));
      setPageMessage({ text: 'Skill removed from your profile.', tone: 'success' });
    } catch (skillError) {
      setPageMessage({
        text: getFriendlyStudentError(skillError, 'We could not remove that skill.'),
        tone: 'danger',
      });
    } finally {
      setSavingSkill(false);
    }
  };

  // ---------- availability ----------

  const openAvailabilityModal = () => {
    setSlotDraft({ day: 1, start: '18:00', end: '20:00' });
    setAvailabilityModalError(null);
    setAvailabilityModalOpen(true);
  };

  const handleAddAvailability = async () => {
    setAvailabilityModalError(null);

    if (slotDraft.start >= slotDraft.end) {
      setAvailabilityModalError('The end time must be later than the start time.');
      return;
    }

    setSavingAvailability(true);

    try {
      const next = [
        ...availability,
        { day_of_week: slotDraft.day, start_time: slotDraft.start, end_time: slotDraft.end },
      ];
      await setMyAvailability(next);
      setAvailability(next.slice().sort(
        (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
      ));
      setAvailabilityModalOpen(false);
      setPageMessage({ text: 'Availability added.', tone: 'success' });
    } catch (availabilityError) {
      setAvailabilityModalError(
        getFriendlyStudentError(availabilityError, 'We could not save your availability.'),
      );
    } finally {
      setSavingAvailability(false);
    }
  };

  const handleRemoveAvailability = async (slot: AvailabilitySlot) => {
    setPageMessage(null);
    setSavingAvailability(true);
    try {
      const next = availability.filter(
        (item) => !(item.day_of_week === slot.day_of_week
          && item.start_time === slot.start_time
          && item.end_time === slot.end_time),
      );
      await setMyAvailability(next);
      setAvailability(next.slice().sort(
        (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
      ));
      setPageMessage({ text: 'Availability removed.', tone: 'success' });
    } catch (availabilityError) {
      setPageMessage({
        text: getFriendlyStudentError(availabilityError, 'We could not save your availability.'),
        tone: 'danger',
      });
    } finally {
      setSavingAvailability(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  if (authLoading || loading || !user) {
    return (
      <IonPage className="profile-page">
        <IonHeader className="profile-page__header">
          <IonToolbar>
            <IonTitle>Profile</IonTitle>
            <IonButtons slot="end">
              <NotificationsButton />
              <IonButton fill="clear" routerLink="/tabs/settings" aria-label="Open settings">
                <IonIcon slot="icon-only" icon={settingsOutline} />
              </IonButton>
            </IonButtons>
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

  const editingSkillName = editingSkill
    ? catalogById.get(editingSkill.skill_id)?.name ?? 'Unavailable skill'
    : '';

  return (
    <IonPage className="profile-page">
      <IonHeader className="profile-page__header">
        <IonToolbar>
          <IonTitle>Profile</IonTitle>
          <IonButtons slot="end">
            <NotificationsButton />
            <IonButton fill="clear" routerLink="/tabs/settings" aria-label="Open settings">
              <IonIcon slot="icon-only" icon={settingsOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="student-page">
        <main className="student-page__content">
          <section className="student-page__hero">
            <p className="student-page__eyebrow">YOUR SKILL PASSPORT</p>
            <div className="student-page__identity">
              <div className="student-page__avatar" aria-hidden="true">
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="" />
                  : displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1>{displayName}</h1>
                <p>{user.email}</p>
                {badges.length > 0 && (
                  <ul className="profile-page__badges" aria-label="Earned badges">
                    {badges.map((badge) => (
                      <li
                        className="profile-page__badge"
                        key={badge.id}
                        title={badge.description ?? badge.name}
                      >
                        <span className="profile-page__badge-icon" aria-hidden="true">
                          {badge.icon ?? '🏅'}
                        </span>
                        <span className="profile-page__badge-label">{badge.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {error && (
            <div className="student-page__alert student-page__alert--error" role="alert">
              <IonText color="danger">{error}</IonText>
            </div>
          )}

          {pageMessage && (
            <div
              className={`student-page__alert student-page__alert--${pageMessage.tone}`}
              role="status"
            >
              <IonText color={pageMessage.tone}>{pageMessage.text}</IonText>
            </div>
          )}

          {!profile && !error && (
            <div className="student-page__empty">
              <IonText color="medium">Your profile has not been filled out yet. Start with the details below.</IonText>
            </div>
          )}

          <IonCard className="profile-page__details-card">
            <IonCardHeader>
              <div className="student-page__card-heading">
                <IonCardTitle>Personal details</IonCardTitle>
                <IonButton size="small" fill="outline" onClick={openProfileModal}>
                  <IonIcon slot="start" icon={createOutline} />
                  Edit
                </IonButton>
              </div>
            </IonCardHeader>
            <IonCardContent>
              <ul className="student-page__info-list">
                <li>
                  <span>Full name</span>
                  {profile?.full_name
                    ? <strong>{profile.full_name}</strong>
                    : <em>Not set</em>}
                </li>
                <li>
                  <span>Course</span>
                  {profile?.course ? <strong>{profile.course}</strong> : <em>Not set</em>}
                </li>
                <li>
                  <span>Year level</span>
                  {profile?.year_level
                    ? <strong>Year {profile.year_level}</strong>
                    : <em>Not set</em>}
                </li>
                <li>
                  <span>Bio</span>
                  {profile?.bio ? <strong>{profile.bio}</strong> : <em>Not set</em>}
                </li>
                <li>
                  <span>Photo</span>
                  {profile?.avatar_url
                    ? <img className="profile-page__photo-preview" src={profile.avatar_url} alt={`${displayName}'s profile`} />
                    : <em>Not set</em>}
                </li>
              </ul>
            </IonCardContent>
          </IonCard>

          <IonCard className="profile-page__skills-card">
            <IonCardHeader>
              <div className="student-page__card-heading">
                <div>
                  <IonCardTitle>My skills</IonCardTitle>
                  <p className="student-page__card-note">
                    Choose from the SkillForge catalog. You can teach a skill without changing the
                    catalog itself.
                  </p>
                </div>
                <IonButton size="small" onClick={openAddSkillModal}>
                  <IonIcon slot="start" icon={addOutline} />
                  Add skill
                </IonButton>
              </div>
            </IonCardHeader>
            <IonCardContent>
              {studentSkills.length === 0 ? (
                <div className="student-page__empty">
                  <IonText color="medium">
                    Your skills will appear here after you add them.
                  </IonText>
                  <IonButton fill="outline" onClick={openAddSkillModal}>
                    <IonIcon slot="start" icon={addOutline} />
                    Add your first skill
                  </IonButton>
                </div>
              ) : (
                <IonList className="student-page__skill-list">
                  {studentSkills.map((skill) => {
                    const catalogSkill = catalogById.get(skill.skill_id);
                    return (
                      <IonItem key={skill.id} lines="none" className="profile-page__skill-row">
                        <div className="student-page__skill-editor">
                          <IonLabel>
                            <h2>{catalogSkill?.name ?? 'Unavailable skill'}</h2>
                            <p>{catalogSkill?.category ?? 'Catalog entry unavailable'}</p>
                          </IonLabel>
                          <div className="profile-page__skill-meta">
                            <IonBadge color="primary">{formatLabel(skill.proficiency_level)}</IonBadge>
                            <span>{Number(skill.years_experience)} yr{Number(skill.years_experience) === 1 ? '' : 's'}</span>
                            {skill.is_teachable && <IonBadge color="tertiary">Can teach</IonBadge>}
                          </div>
                          <div className="student-page__inline-actions">
                            <IonButton size="small" fill="outline" onClick={() => openEditSkillModal(skill)}>
                              Edit
                            </IonButton>
                            <IonButton
                              size="small"
                              fill="clear"
                              color="danger"
                              onClick={() => void handleRemoveSkill(skill)}
                              disabled={savingSkill}
                            >
                              Remove
                            </IonButton>
                          </div>
                        </div>
                      </IonItem>
                    );
                  })}
                </IonList>
              )}
            </IonCardContent>
          </IonCard>

          <IonCard className="profile-page__availability-card">
            <IonCardHeader>
              <div className="student-page__card-heading">
                <div>
                  <IonCardTitle>Weekly availability</IonCardTitle>
                  <IonCardSubtitle>
                    When you are free to learn. Peers whose schedule overlaps yours are ranked
                    higher in Discover, and your exact times are never shown to them.
                  </IonCardSubtitle>
                </div>
                <IonButton size="small" onClick={openAvailabilityModal}>
                  <IonIcon slot="start" icon={addOutline} />
                  Add
                </IonButton>
              </div>
            </IonCardHeader>
            <IonCardContent>
              {availability.length === 0 ? (
                <p className="student-page__card-note">
                  No availability set yet. Add the times you are usually free to study.
                </p>
              ) : (
                <ul className="profile-page__availability-list">
                  {availability
                    .slice()
                    .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
                    .map((slot) => (
                      <li key={`${slot.day_of_week}-${slot.start_time}-${slot.end_time}`}>
                        <span>{dayNames[slot.day_of_week - 1]}</span>
                        <strong>{slot.start_time} – {slot.end_time}</strong>
                        <IonButton
                          size="small"
                          fill="clear"
                          color="danger"
                          onClick={() => void handleRemoveAvailability(slot)}
                          disabled={savingAvailability}
                        >
                          Remove
                        </IonButton>
                      </li>
                    ))}
                </ul>
              )}
            </IonCardContent>
          </IonCard>

          <IonButton expand="block" fill="outline" color="medium" onClick={() => void handleSignOut()} disabled={signingOut}>
            {signingOut ? <IonSpinner name="crescent" /> : 'Sign out'}
          </IonButton>
        </main>
      </IonContent>

      <FormModal
        isOpen={profileModalOpen}
        title="Personal details"
        subtitle="This is what other students see on your profile."
        onDismiss={() => setProfileModalOpen(false)}
        onSubmit={() => void handleProfileSubmit()}
        submitting={savingProfile}
        submitLabel="Save changes"
      >
        {profileModalError && <p className="app-modal__error" role="alert">{profileModalError}</p>}
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Full name</IonLabel>
          <IonInput
            value={profileForm.fullName}
            autocomplete="name"
            placeholder="Your full name"
            onIonInput={(event) => setProfileForm((current) => ({ ...current, fullName: event.detail.value ?? '' }))}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Course</IonLabel>
          <IonInput
            value={profileForm.course}
            placeholder="BSIT"
            onIonInput={(event) => setProfileForm((current) => ({ ...current, course: event.detail.value ?? '' }))}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Year level</IonLabel>
          <IonInput
            type="number"
            min="1"
            max="8"
            value={profileForm.yearLevel}
            placeholder="1 to 8"
            onIonInput={(event) => setProfileForm((current) => ({ ...current, yearLevel: event.detail.value ?? '' }))}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Bio</IonLabel>
          <IonTextarea
            rows={3}
            autoGrow
            value={profileForm.bio}
            placeholder="A short introduction"
            onIonInput={(event) => setProfileForm((current) => ({ ...current, bio: event.detail.value ?? '' }))}
          />
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Profile picture</IonLabel>
          <input
            ref={avatarInputRef}
            className="profile-page__file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose profile picture"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              setAvatarFile(file);
              if (file) setProfileModalError(null);
              event.currentTarget.value = '';
            }}
          />
          <IonButton
            type="button"
            fill="outline"
            slot="end"
            onClick={() => avatarInputRef.current?.click()}
          >
            {avatarFile ? 'Choose a different picture' : 'Choose picture'}
          </IonButton>
          <IonText color="medium">
            <p className="profile-page__upload-note">
              JPG, PNG, or WebP, up to 5 MB. Other students can see your photo.
              {avatarFile ? ` Selected: ${avatarFile.name}` : ''}
            </p>
          </IonText>
        </IonItem>
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Photo link</IonLabel>
          <IonInput
            type="url"
            inputmode="url"
            value={profileForm.avatarUrl}
            placeholder="https://"
            onIonInput={(event) => setProfileForm((current) => ({ ...current, avatarUrl: event.detail.value ?? '' }))}
          />
          <IonText color="medium">
            <p className="profile-page__upload-note">An uploaded picture takes priority over this link.</p>
          </IonText>
        </IonItem>
      </FormModal>

      <FormModal
        isOpen={skillModalOpen}
        title={editingSkill ? 'Edit skill' : 'Add a skill'}
        subtitle={editingSkill
          ? `Update how you list "${editingSkillName}".`
          : 'Pick a skill from the catalog and say how strong you are.'}
        onDismiss={() => setSkillModalOpen(false)}
        onSubmit={() => void handleSkillSubmit()}
        submitting={savingSkill}
        submitLabel={editingSkill ? 'Save changes' : 'Add skill'}
      >
        {skillModalError && <p className="app-modal__error" role="alert">{skillModalError}</p>}

        {editingSkill ? (
          <IonItem className="app-form-field">
            <IonLabel position="stacked">Skill</IonLabel>
            <IonInput readonly value={editingSkillName} />
          </IonItem>
        ) : (
          <IonItem className="app-form-field">
            <IonLabel position="stacked">Skill</IonLabel>
            <IonSelect
              value={skillDraft.skillId}
              placeholder="Select a catalog skill"
              onIonChange={(event) => setSkillDraft((current) => ({
                ...current,
                skillId: (event.detail.value as string) ?? '',
              }))}
            >
              {catalog.map((skill) => (
                <IonSelectOption
                  key={skill.id}
                  value={skill.id}
                  disabled={existingSkillIds.has(skill.id)}
                >
                  {skill.name} ({skill.category})
                </IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
        )}

        <IonItem className="app-form-field">
          <IonLabel position="stacked">Proficiency</IonLabel>
          <IonSelect
            value={skillDraft.proficiencyLevel}
            onIonChange={(event) => setSkillDraft((current) => ({
              ...current,
              proficiencyLevel: event.detail.value as ProficiencyLevel,
            }))}
          >
            {proficiencyLevels.map((level) => (
              <IonSelectOption key={level} value={level}>{formatLabel(level)}</IonSelectOption>
            ))}
          </IonSelect>
        </IonItem>

        <IonItem className="app-form-field">
          <IonLabel position="stacked">Years of experience</IonLabel>
          <IonInput
            type="number"
            min="0"
            max="999.9"
            step="0.1"
            value={skillDraft.yearsExperience}
            placeholder="0"
            onIonInput={(event) => setSkillDraft((current) => ({
              ...current,
              yearsExperience: event.detail.value ?? '',
            }))}
          />
        </IonItem>

        <IonItem className="app-form-field app-form-toggle">
          <IonLabel>I can teach this skill</IonLabel>
          <IonToggle
            slot="end"
            checked={skillDraft.isTeachable}
            onIonChange={(event) => setSkillDraft((current) => ({
              ...current,
              isTeachable: event.detail.checked,
            }))}
          />
        </IonItem>
      </FormModal>

      <FormModal
        isOpen={availabilityModalOpen}
        title="Add availability"
        subtitle="Add a window when you are usually free to study. Peers never see the exact times."
        onDismiss={() => setAvailabilityModalOpen(false)}
        onSubmit={() => void handleAddAvailability()}
        submitting={savingAvailability}
        submitLabel="Add availability"
      >
        {availabilityModalError && (
          <p className="app-modal__error" role="alert">{availabilityModalError}</p>
        )}
        <IonItem className="app-form-field">
          <IonLabel position="stacked">Day</IonLabel>
          <IonSelect
            value={slotDraft.day}
            onIonChange={(event) => setSlotDraft((current) => ({
              ...current,
              day: Number(event.detail.value),
            }))}
          >
            {dayNames.map((name, index) => (
              <IonSelectOption key={name} value={index + 1}>{name}</IonSelectOption>
            ))}
          </IonSelect>
        </IonItem>
        <div className="student-page__form-grid">
          <IonItem className="app-form-field">
            <IonLabel position="stacked">From</IonLabel>
            <IonInput
              type="time"
              value={slotDraft.start}
              onIonInput={(event) => setSlotDraft((current) => ({
                ...current,
                start: event.detail.value ?? '',
              }))}
            />
          </IonItem>
          <IonItem className="app-form-field">
            <IonLabel position="stacked">To</IonLabel>
            <IonInput
              type="time"
              value={slotDraft.end}
              onIonInput={(event) => setSlotDraft((current) => ({
                ...current,
                end: event.detail.value ?? '',
              }))}
            />
          </IonItem>
        </div>
      </FormModal>
    </IonPage>
  );
};

export default Profile;
