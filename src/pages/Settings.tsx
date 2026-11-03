import {
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonPage,
  IonTitle,
  IonToggle,
  IonToolbar,
  IonButton,
} from '@ionic/react';
import { useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import NotificationsButton from '../components/NotificationsButton';
import { useAuth } from '../hooks/useAuth';
import { getStudentProfile } from '../services/student';
import './Settings.css';

const Settings = () => {
  const { user } = useAuth();
  const [isModerator, setIsModerator] = useState(false);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const check = async () => {
      try {
        const profile = await getStudentProfile(user.id);
        if (mounted) setIsModerator(profile?.role === 'admin' || profile?.role === 'moderator');
      } catch {
        if (mounted) setIsModerator(false);
      }
    };
    void check();
    return () => { mounted = false; };
  }, [user]);
  const { mode, setMode } = useTheme();

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Settings</IonTitle>
          <IonButtons slot="end"><NotificationsButton /></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="settings-page">
        <main className="settings-page__content">
          <section className="settings-page__intro">
            <p className="student-page__eyebrow">MAKE IT YOURS</p>
            <h1>Settings</h1>
            <p>Choose the look that feels comfortable for you.</p>
          </section>

          <IonCard>
            <IonCardHeader>
              <IonCardTitle>Appearance</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <IonItem lines="none" className="settings-page__theme-control">
                <IonLabel>
                  <h2>Dark mode</h2>
                  <p>{mode === 'dark' ? 'Dark appearance is on' : 'Light appearance is on'}</p>
                </IonLabel>
                <IonToggle
                  slot="end"
                  aria-label="Dark mode"
                  checked={mode === 'dark'}
                  onIonChange={(event) => setMode(event.detail.checked ? 'dark' : 'light')}
                />
              </IonItem>
            </IonCardContent>
          </IonCard>

          {isModerator && (
            <IonCard>
              <IonCardHeader>
                <IonCardTitle>Administration</IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                <IonItem lines="none">
                  <IonLabel>
                    <h2>Admin dashboard</h2>
                    <p>Students, skill catalog, challenges, achievements and platform statistics</p>
                  </IonLabel>
                  <IonButton slot="end" fill="outline" routerLink="/tabs/admin">
                    Open
                  </IonButton>
                </IonItem>
              </IonCardContent>
            </IonCard>
          )}
        </main>
      </IonContent>
    </IonPage>
  );
};

export default Settings;
