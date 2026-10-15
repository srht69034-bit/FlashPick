'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, authedFetch, signedUrls } from '@/lib/supabase';
import { useUser } from '@/lib/useUser';
import Modal from '@/components/Modal';

const EMPTY = { title: '', clientName: '', clientEmail: '', quota: 30, password: '', sendEmail: false };

export default function Dashboard() {
  const router = useRouter();
  const user = useUser();
  const [list, setList] = useState(null);
  const [stats, setStats] = useState({});
  const [covers, setCovers] = useState({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [created, setCreated] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const [role, setRole] = useState(null);

  const load = useCallback(async (uid) => {
    const { data } = await supabase.from('galleries').select('*').eq('photographer_id', uid).order('created_at', { ascending: false });
    const { data: st } = await supabase.from('gallery_stats').select('*');
    const gl = data || [];
    setList(gl);
    setStats(Object.fromEntries((st || []).map((s) => [s.gallery_id, s])));
    const firsts = await Promise.all(gl.map(async (g) => {
      const { data: p } = await supabase.from('photos').select('path').eq('gallery_id', g.id).order('position').limit(1);
      return p?.[0]?.path || null;
    }));
    const urls = await signedUrls(firsts.filter(Boolean));
    setCovers(Object.fromEntries(gl.map((g, i) => [g.id, firsts[i] ? urls[firsts[i]] : null])));
  }, []);

  useEffect(() => {
    if (user === null) router.replace('/studio/login');
    if (user) {
      supabase.from('profiles').select('role').eq('id', user.id).single().then(({ data }) => {
        const r = data?.role || 'photographer';
        setRole(r);
        if (r === 'photographer') load(user.id);
      });
    }
  }, [user?.id, user === null]); // eslint-disable-line

  async function create(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await authedFetch('/api/galleries', form);
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error || 'שגיאה ביצירת הגלריה');
    setCreated(j); setOpen(false); setForm(EMPTY); load(user.id);
  }

  if (role === 'client') return (
    <main className="page"><div className="authbox">
      <h1>זה חשבון של לקוחה</h1>
      <p className="mute">אזור הצלמות מיועד לצלמות בלבד. הגלריה שלך נמצאת בקישור האישי שקיבלת מהצלמת.</p>
      <button className="btn" onClick={() => supabase.auth.signOut().then(() => router.replace('/studio/login'))}>החלפת משתמש</button>
    </div></main>
  );
  if (!user || !list) return <main className="page"><div className="wrap mute" style={{ paddingTop: 40 }}>טוען…</div></main>;

  const waiting = list.filter((g) => g.status === 'open').length;
  const totalPhotos = Object.values(stats).reduce((a, s) => a + (s.total || 0), 0);

  return (
    <main className="page"><div className="wrap">
      <nav className="nav">
        <span className="brand"><i />FlashPick</span>
        <div className="row">
          <button className="btn pri" onClick={() => setOpen(true)}>＋ גלריה חדשה</button>
          <button className="btn ghost" onClick={() => supabase.auth.signOut().then(() => router.replace('/studio/login'))}>יציאה</button>
        </div>
      </nav>

      <header className="hero-s"><h1>הגלריות שלך</h1>
        <p className="mute" style={{ margin: '6px 0 0' }}>כל הבחירות של הלקוחות במקום אחד.</p></header>

      <div className="stats">
        <div className="stat"><b>{waiting}</b><span className="mute">ממתינות ללקוחה</span></div>
        <div className="stat"><b style={{ color: 'var(--yes)' }}>{list.length - waiting}</b><span className="mute">בחירה הושלמה</span></div>
        <div className="stat"><b>{totalPhotos}</b><span className="mute">תמונות בענן</span></div>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <p style={{ fontSize: 20, margin: '0 0 6px', fontWeight: 700 }}>עוד אין גלריות</p>
          <p className="mute" style={{ margin: '0 0 18px' }}>צרי גלריה, העלי תמונות ושלחי ללקוחה קישור אישי.</p>
          <button className="btn pri" onClick={() => setOpen(true)}>＋ גלריה חדשה</button>
        </div>
      ) : (
        <div className="gcards">
          {list.map((g) => {
            const s = stats[g.id] || { total: 0, selected: 0 };
            const days = Math.max(0, Math.ceil((new Date(g.expires_at) - Date.now()) / 864e5));
            const done = g.status === 'submitted';
            return (
              <Link key={g.id} href={`/studio/${g.id}`} className="gcard">
                <div className="cover">
                  {covers[g.id] ? <img src={covers[g.id]} alt="" /> : <div className="nocover">אין עדיין תמונות</div>}
                  <span className={'pill ' + (done ? 'yes' : 'warn')}>{done ? '✓ הבחירה הושלמה' : 'ממתינה ללקוחה'}</span>
                </div>
                <div className="gbody">
                  <b>{g.title}</b>
                  <div className="mute small">{g.client_name || g.client_email} · {s.total} תמונות</div>
                  <div className="bar" style={{ margin: '12px 0 6px' }}><i style={{ width: `${Math.min(100, (s.selected / g.quota) * 100)}%` }} /></div>
                  <div className="mute small">נבחרו {s.selected} מתוך {g.quota} · נמחקת בעוד {days} ימים</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {open && (
        <Modal onClose={() => setOpen(false)}>
          <h2>גלריה חדשה</h2>
          <form onSubmit={create}>
            <div className="g2">
              <div className="field"><label>שם הגלריה</label><input className="inp" value={form.title} onChange={set('title')} required /></div>
              <div className="field"><label>שם הלקוחה</label><input className="inp" value={form.clientName} onChange={set('clientName')} /></div>
              <div className="field"><label>מייל הלקוחה</label><input className="inp" type="email" dir="ltr" value={form.clientEmail} onChange={set('clientEmail')} required /></div>
              <div className="field"><label>מכסת תמונות</label><input className="inp" type="number" min="1" value={form.quota} onChange={set('quota')} required /></div>
            </div>
            <div className="field"><label>סיסמה ללקוחה (ריק = אקראית)</label><input className="inp" dir="ltr" value={form.password} onChange={set('password')} /></div>
            <label className="row mute small" style={{ marginBottom: 14 }}><input type="checkbox" checked={form.sendEmail} onChange={set('sendEmail')} /> לשלוח ללקוחה מייל עם הקישור והסיסמה</label>
            {err && <div className="err">{err}</div>}
            <div className="row"><button className="btn pri" disabled={busy}>{busy ? 'יוצרת…' : 'יצירת גלריה'}</button>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>ביטול</button></div>
          </form>
        </Modal>
      )}

      {created && (
        <Modal onClose={() => setCreated(null)}>
          <h2>הגלריה מוכנה ✓</h2>
          <p className="mute small" style={{ margin: 0 }}>שמרי את הפרטים. הסיסמה מוצגת רק עכשיו.</p>
          <div className="secret">{created.link}<br />{created.email}<br />{created.password}</div>
          <div className="row">
            <button className="btn" onClick={() => navigator.clipboard.writeText(`קישור: ${created.link}\nמייל: ${created.email}\nסיסמה: ${created.password}`)}>העתקת הפרטים</button>
            <Link className="btn pri" href={`/studio/${created.id}`}>להעלאת תמונות</Link>
          </div>
          {created.mail === 'sent' && <p className="mute small">נשלח גם מייל ללקוחה.</p>}
          {created.mail === 'failed' && <p className="err">שליחת המייל נכשלה, שלחי את הפרטים ידנית.</p>}
        </Modal>
      )}
    </div></main>
  );
}
