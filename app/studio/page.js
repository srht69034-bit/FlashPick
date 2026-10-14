'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, authedFetch } from '@/lib/supabase';
import { useUser } from '@/lib/useUser';

const EMPTY = { title: '', clientName: '', clientEmail: '', quota: 30, password: '', sendEmail: false };

export default function Dashboard() {
  const router = useRouter();
  const user = useUser();
  const [list, setList] = useState(null);
  const [stats, setStats] = useState({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [created, setCreated] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const load = useCallback(async () => {
    const { data } = await supabase.from('galleries').select('*').order('created_at', { ascending: false });
    const { data: st } = await supabase.from('gallery_stats').select('*');
    setList(data || []);
    setStats(Object.fromEntries((st || []).map((s) => [s.gallery_id, s])));
  }, []);

  useEffect(() => {
    if (user === null) router.replace('/studio/login');
    if (user) load();
  }, [user?.id]); // eslint-disable-line

  async function create(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await authedFetch('/api/galleries', form);
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error || 'שגיאה ביצירת הגלריה');
    setCreated(j); setOpen(false); setForm(EMPTY); load();
  }

  if (!user || !list) return <main className="page"><div className="wrap mute">טוען…</div></main>;

  return (
    <main className="page"><div className="wrap">
      <div className="top">
        <h1>הגלריות שלי</h1>
        <div className="row">
          <button className="btn pri" onClick={() => { setOpen(!open); setCreated(null); }}>גלריה חדשה</button>
          <button className="btn" onClick={() => supabase.auth.signOut().then(() => router.replace('/studio/login'))}>יציאה</button>
        </div>
      </div>

      {created && (
        <div className="card" style={{ marginBottom: 16 }}>
          <b>הגלריה נוצרה. שמרי את הפרטים, הסיסמה מוצגת רק עכשיו.</b>
          <div className="secret">{created.link}<br />{created.email}<br />{created.password}</div>
          <div className="row">
            <button className="btn" onClick={() => navigator.clipboard.writeText(`קישור: ${created.link}\nמייל: ${created.email}\nסיסמה: ${created.password}`)}>העתקת הפרטים</button>
            <Link className="btn pri" href={`/studio/${created.id}`}>להעלאת תמונות</Link>
            {created.mail === 'sent' && <span className="mute">נשלח גם מייל ללקוחה</span>}
            {created.mail === 'failed' && <span className="err">שליחת המייל נכשלה, שלחי ידנית</span>}
          </div>
        </div>
      )}

      {open && (
        <form className="card" style={{ marginBottom: 16 }} onSubmit={create}>
          <div className="grid2">
            <div className="field"><label>שם הגלריה</label><input className="inp" value={form.title} onChange={set('title')} required /></div>
            <div className="field"><label>שם הלקוחה</label><input className="inp" value={form.clientName} onChange={set('clientName')} /></div>
            <div className="field"><label>מייל הלקוחה</label><input className="inp" type="email" dir="ltr" value={form.clientEmail} onChange={set('clientEmail')} required /></div>
            <div className="field"><label>מכסת תמונות</label><input className="inp" type="number" min="1" value={form.quota} onChange={set('quota')} required /></div>
            <div className="field"><label>סיסמה (ריק = אקראית)</label><input className="inp" dir="ltr" value={form.password} onChange={set('password')} /></div>
          </div>
          <label className="row" style={{ marginBottom: 12 }}><input type="checkbox" checked={form.sendEmail} onChange={set('sendEmail')} /> לשלוח ללקוחה מייל עם הקישור והסיסמה</label>
          {err && <div className="err">{err}</div>}
          <button className="btn pri" disabled={busy}>{busy ? 'יוצרת…' : 'יצירה'}</button>
        </form>
      )}

      {list.length === 0 && <div className="card mute">עוד אין גלריות. לחצי על ״גלריה חדשה״ כדי להתחיל.</div>}
      <div className="grid2">
        {list.map((g) => {
          const s = stats[g.id] || { total: 0, selected: 0 };
          const days = Math.max(0, Math.ceil((new Date(g.expires_at) - Date.now()) / 864e5));
          return (
            <Link key={g.id} href={`/studio/${g.id}`} style={{ textDecoration: 'none' }}>
              <div className="card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>{g.title}</b>
                  <span className={'badge' + (g.status === 'submitted' ? ' done' : '')}>{g.status === 'submitted' ? 'הבחירה הושלמה' : 'ממתינה ללקוחה'}</span>
                </div>
                <div className="mute">{g.client_name || g.client_email} · {s.total} תמונות</div>
                <div className="bar" style={{ margin: '12px 0 6px' }}><i style={{ width: `${Math.min(100, (s.selected / g.quota) * 100)}%` }} /></div>
                <div className="mute">נבחרו {s.selected} מתוך {g.quota} · תימחק בעוד {days} ימים</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div></main>
  );
}
