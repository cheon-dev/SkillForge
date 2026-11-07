import { getSupabaseClient } from './supabase';

interface FirebaseCompatApp {
  name: string;
  options: { projectId?: string };
}

interface FirebaseCompatMessaging {
  getToken(options: { vapidKey: string; serviceWorkerRegistration: ServiceWorkerRegistration }): Promise<string>;
  deleteToken(): Promise<boolean>;
}

interface FirebaseMessagingFactory {
  (app?: FirebaseCompatApp): FirebaseCompatMessaging;
  isSupported(): Promise<boolean>;
}

interface FirebaseCompatNamespace {
  apps: FirebaseCompatApp[];
  initializeApp(config: typeof firebaseConfig, name?: string): FirebaseCompatApp;
  messaging: FirebaseMessagingFactory;
}

declare global {
  interface Window {
    firebase?: FirebaseCompatNamespace;
  }
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export const isWebPushConfigured = (): boolean =>
  Object.values(firebaseConfig).every((value) => Boolean(value?.trim())) && Boolean(vapidKey?.trim());

let firebaseCompatPromise: Promise<FirebaseCompatNamespace> | null = null;

const loadFirebaseCompat = (): Promise<FirebaseCompatNamespace> => {
  if (!firebaseCompatPromise) {
    firebaseCompatPromise = (async () => {
      const scripts = [
        'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js',
      ];

      for (const src of scripts) {
        if (src.endsWith('firebase-app-compat.js') && window.firebase) continue;
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = src;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Firebase web-push SDK could not be loaded.'));
          document.head.append(script);
        });
      }

      if (!window.firebase?.messaging) {
        throw new Error('Firebase web-push SDK did not initialize.');
      }
      return window.firebase;
    })().catch((error: unknown) => {
      firebaseCompatPromise = null;
      throw error;
    });
  }
  return firebaseCompatPromise;
};

const getMessagingSetup = async () => {
  if (!isWebPushConfigured() || !vapidKey?.trim()) {
    throw new Error('Browser push is not configured. Add the Firebase web app settings and VAPID key to the deployment environment.');
  }
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('This browser does not support Firebase web push notifications.');
  }

  const firebase = await loadFirebaseCompat();
  if (!(await firebase.messaging.isSupported())) {
    throw new Error('This browser does not support Firebase web push notifications.');
  }

  const serviceWorkerUrl = new URL('/firebase-messaging-sw.js', window.location.origin);
  serviceWorkerUrl.searchParams.set('config', JSON.stringify(firebaseConfig));
  const registration = await navigator.serviceWorker.register(serviceWorkerUrl.toString(), { scope: '/' });
  const app = firebase.apps.find((item) => item.name === 'skillforge-web-push')
    ?? firebase.initializeApp(firebaseConfig, 'skillforge-web-push');
  return {
    messaging: firebase.messaging(app),
    registration,
    vapidKey,
  };
};

export const enableWebPush = async (): Promise<void> => {
  const { messaging, registration, vapidKey } = await getMessagingSetup();
  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Notifications are blocked in this browser. Allow them in browser settings and try again.'
      : 'Notification permission was not granted.');
  }

  const token = await messaging.getToken({ vapidKey, serviceWorkerRegistration: registration });
  if (!token) {
    throw new Error('Firebase did not return a browser push token. Check the Firebase web-push configuration.');
  }

  const { error } = await getSupabaseClient().rpc('register_push_token', { p_token: token });
  if (error) throw error;
};

export const disableWebPush = async (): Promise<void> => {
  const { messaging, registration, vapidKey } = await getMessagingSetup();
  const token = await messaging.getToken({ vapidKey, serviceWorkerRegistration: registration });
  if (token) {
    const { error } = await getSupabaseClient().rpc('unregister_push_token', { p_token: token });
    if (error) throw error;
    await messaging.deleteToken();
  }
};
