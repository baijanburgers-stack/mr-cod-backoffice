import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function requestFCMPermissionsAndSync(userId: string) {
  try {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      if (Notification.permission === 'granted') {
         await syncToken(userId);
         return true;
      }

      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
         await syncToken(userId);
         return true;
      }
    }
    return false;
  } catch (error) {
    console.error('FCM Token generation failed:', error);
    return false;
  }
}

async function syncToken(userId: string) {
  try {
    // Rely on Next-PWA's active unified Service Worker containing the imported firebase listener
    // This stops the browser from constantly unregistering/dueling workers on mobile devices!
    const registration = await navigator.serviceWorker.ready;
    console.log('Using unified Service Worker for push notifications.');

    // In a real app we'd import { getMessaging, getToken } from 'firebase/messaging'
    // but the Firebase config gets messy combining compat SW and v10 modules.
    // For now we assume the front-end will just use getToken
    const { getMessaging, getToken } = await import('firebase/messaging');
    const { app } = await import('@/lib/firebase');
    const messaging = getMessaging(app);

    const currentToken = await getToken(messaging, { 
       vapidKey: process.env.NEXT_PUBLIC_VAPID_KEY,
       serviceWorkerRegistration: registration
    });

    if (currentToken) {
      // Sync the generated token securely to the user's Firestore Document
      await setDoc(doc(db, 'users', userId), { fcmToken: currentToken }, { merge: true });
      console.log('FCM Token successfully synced to user profile.');
    } else {
      console.log('No registration token available. Request permission to generate one.');
    }
  } catch (err) {
    console.log('An error occurred while retrieving token. ', err);
  }
}
