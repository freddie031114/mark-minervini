import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

const KEY = 'firebaseConfig';
const REQUIRED = ['apiKey', 'authDomain', 'projectId', 'appId'] as const;

/** Config baked in at build time (used for tests / emulator), else the one pasted on first launch. */
export function storedConfig(): FirebaseOptions | null {
  const baked = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined;
  if (baked) return JSON.parse(baked);
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveConfig(cfg: FirebaseOptions) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}

export function clearConfig() {
  localStorage.removeItem(KEY);
}

/**
 * Accepts what the Firebase console shows ("const firebaseConfig = { apiKey: "...", ... };"),
 * plain JSON, or the bare object. Returns the config or an error message.
 */
export function parseConfig(text: string): FirebaseOptions | string {
  const out: Record<string, string> = {};
  const re = /["']?(apiKey|authDomain|projectId|storageBucket|messagingSenderId|appId|measurementId)["']?\s*:\s*["']([^"']+)["']/g;
  for (const m of text.matchAll(re)) out[m[1]] = m[2];
  const missing = REQUIRED.filter((k) => !out[k]);
  if (missing.length) return `Couldn't find ${missing.join(', ')} in what you pasted. Copy the whole firebaseConfig block.`;
  return out as FirebaseOptions;
}

let app: FirebaseApp | null = null;
let auth: Auth;
let db: Firestore;

export function connect(cfg: FirebaseOptions) {
  if (app) return { auth, db };
  app = initializeApp(cfg);
  auth = getAuth(app);
  db = initializeFirestore(app, {
    // Offline-first: changes are saved locally and synced when online.
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });
  const emu = import.meta.env.VITE_FIREBASE_EMULATOR as string | undefined;
  if (emu) {
    connectAuthEmulator(auth, `http://${emu}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, emu, 8080);
  }
  return { auth, db };
}

export const fb = () => ({ auth, db });
