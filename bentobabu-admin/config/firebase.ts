/**
 * Centralized Firebase Client Modular SDK Initialization
 * Safe for Next.js SSR / hydration with runtime browser feature detection.
 */

import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getMessaging, isSupported, Messaging } from "firebase/messaging";

export interface FirebaseClientConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  messagingSenderId?: string;
  appId?: string;
  vapidKey?: string;
}

export const firebaseConfig: FirebaseClientConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "",
};

let appInstance: FirebaseApp | null = null;
let messagingInstance: Messaging | null = null;
let messagingSupported: boolean | null = null;

/**
 * Returns singleton FirebaseApp instance if credentials are provided
 */
export const getFirebaseClientApp = (): FirebaseApp | null => {
  if (typeof window === "undefined") {
    return null;
  }

  if (appInstance) {
    return appInstance;
  }

  // Check if configuration is provided
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    return null;
  }

  if (getApps().length > 0) {
    appInstance = getApp();
  } else {
    appInstance = initializeApp(firebaseConfig);
  }

  return appInstance;
};

/**
 * Check whether the current browser environment supports Push Messaging
 */
export const isPushMessagingSupported = async (): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return false;
  }

  if (messagingSupported !== null) {
    return messagingSupported;
  }

  try {
    messagingSupported = await isSupported();
    return messagingSupported;
  } catch (err) {
    console.warn("[Firebase] Messaging not supported in this browser:", err);
    messagingSupported = false;
    return false;
  }
};

/**
 * Returns singleton Messaging instance if supported and initialized
 */
export const getFirebaseMessagingClient = async (): Promise<Messaging | null> => {
  if (typeof window === "undefined") return null;

  if (messagingInstance) {
    return messagingInstance;
  }

  const supported = await isPushMessagingSupported();
  if (!supported) {
    return null;
  }

  const app = getFirebaseClientApp();
  if (!app) {
    return null;
  }

  try {
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch (err) {
    console.error("[Firebase] Error initializing Messaging:", err);
    return null;
  }
};
