importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const configValue = new URL(self.location.href).searchParams.get('config');
if (!configValue) {
  throw new Error('Firebase web-push configuration is missing.');
}

firebase.initializeApp(JSON.parse(configValue));
firebase.messaging();
