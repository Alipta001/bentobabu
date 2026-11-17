/**
 * BentoBabu Firebase Messaging Service Worker
 * Handles background push notifications, sound, vibration, and navigation.
 */

/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

// Parse configuration from service worker registration URL query parameters if present
const urlParams = new URLSearchParams(self.location.search);

let firebaseConfig = {
  apiKey: urlParams.get('apiKey') || '',
  authDomain: urlParams.get('authDomain') || '',
  projectId: urlParams.get('projectId') || '',
  messagingSenderId: urlParams.get('messagingSenderId') || '',
  appId: urlParams.get('appId') || '',
};

let messaging = null;

function initFirebaseMessaging(config) {
  if (!config.apiKey || !config.projectId) {
    return false;
  }
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(config);
    }
    messaging = firebase.messaging();

    // Background push notification handler
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

    return true;
  } catch (err) {
    console.error('[SW] Firebase messaging SW initialization error:', err);
    return false;
  }
}

// Initial attempt using URL query parameters
initFirebaseMessaging(firebaseConfig);

// Listen for runtime config injection from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_FIREBASE_CONFIG') {
    firebaseConfig = { ...firebaseConfig, ...event.data.config };
    initFirebaseMessaging(firebaseConfig);
  }
});

// Fallback raw Web Push event listener in case Firebase compat is delayed
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const rawData = event.data.json();
    console.log('[SW] Push event received:', rawData);

    // If Firebase Messaging already handles this, let onBackgroundMessage process it
    if (messaging) {
      return;
    }

    const title =
      rawData.notification?.title ||
      rawData.data?.title ||
      'BentoBabu — New Order Received!';

    const body =
      rawData.notification?.body ||
      rawData.data?.body ||
      'A new customer order has been placed.';

    const options = {
      body,
      icon: '/bentobabu_logo.png',
      badge: '/bentobabu_logo.png',
      tag: rawData.data?.orderId ? `order_${rawData.data.orderId}` : 'bentobabu_order_alert',
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: {
        clickAction: rawData.data?.clickAction || '/orders',
        orderId: rawData.data?.orderId || '',
        orderNumber: rawData.data?.orderNumber || '',
        timestamp: Date.now(),
      },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (parseErr) {
    console.warn('[SW] Could not parse push payload as JSON:', parseErr);
  }
});

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
