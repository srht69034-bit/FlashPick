'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase, BUCKET, fetchPhotos, signedUrls } from '@/lib/supabase';
import { makePreview, runPool } from '@/lib/image';
import { useUser } from '@/lib/useUser';

export default function StudioGallery() {
  const { id } = useParams();
  const router = useRouter();
  const user = useUser();
  const [g, setG] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [urls, setUrls] = useState({});
  const [wm, setWm] = useState('');
  const [prog, setProg] = useState(null);
  const [over, setOver] = useState(false);
  const [tab, setTab] = useState('all');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const { data: gal } = await supabase.from('galleries').select('*').eq('id', id).maybeSingle();
    if (!gal) return setG(false);
    setG(gal);
    const ph = await fetchPhotos(id);
    setPhotos(ph);
    setUrls(await signedUrls(ph.map((p) => p.path)));
  }, [id]);

  useEffect(() => {
    if (user === null) router.replace('/studio/login');
    if (!user) return;
    load();
    supabase.from('profiles').select('full_name').eq('id', user.id).single()
      .then(({ data }) => setWm(localStorage.getItem('wm') || data?.full_name || ''));
}, [user?.id, user === null, load]); // eslint-disable-line
  async function upload(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/'))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!files.length) return;
    localStorage.setItem('wm', wm);
    const base = photos.length, rows = [];
    let failed = 0;
    setProg({ done: 0, total: files.length }); setMsg('');
    await runPool(files, 6, async (f, i) => {
      try {
        const blob = await makePreview(f, wm);
        const path = `${id}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw error;
        rows.push({ gallery_id: id, path, original_name: f.name, position: base + i });
      } catch { failed++; }
      setProg((p) => ({ ...p, done: p.done + 1 }));
    });
    for (let i = 0; i < rows.length; i += 200) await supabase.from('photos').insert(rows.slice(i, i + 200));
    setProg(null);
    setMsg(`הועלו ${rows.length} תמונות${failed ? `, ${failed} נכשלו (אפשר להעלות שוב)` : ''}`);
    load();
  }

  async function reopen() {
    await supabase.from('galleries').update({ status: 'open', submitted_at: null }).eq('id', id);
    load();
  }

  async function remove() {
    if (!confirm('למחוק את הגלריה וכל התמונות לצמיתות?')) return;
    for (let i = 0; i < photos.length; i += 500)
      await supabase.storage.from(BUCKET).remove(photos.slice(i, i + 500).map((p) => p.path));
    await supabase.from('galleries').delete().eq('id', id);
    router.replace('/studio');
  }

  if (g === false) return <main className="page"><div className="wrap">הגלריה לא נמצאה. <Link href="/studio">חזרה</Link></div></main>;
  if (!user || !g) return <main className="page"><div className="wrap mute">טוען…</div></main>;

  const selected = photos.filter((p) => p.selected)
    .sort((a, b) => (a.album_page ?? 9999) - (b.album_page ?? 9999) || (a.album_pos ?? 0) - (b.album_pos ?? 0));
  const link = `${location.origin}/g/${g.id}`;

  return (
    <main className="page"><div className="wrap">
      <div className="top">
        <div>
          <Link href="/studio" className="mute">→ כל הגלריות</Link>
          <h1>{g.title}</h1>
          <div className="mute">{g.client_name || g.client_email} · {photos.length} תמונות · נבחרו {selected.length} מתוך {g.quota} · {g.status === 'submitted' ? 'הבחירה הושלמה ✔' : 'ממתינה ללקוחה'}</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => navigator.clipboard.writeText(link).then(() => setMsg('הקישור הועתק'))}>העתקת קישור</button>
          {g.status === 'submitted' && <button className="btn" onClick={reopen}>פתיחה מחדש ללקוחה</button>}
          <button className="btn bad" onClick={remove}>מחיקת גלריה</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="field"><label>סימן מים (יודפס על כל התמונות)</label>
          <input className="inp" value={wm} onChange={(e) => setWm(e.target.value)} /></div>
        <div className={'drop' + (over ? ' on' : '')}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
          {prog ? (
            <>
              <b>מעלה {prog.done} / {prog.total}</b>
              <div className="bar" style={{ margin: '10px auto', maxWidth: 360 }}><i style={{ width: `${(prog.done / prog.total) * 100}%` }} /></div>
              <span className="mute">התמונות מכווצות ומקבלות סימן מים בדפדפן, ועולות במקביל. אפשר להשאיר את הלשונית פתוחה.</span>
            </>
          ) : (
            <>
              <p style={{ margin: '0 0 10px' }}>גררי לכאן את התמונות (עד כ-1,000 בכל פעם)</p>
              <label className="btn pri" style={{ display: 'inline-block' }}>
                או בחירת קבצים
                <input type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
              </label>
              <p className="mute" style={{ margin: '10px 0 0' }}>המקור נשאר אצלך במחשב. לשרת עולה רק תצוגה מקדימה עם סימן מים.</p>
            </>
          )}
        </div>
        {msg && <p className="mute">{msg}</p>}
      </div>

      <div className="tabs">
        <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>כל התמונות ({photos.length})</button>
        <button className={tab === 'sel' ? 'on' : ''} onClick={() => setTab('sel')}>בחירות הלקוחה ({selected.length})</button>
      </div>

      {tab === 'all' ? (
        <div className="photos">
          {photos.map((p) => (
            <div key={p.id} className={'ph' + (p.selected ? ' sel' : '')}>
              {urls[p.path] && <img src={urls[p.path]} alt="" loading="lazy" decoding="async" />}
              <span className="nm">{p.original_name}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="btn sm" onClick={() => navigator.clipboard.writeText(selected.map((p) => p.original_name).join('\n')).then(() => setMsg('רשימת הקבצים הועתקה'))}>העתקת רשימת קבצים</button>
          </div>
          {selected.length === 0 && <span className="mute">הלקוחה עוד לא בחרה.</span>}
          {selected.map((p) => (
            <div key={p.id} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <b dir="ltr" style={{ minWidth: 150 }}>{p.original_name}</b>
              <span className="mute" style={{ minWidth: 70 }}>{p.album_page ? `עמוד ${p.album_page}` : '—'}</span>
              <span>{p.note}</span>
            </div>
          ))}
          {Object.entries(g.page_notes || {}).filter(([, v]) => v).map(([k, v]) => (
            <p key={k} className="mute">הערה לעמוד {k}: {v}</p>
          ))}
        </div>
      )}
    </div></main>
  );
}
