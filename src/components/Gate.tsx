import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  type User,
} from 'firebase/auth';
import { clearConfig, connect, parseConfig, saveConfig, storedConfig } from '../lib/firebase';

/** Shows setup → sign-in → the app, depending on state. */
export function Gate({ children }: { children: (user: User) => ReactNode }) {
  const [cfg, setCfg] = useState(storedConfig);
  if (!cfg) return <Setup onDone={setCfg} />;
  return <AuthGate>{children}</AuthGate>;
}

function AuthGate({ children }: { children: (user: User) => ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    const { auth } = connect(storedConfig()!);
    return onAuthStateChanged(auth, setUser);
  }, []);
  if (user === undefined) return <Center><span className="text-sm text-zinc-500">Loading…</span></Center>;
  if (!user) return <SignIn />;
  return <>{children(user)}</>;
}

const Center = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-screen items-center justify-center p-6">{children}</div>
);

function Setup({ onDone }: { onDone: (c: ReturnType<typeof storedConfig>) => void }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Center>
      <form
        className="card w-full max-w-lg space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const c = parseConfig(text);
          if (typeof c === 'string') return setErr(c);
          saveConfig(c);
          onDone(c);
        }}
      >
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Connect to your Firebase project</h1>
          <p className="mt-1 text-sm text-zinc-400">
            One-time setup on this computer. In the Firebase console open <b>Project settings → General → Your apps</b>, and
            copy the whole <code className="text-zinc-300">firebaseConfig</code> block. Paste it here.
          </p>
        </div>
        <textarea
          autoFocus
          rows={9}
          className="w-full font-mono text-xs"
          placeholder={'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "…",\n  projectId: "…",\n  …\n};'}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setErr(null);
          }}
        />
        {err && <div className="err">{err}</div>}
        <button className="btn btn-primary w-full justify-center" type="submit">
          Continue
        </button>
      </form>
    </Center>
  );
}

function SignIn() {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { auth } = connect(storedConfig()!);
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'in') await signInWithEmailAndPassword(auth, email.trim(), password);
      else if (mode === 'up') await createUserWithEmailAndPassword(auth, email.trim(), password);
      else {
        await sendPasswordResetEmail(auth, email.trim());
        setMsg({ ok: true, text: 'Check your email for a link to reset your password.' });
        setMode('in');
      }
    } catch (err) {
      setMsg({ ok: false, text: friendly(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Center>
      <form className="card w-full max-w-sm space-y-4 p-6" onSubmit={submit}>
        <h1 className="text-lg font-semibold text-zinc-100">
          {mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create your account' : 'Reset password'}
        </h1>
        <div>
          <div className="label">Email</div>
          <input autoFocus type="email" autoComplete="email" className="w-full" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {mode !== 'reset' && (
          <div>
            <div className="label">Password{mode === 'up' && ' (at least 6 characters)'}</div>
            <input
              type="password"
              autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              className="w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        )}
        {msg && <div className={`text-sm ${msg.ok ? 'text-emerald-300' : 'text-red-400'}`}>{msg.text}</div>}
        <button className="btn btn-primary w-full justify-center" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset email'}
        </button>
        <div className="flex justify-between text-xs">
          {mode === 'in' ? (
            <>
              <button type="button" className="text-sky-400 hover:underline" onClick={() => setMode('up')}>
                First time? Create account
              </button>
              <button type="button" className="text-zinc-400 hover:underline" onClick={() => setMode('reset')}>
                Forgot password?
              </button>
            </>
          ) : (
            <button type="button" className="text-sky-400 hover:underline" onClick={() => setMode('in')}>
              ← Back to sign in
            </button>
          )}
        </div>
        {!import.meta.env.VITE_FIREBASE_CONFIG && (
          <button
            type="button"
            className="block w-full text-center text-[11px] text-zinc-600 hover:text-zinc-400"
            onClick={() => {
              if (!confirm('Disconnect from this Firebase project and paste a different config?')) return;
              clearConfig();
              location.reload();
            }}
          >
            Use a different Firebase project
          </button>
        )}
      </form>
    </Center>
  );
}

function friendly(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'No account with that email. Create one first.',
    'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
    'auth/weak-password': 'Password needs at least 6 characters.',
    'auth/invalid-email': "That doesn't look like an email address.",
    'auth/network-request-failed': "Can't reach Firebase. Check your internet connection.",
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/operation-not-allowed': 'Email/password sign-in is not turned on in your Firebase project (Authentication → Sign-in method).',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'The Firebase config is wrong. Use "Change Firebase project" and paste it again.',
  };
  return map[code] ?? (err instanceof Error ? err.message : String(err));
}
