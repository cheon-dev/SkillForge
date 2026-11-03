import {
  IonBadge,
  IonIcon,
  IonLabel,
  IonRouterOutlet,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/react';
import {
  bookOutline,
  chatbubblesOutline,
  compassOutline,
  homeOutline,
  personOutline,
  ribbonOutline,
} from 'ionicons/icons';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { getMyConversations } from '../services/student';
import { useAuth } from '../hooks/useAuth';
import './AppShell.css';

interface AppShellProps {
  children: ReactNode;
}

const AppShell = ({ children }: AppShellProps) => {
  const { user } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Polled rather than pushed so the badge is right the moment the tab is
  // opened, even if a message arrived while the user was on another tab.
  const loadUnread = useCallback(async () => {
    if (!user) return;
    try {
      const conversations = await getMyConversations();
      setUnreadMessages(conversations.reduce((total, c) => total + c.unread_count, 0));
    } catch {
      // a failed badge refresh should never break navigation
    }
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    void loadUnread();
    const interval = window.setInterval(() => void loadUnread(), 30_000);
    return () => window.clearInterval(interval);
  }, [user, loadUnread]);

  return (
    <IonTabs>
      <IonRouterOutlet>{children}</IonRouterOutlet>
      <IonTabBar slot="bottom" translucent={false}>
        <IonTabButton tab="home" href="/tabs/home">
          <IonIcon icon={homeOutline} />
          <IonLabel>Home</IonLabel>
        </IonTabButton>
        <IonTabButton tab="discover" href="/tabs/discover">
          <IonIcon icon={compassOutline} />
          <IonLabel>Discover</IonLabel>
        </IonTabButton>
        <IonTabButton tab="learning" href="/tabs/learning">
          <IonIcon icon={bookOutline} />
          <IonLabel>Learning</IonLabel>
        </IonTabButton>
        <IonTabButton tab="messages" href="/tabs/messages">
          <IonIcon icon={chatbubblesOutline} />
          <IonLabel>Messages</IonLabel>
          {unreadMessages > 0 && <IonBadge color="danger">{unreadMessages}</IonBadge>}
        </IonTabButton>
        <IonTabButton tab="skill-passport" href="/tabs/skill-passport">
          <IonIcon icon={ribbonOutline} />
          <IonLabel>Passport</IonLabel>
        </IonTabButton>
        <IonTabButton tab="profile" href="/tabs/profile">
          <IonIcon icon={personOutline} />
          <IonLabel>Profile</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  );
};

export default AppShell;