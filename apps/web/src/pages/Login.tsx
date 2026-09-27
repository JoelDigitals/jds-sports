import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth.tsx';
import { btnPrimary, ErrorBox, Field, inputClass } from '../components/ui.tsx';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [club, setClub] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({ email, password, firstName, lastName, club });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-600 text-lg font-black text-white">JDS</div>
          <div>
            <div className="text-lg font-bold text-white">JDS Sports</div>
            <div className="text-xs text-slate-400">Spesenabrechnung für Schiedsrichter · HV Saar</div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-xl">
          <div className="mb-4 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
            <button
              className={`rounded-md px-3 py-1.5 ${mode === 'login' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
              onClick={() => setMode('login')}
              type="button"
            >
              Anmelden
            </button>
            <button
              className={`rounded-md px-3 py-1.5 ${mode === 'register' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
              onClick={() => setMode('register')}
              type="button"
            >
              Registrieren
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vorname">
                  <input className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </Field>
                <Field label="Nachname">
                  <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </Field>
                <div className="col-span-2">
                  <Field label="Verein (optional)">
                    <input className={inputClass} value={club} onChange={(e) => setClub(e.target.value)} />
                  </Field>
                </div>
              </div>
            )}
            <Field label="E-Mail">
              <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Field>
            <Field label="Passwort" hint={mode === 'register' ? 'Mindestens 8 Zeichen' : undefined}>
              <input
                type="password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </Field>
            {error && <ErrorBox message={error} />}
            <button type="submit" className={`${btnPrimary} w-full`} disabled={busy}>
              {busy ? 'Bitte warten …' : mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
            </button>
          </form>

          <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
            Demo-Zugang: <span className="font-mono">demo@jds-sports.de</span> / <span className="font-mono">demo1234</span>
          </div>
        </div>
      </div>
    </div>
  );
}
