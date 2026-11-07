import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IonBadge,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { checkmarkDoneOutline, notificationsOffOutline } from 'ionicons/icons';
import { useAuth } from '../hooks/useAuth';
import { disableWebPush, enableWebPush, isWebPushConfigured } from '../services/webPush';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type StudentNotification,
} from '../services/notifications';
import './Notifications.css';

type NotificationFilter = 'all' | 'unread';

const formatNotificationDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

// Route notifications to the page where participants can act on them.
const notificationLink = (type: string): string => {
  if (type.startsWith('project_')) return '/tabs/collaboration';
  if (type.startsWith('duel_')) return '/tabs/arena';
  if (type === 'new_message') return '/tabs/messages';
  if (type.startsWith('challenge_')) return '/tabs/challenges';
  if (type === 'achievement_unlocked') return '/tabs/skill-passport';
  return '/tabs/learning';
};

const Notifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<StudentNotification[]>([]);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushWorking, setPushWorking] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setPushEnabled(window.localStorage.getItem(`skillforge.push.enabled.${user.id}`) === 'true');
  }, [user]);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      setNotifications(await getNotifications(user.id));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadNotifications();
    const intervalId = window.setInterval(() => void loadNotifications(), 30_000);
    return () => window.clearInterval(intervalId);
  }, [loadNotifications]);

  const visibleNotifications = useMemo(() => notifications.filter((notification) =>
    filter === 'all' || notification.read_at === null,
  ), [filter, notifications]);
  const unreadCount = notifications.filter((notification) => notification.read_at === null).length;

  const handleOpenNotification = async (notification: StudentNotification) => {
    if (!user || notification.read_at) return;
    setNotifications((current) => current.map((item) => item.id === notification.id
      ? { ...item, read_at: new Date().toISOString() }
      : item));
    try {
      await markNotificationRead(user.id, notification.id);
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : 'Could not mark this notification as read.');
      await loadNotifications();
    }
  };

  const handleMarkAllRead = async () => {
    if (!user || unreadCount === 0) return;
    setSaving(true);
    setError(null);
    try {
      await markAllNotificationsRead(user.id);
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => item.read_at ? item : { ...item, read_at: readAt }));
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : 'Could not mark notifications as read.');
    } finally {
      setSaving(false);
    }
  };

  const handlePushToggle = async () => {
    if (!user) return;
    setPushWorking(true);
    setPushError(null);
    setPushMessage(null);
    try {
      if (pushEnabled) {
        await disableWebPush();
        window.localStorage.removeItem(`skillforge.push.enabled.${user.id}`);
        setPushEnabled(false);
        setPushMessage('Browser push notifications are disabled.');
      } else {
        await enableWebPush();
        window.localStorage.setItem(`skillforge.push.enabled.${user.id}`, 'true');
        setPushEnabled(true);
        setPushMessage('Browser push notifications are enabled on this device.');
      }
    } catch (pushActionError) {
      setPushError(pushActionError instanceof Error ? pushActionError.message : 'Push notification settings could not be changed.');
    } finally {
      setPushWorking(false);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Notifications</IonTitle>
          <IonButton
            slot="end"
            fill="clear"
            onClick={() => void handleMarkAllRead()}
            disabled={saving || unreadCount === 0}
          >
            {saving ? <IonSpinner name="crescent" /> : <IonIcon slot="start" icon={checkmarkDoneOutline} />}
            Read all
          </IonButton>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="notifications-page">
        <main className="notifications-page__content">
          <section className="notifications-page__intro">
            <p className="notifications-page__eyebrow">UPDATES FOR YOU</p>
            <h1>Stay in the loop</h1>
            <p>Session, challenge, message, and collaboration updates will appear here.</p>
            <IonButton
              fill="outline"
              onClick={() => void handlePushToggle()}
              disabled={pushWorking || !isWebPushConfigured()}
            >
              {pushWorking ? <IonSpinner name="crescent" /> : pushEnabled ? 'Disable browser push' : 'Enable browser push'}
            </IonButton>
            {!isWebPushConfigured() && (
              <p className="notifications-page__date">
                Browser push is not configured for this deployment. In-app notifications remain available.
              </p>
            )}
            {pushMessage && <p role="status">{pushMessage}</p>}
            {pushError && <p className="notifications-page__error" role="alert">{pushError}</p>}
          </section>

          <IonSegment
            value={filter}
            onIonChange={(event) => setFilter((event.detail.value as NotificationFilter) ?? 'all')}
            aria-label="Filter notifications"
          >
            <IonSegmentButton value="all"><IonLabel>All</IonLabel></IonSegmentButton>
            <IonSegmentButton value="unread"><IonLabel>Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}</IonLabel></IonSegmentButton>
          </IonSegment>

          {error && <p className="notifications-page__error" role="alert">{error}</p>}
          {loading ? (
            <div className="notifications-page__state"><IonSpinner name="crescent" /><IonText color="medium">Loading notifications…</IonText></div>
          ) : visibleNotifications.length === 0 ? (
            <div className="notifications-page__empty">
              <IonIcon icon={notificationsOffOutline} aria-hidden="true" />
              <h2>{filter === 'unread' ? 'You are all caught up' : 'No notifications yet'}</h2>
              <p>{filter === 'unread' ? 'New updates will show here when they arrive.' : 'Learning requests and review results will show here.'}</p>
            </div>
          ) : (
            <IonList className="notifications-page__list" inset>
              {visibleNotifications.map((notification) => (
                <IonItem
                  key={notification.id}
                  button
                  detail
                  routerLink={notificationLink(notification.notification_type)}
                  onClick={() => void handleOpenNotification(notification)}
                  className={notification.read_at ? 'notifications-page__item' : 'notifications-page__item notifications-page__item--unread'}
                >
                  <span className="notifications-page__indicator" slot="start" aria-hidden="true" />
                  <IonLabel>
                    <h2>{notification.title}</h2>
                    <p>{notification.body}</p>
                    <p className="notifications-page__date">{formatNotificationDate(notification.created_at)}</p>
                  </IonLabel>
                  {!notification.read_at && <IonBadge color="primary">New</IonBadge>}
                </IonItem>
              ))}
            </IonList>
          )}
        </main>
      </IonContent>
    </IonPage>
  );
};

export default Notifications;
