importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyDIllocGZwxw4nmDF7DcHZC_3RyEc9nr2Y",
  authDomain: "mr-cod-online-ordering.firebaseapp.com",
  projectId: "mr-cod-online-ordering",
  storageBucket: "mr-cod-online-ordering.firebasestorage.app",
  messagingSenderId: "756041850780",
  appId: "1:756041850780:web:9c4271bb87cb64212e7259"
};

// Initialize Firebase automatically when SW starts (crucial for background push!)
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // If the payload has a notification object, Firebase usually handles it automatically.
  // But if it doesn't (or if we want custom vibrate/options), we manually show it here.
  const notificationTitle = payload.data?.title || payload.notification?.title || 'New Assignment';
  const notificationOptions = {
    body: payload.data?.body || payload.notification?.body || 'You have a new delivery assignment ready.',
    icon: '/mr-cod-logo.png',
    data: payload.data, // Keep data attached
    requireInteraction: true,
    vibrate: [500, 200, 500, 200, 500, 1000] // Hardware vibration pattern
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  console.log('[firebase-messaging-sw.js] Notification click received.', event);
  event.notification.close();
  
  const targetUrl = '/delivery';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes('/delivery') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
