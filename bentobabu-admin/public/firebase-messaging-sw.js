/**
 * BentoBabu Firebase Messaging Service Worker
 * Production-ready Web Push Notification handler for Admin & Kitchen staff.
 */

/* eslint-disable no-undef */
try {
  importScripts('https://www.gstatic.com/firebasejs/13.4.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/13.4.0/firebase-messaging-compat.js');
} catch (importErr) {
  console.error('[SW] Failed to import Firebase scripts:', importErr);
}

// Parse configuration from service worker registration URL query parameters
const urlParams = new URLSearchParams(self.location.search);

const firebaseConfig = {
  apiKey: urlParams.get('apiKey') || '',
  authDomain: urlParams.get('authDomain') || '',
  projectId: urlParams.get('projectId') || '',
  messagingSenderId: urlParams.get('messagingSenderId') || '',
  appId: urlParams.get('appId') || '',
};

let messaging = null;

// Only initialize if all critical credentials are provided
if (
  typeof firebase !== 'undefined' &&
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId
) {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    messaging = firebase.messaging();

    // Register Firebase background notification handler
    messaging.onBackgroundMessage((payload) => {
      console.log('[SW] Firebase onBackgroundMessage received:', payload);

      const title =
        payload.notification?.title ||
        payload.data?.title ||
        'BentoBabu — New Order Received!';

      const body =
        payload.notification?.body ||
        payload.data?.body ||
        'A new customer order has been placed.';

      const notificationOptions = {
        body,
        icon: '/bentobabu_logo.png',
        badge: '/bentobabu_logo.png',
        tag: payload.data?.orderId ? `order_${payload.data.orderId}` : 'bentobabu_order_alert',
        renotify: true,
        requireInteraction: true,
        vibrate: [200, 100, 200],
        data: {
          clickAction: payload.data?.clickAction || '/orders',
          orderId: payload.data?.orderId || '',
          orderNumber: payload.data?.orderNumber || '',
          timestamp: Date.now(),
        },
      };

      return self.registration.showNotification(title, notificationOptions);
    });
    console.log('[SW] Firebase Messaging initialized successfully.');
  } catch (initErr) {
    console.error('[SW] Error during Firebase initialization:', initErr);
  }
} else {
  console.log('[SW] Firebase config parameters not provided in query. SW loaded in standby mode.');
}

// Handle notification click: Focus existing dashboard window or open order details
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetPath = data.clickAction || '/orders';

  // Security: Guarantee path starts with '/' and does not navigate off-origin
  if (!targetPath.startsWith('/')) {
    targetPath = '/orders';
  }

  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Find an open dashboard window on our origin
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // If no window is currently open, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Service worker activation: Claim clients immediately for seamless PWA support
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
