import { useCallback, useEffect, useState } from 'react';
import { IonBadge, IonButton, IonIcon } from '@ionic/react';
import { notificationsOutline } from 'ionicons/icons';
import { useAuth } from '../hooks/useAuth';
import { getUnreadNotificationCount } from '../services/notifications';
import './NotificationsButton.css';

const NotificationsButton = () => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    try {
      setUnreadCount(await getUnreadNotificationCount(user.id));
    } catch {
      // The page displays database errors; keep the toolbar usable if counts fail.
    }
  }, [user]);

  useEffect(() => {
    void refreshCount();
    const intervalId = window.setInterval(() => void refreshCount(), 30_000);
    window.addEventListener('focus', refreshCount);
    window.addEventListener('notifications:updated', refreshCount);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshCount);
      window.removeEventListener('notifications:updated', refreshCount);
    };
  }, [refreshCount]);

  return (
    <IonButton
      className="notifications-button"
      fill="clear"
      routerLink="/tabs/notifications"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
    >
      <IonIcon slot="icon-only" icon={notificationsOutline} />
      {unreadCount > 0 && (
        <IonBadge className="notifications-button__badge" color="danger">
          {unreadCount > 99 ? '99+' : unreadCount}
        </IonBadge>
      )}
    </IonButton>
  );
};

export default NotificationsButton;
