// Firebase bootstrap: App, App Check, Auth (anonymous) and Firestore (offline persistence).
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

export const app = initializeApp(firebaseConfig);

// ---------------------------------------------------------------------------
// App Check
// ---------------------------------------------------------------------------
// Debug-token support (required by the hackathon rules for evaluation):
//  - `npm run dev`: the SDK prints a debug token in the console (FIREBASE_APPCHECK_DEBUG_TOKEN = true).
//    Register it under Firebase console > App Check > Apps > Manage debug tokens.
//  - Judging build: set VITE_APPCHECK_DEBUG_TOKEN to a pre-registered token.
// Must be assigned BEFORE initializeAppCheck().
export type AppCheckMode = 'debug' | 'recaptcha-enterprise' | 'off';
export let appCheckMode: AppCheckMode = 'off';

const debugToken = (env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined)?.trim();
const siteKey = (env.VITE_APPCHECK_SITE_KEY as string | undefined)?.trim();
const useDebug = Boolean(debugToken) || env.DEV;

if (isConfigured && (siteKey || useDebug)) {
  if (useDebug) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      debugToken || true;
  }
  initializeAppCheck(app, {
    // With a debug token the provider is bypassed by the SDK; a placeholder key is enough.
    provider: new ReCaptchaEnterpriseProvider(siteKey || 'debug-placeholder-key'),
    isTokenAutoRefreshEnabled: true,
  });
  appCheckMode = useDebug ? 'debug' : 'recaptcha-enterprise';
} else {
  console.warn('[App Check] Disabled: set VITE_APPCHECK_SITE_KEY or use a debug token.');
}

// ---------------------------------------------------------------------------
// Firestore with offline persistence (IndexedDB) => offline-first
// ---------------------------------------------------------------------------
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// ---------------------------------------------------------------------------
// Auth (anonymous: frictionless for judges, per-user Firestore rules still apply)
// ---------------------------------------------------------------------------
export const auth = getAuth(app);

/** Resolves with the uid, or null if sign-in is impossible (e.g. first load while offline). */
export async function ensureUser(): Promise<string | null> {
  if (!isConfigured) return null;
  const existing = await new Promise<string | null>((resolve) => {
    const off = onAuthStateChanged(auth, (u) => {
      off();
      resolve(u?.uid ?? null);
    });
  });
  if (existing) return existing;
  try {
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  } catch (err) {
    console.warn('[Auth] Anonymous sign-in failed', err);
    return null;
  }
}
