'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuthForm({ studio = false, onDone }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const res = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { role: 'photographer', full_name: name } } });
    setBusy(false);
    if (res.error) return setErr(res.error.message === 'Invalid login credentials' ? 'מייל או סיסמה שגויים' : res.error.message);
    if (!res.data.session) return setErr('נשלח אליך מייל אישור. אחרי האישור אפשר להתחבר.');
    onDone?.();
  }

  return (
    <form onSubmit={submit}>
      {mode === 'register' && (
        <div className="field"><label>שם הסטודיו / שם מלא</label>
          <input className="inp" value={name} onChange={(e) => setName(e.target.value)} required /></div>
      )}
      <div className="field"><label>מייל</label>
        <input className="inp" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div className="field"><label>סיסמה</label>
        <input className="inp" type="password" dir="ltr" minLength={mode === 'register' ? 8 : undefined}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
      {err && <div className="err">{err}</div>}
      <button className="btn pri" style={{ width: '100%' }} disabled={busy}>
        {busy ? 'רגע...' : mode === 'login' ? 'כניסה' : 'יצירת חשבון'}
      </button>
      {studio && (
        <p className="mute" style={{ textAlign: 'center' }}>
          <a href="#" onClick={(e) => { e.preventDefault(); setErr(''); setMode(mode === 'login' ? 'register' : 'login'); }}>
            {mode === 'login' ? 'צלמת חדשה? הרשמה' : 'כבר יש חשבון? כניסה'}
          </a>
        </p>
      )}
    </form>
  );
}
