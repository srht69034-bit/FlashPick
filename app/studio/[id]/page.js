'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase, BUCKET, fetchPhotos, signedUrls } from '@/lib/supabase';
import { makePreview, runPool } from '@/lib/image';
import { useUser } from '@/lib/useUser';
import Justified from '@/components/Justified';

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
  const [manage, setManage] = useState(false);
  const [picked, setPicked] = useState({});

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const { data: gal } = await supabase.from('galleries').select('*').eq('id', id).eq('photographer_id', session?.user?.id).maybeSingle();
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
        const { blob, w, h } = await makePreview(f, wm);
        const path = `${id}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw error;
        rows.push({ gallery_id: id, path, original_name: f.name, position: base + i, w, h });
      } catch { failed++; }
      setProg((p) => ({ ...p, done: p.done + 1 }));
    });
    for (let i = 0; i < rows.length; i += 200) await supabase.from('photos').insert(rows.slice(i, i + 200));
    setProg(null);
    setMsg(`הועלו ${rows.length} תמונות${failed ? `, ${failed} נכשלו (אפשר להעלות שוב)` : ''}`);
    load();
  }

  async function delPhotos(list) {
    if (!list.length) return;
    if (!confirm(`למחוק ${list.length} תמונות לצמיתות?`)) return;
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      await supabase.storage.from(BUCKET).remove(chunk.map((p) => p.path));
      await supabase.from('photos').delete().in('id', chunk.map((p) => p.id));
    }
    setPicked({}); setManage(false); setMsg(`נמחקו ${list.length} תמונות`);
    load();
  }

  async function reopen() {
    await supabase.from('galleries').update({ status: 'open', submitted_at: null }).eq('id', id);
    load();
  }

  async function removeGallery() {
    if (!confirm('למחוק את הגלריה וכל התמונות לצמיתות?')) return;
    for (let i = 0; i < photos.length; i += 500)
      await supabase.storage.from(BUCKET).remove(photos.slice(i, i + 500).map((p) => p.path));
    await supabase.from('galleries').delete().eq('id', id);
    router.replace('/studio');
  }

  if (g === false) return <main className="page"><div className="wrap" style={{ paddingTop: 40 }}>הגלריה לא נמצאה. <Link href="/studio">חזרה</Link></div></main>;
  if (!user || !g) return <main className="page"><div className="wrap mute" style={{ paddingTop: 40 }}>טוען…</div></main>;

  const selected = photos.filter((p) => p.selected)
    .sort((a, b) => (a.album_page ?? 9999) - (b.album_page ?? 9999) || (a.album_pos ?? 0) - (b.album_pos ?? 0));
  const rejected = photos.filter((p) => p.rejected).length;
  const pickedList = photos.filter((p) => picked[p.id]);
  const link = `${location.origin}/g/${g.id}`;
  const items = photos.map((p) => ({ id: p.id, ratio: p.w && p.h ? p.w / p.h : 0.75, p }));

  return (
    <main className="page"><div className="wrap">
      <nav className="nav">
        <Link href="/studio" className="brand"><i />FlashPick</Link>
        <Link href="/studio" className="btn ghost sm">→ כל הגלריות</Link>
      </nav>

      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 34, letterSpacing: '-.03em' }}>{g.title}</h1>
          <div className="mute">{g.client_name || g.client_email} · {photos.length} תמונות · ✓ {selected.length} מתוך {g.quota} · ✗ {rejected} · {g.status === 'submitted' ? 'הבחירה הושלמה' : 'ממתינה ללקוחה'}</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => navigator.clipboard.writeText(link).then(() => setMsg('הקישור הועתק'))}>העתקת קישור</button>
          {g.status === 'submitted' && <button className="btn" onClick={reopen}>פתיחה מחדש ללקוחה</button>}
          <button className="btn bad" onClick={removeGallery}>מחיקת גלריה</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 8 }}>
        <div className="field" style={{ maxWidth: 360 }}><label>סימן מים (יודפס על כל התמונות)</label>
          <input className="inp" value={wm} onChange={(e) => setWm(e.target.value)} /></div>
        <div className={'drop' + (over ? ' on' : '')}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
          {prog ? (
            <>
              <b style={{ fontSize: 20 }}>מעלה {prog.done} / {prog.total}</b>
              <div className="bar" style={{ margin: '12px auto', maxWidth: 380 }}><i style={{ width: `${(prog.done / prog.total) * 100}%` }} /></div>
              <span className="mute small">התמונות מכווצות ומקבלות סימן מים בדפדפן ועולות במקביל. אפשר להשאיר את הלשונית פתוחה.</span>
            </>
          ) : (
            <>
              <p style={{ margin: '0 0 12px', fontSize: 18 }}>גררי לכאן את התמונות (עד כ-1,000 בכל פעם)</p>
              <label className="btn pri" style={{ display: 'inline-block' }}>
                או בחירת קבצים
                <input type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
              </label>
              <p className="mute small" style={{ margin: '12px 0 0' }}>המקור נשאר אצלך במחשב. לשרת עולה רק תצוגה מקדימה עם סימן מים.</p>
            </>
          )}
        </div>
        {msg && <p className="mute small" style={{ margin: '12px 0 0' }}>{msg}</p>}
      </div>

      <div className="tabs">
        <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>כל התמונות ({photos.length})</button>
        <button className={tab === 'sel' ? 'on' : ''} onClick={() => setTab('sel')}>בחירות הלקוחה ({selected.length})</button>
      </div>

      {tab === 'all' ? (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className={'btn sm' + (manage ? ' pri' : '')} onClick={() => { setManage(!manage); setPicked({}); }}>{manage ? 'סיום בחירה' : 'בחירה למחיקה'}</button>
            {manage && <>
              <button className="btn sm" onClick={() => setPicked(Object.fromEntries(photos.map((p) => [p.id, true])))}>בחירת הכול</button>
              <button className="btn sm bad" disabled={!pickedList.length} onClick={() => delPhotos(pickedList)}>מחיקת {pickedList.length} נבחרות</button>
            </>}
          </div>
          {photos.length === 0 && <div className="empty mute">עוד לא הועלו תמונות.</div>}
          <Justified items={items} render={({ p }) => (
            <div className={'tile' + (manage && picked[p.id] ? ' picked' : '')} style={{ cursor: manage ? 'pointer' : 'default' }}
              onClick={() => manage && setPicked({ ...picked, [p.id]: !picked[p.id] })}>
              {urls[p.path] && <img src={urls[p.path]} alt="" loading="lazy" decoding="async" />}
              {p.selected && <span className="tag yes">✓</span>}
              {p.rejected && <span className="tag no">✗</span>}
              {manage && <span className="chk">{picked[p.id] ? '✓' : ''}</span>}
              {!manage && <button className="rb del" title="מחיקת התמונה" onClick={(e) => { e.stopPropagation(); delPhotos([p]); }}>🗑</button>}
              <span className="nm">{p.original_name}</span>
            </div>
          )} />
        </>
      ) : (
        <div className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="btn sm" onClick={() => navigator.clipboard.writeText(selected.map((p) => p.original_name).join('\n')).then(() => setMsg('רשימת הקבצים הועתקה'))}>העתקת רשימת קבצים</button>
          </div>
          {selected.length === 0 && <span className="mute">הלקוחה עוד לא בחרה.</span>}
          {selected.map((p) => (
            <div key={p.id} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <b dir="ltr" style={{ minWidth: 160 }}>{p.original_name}</b>
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
