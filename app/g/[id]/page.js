'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { supabase, authedFetch, fetchPhotos, signedUrls } from '@/lib/supabase';
import { useUser } from '@/lib/useUser';

export default function ClientGallery() {
  const { id } = useParams();
  const user = useUser();
  const [g, setG] = useState(null); // null = טוען, false = אין גישה
  const [photos, setPhotos] = useState([]);
  const [urls, setUrls] = useState({});
  const [tab, setTab] = useState('pick');
  const [onlySel, setOnlySel] = useState(false);
  const [lb, setLb] = useState(null);
  const [toast, setToast] = useState('');
  const [pageCount, setPageCount] = useState(1);
  const [pageNotes, setPageNotes] = useState({});
  const [over, setOver] = useState(null);
  const [basketOver, setBasketOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 2400); };

  const load = useCallback(async () => {
    const { data: gal } = await supabase.from('galleries').select('*').eq('id', id).maybeSingle();
    if (!gal) return setG(false);
    setG(gal); setPageNotes(gal.page_notes || {});
    const ph = await fetchPhotos(id);
    setPhotos(ph);
    setPageCount(Math.max(1, ...ph.map((p) => p.album_page || 0)));
    setUrls(await signedUrls(ph.map((p) => p.path)));
  }, [id]);

  useEffect(() => { if (user) load(); }, [user?.id, load]); // eslint-disable-line

  // חידוש הקישורים החתומים לפני שהם פגים
  useEffect(() => {
    if (!user || !photos.length) return;
    const t = setInterval(async () => setUrls(await signedUrls(photos.map((p) => p.path))), 50 * 60 * 1000);
    return () => clearInterval(t);
  }, [user?.id, photos.length]); // eslint-disable-line

  useEffect(() => {
    if (lb === null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLb(null);
      if (e.key === 'ArrowLeft') setLb((i) => Math.min(i + 1, shown.length - 1));
      if (e.key === 'ArrowRight') setLb((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line

  if (user === undefined) return <main className="page dark"><div className="wrap mute">טוען…</div></main>;
  if (user === null) return (
    <main className="page dark"><div className="authbox">
      <h1>הגלריה שלך מחכה</h1>
      <p className="mute">היכנסי עם המייל והסיסמה שקיבלת מהצלמת.</p>
      <AuthForm />
    </div></main>
  );
  if (g === false) return (
    <main className="page dark"><div className="authbox">
      <h1>אין גישה לגלריה הזו</h1>
      <p className="mute">ייתכן שנכנסת עם משתמש אחר, או שהגלריה נמחקה.</p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>החלפת משתמש</button>
    </div></main>
  );
  if (!g) return <main className="page dark"><div className="wrap mute">טוען…</div></main>;

  const locked = g.status === 'submitted';
  const selected = photos.filter((p) => p.selected);
  const count = selected.length, quota = g.quota;
  const shown = onlySel ? selected : photos;
  const patch = (pid, f) => setPhotos((prev) => prev.map((p) => (p.id === pid ? { ...p, ...f } : p)));
  const drag = (p) => ({ draggable: !locked, onDragStart: (e) => e.dataTransfer.setData('text/plain', p.id) });

  async function toggle(p) {
    if (locked) return;
    if (!p.selected && count >= quota) return say(`הגעת למכסה של ${quota} תמונות. אפשר להסיר תמונה כדי לבחור אחרת.`);
    const f = p.selected ? { selected: false, album_page: null, album_pos: null } : { selected: true };
    patch(p.id, f);
    const { error } = await supabase.from('photos').update(f).eq('id', p.id);
    if (error) { patch(p.id, { selected: p.selected, album_page: p.album_page, album_pos: p.album_pos }); say('השמירה נכשלה, נסי שוב'); }
  }

  async function place(pid, page, beforeId = null) {
    const moving = photos.find((p) => p.id === pid);
    if (!moving?.selected) return;
    const target = selected.filter((p) => p.album_page === page && p.id !== pid)
      .sort((a, b) => (a.album_pos ?? 0) - (b.album_pos ?? 0));
    const at = beforeId ? target.findIndex((p) => p.id === beforeId) : -1;
    target.splice(at < 0 ? target.length : at, 0, moving);
    const ups = target.map((p, i) => ({ id: p.id, album_page: page, album_pos: i }));
    setPhotos((prev) => prev.map((p) => ups.find((u) => u.id === p.id) ? { ...p, ...ups.find((u) => u.id === p.id) } : p));
    const res = await Promise.all(ups.map((u) => supabase.from('photos').update({ album_page: u.album_page, album_pos: u.album_pos }).eq('id', u.id)));
    if (res.some((r) => r.error)) say('השמירה נכשלה, נסי שוב');
  }

  async function unplace(pid) {
    patch(pid, { album_page: null, album_pos: null });
    await supabase.from('photos').update({ album_page: null, album_pos: null }).eq('id', pid);
  }

  const saveNote = (pid, v) => supabase.from('photos').update({ note: v || null }).eq('id', pid);
  const savePageNotes = (n) => supabase.rpc('set_page_notes', { g: id, n });

  async function submit() {
    const m = count < quota
      ? `בחרת ${count} מתוך ${quota} תמונות. לאשר ולשלוח לצלמת? אחרי האישור אי אפשר לשנות.`
      : 'לאשר סופית ולשלוח לצלמת? אחרי האישור אי אפשר לשנות.';
    if (!confirm(m)) return;
    setBusy(true);
    const r = await authedFetch('/api/submit', { galleryId: id });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return say(j.error || 'שגיאה בשליחה');
    say('הבחירה נשלחה לצלמת ✔');
    load();
  }

  const img = (p) => urls[p.path] && <img src={urls[p.path]} alt="" draggable={false} loading="lazy" decoding="async" />;
  const unplaced = selected.filter((p) => !p.album_page);
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
  const cur = lb !== null ? shown[lb] : null;

  return (
    <main className="page dark" onContextMenu={(e) => e.preventDefault()}>
      <div className="wrap" style={{ paddingBottom: 120 }}>
        <div className="top">
          <div><h1>{g.title}</h1>
            <div className="mute">{locked ? 'הבחירה נשלחה לצלמת ✔' : `בחרי עד ${quota} תמונות. לחיצה על תמונה בוחרת אותה.`}</div></div>
          <button className="btn sm" onClick={() => supabase.auth.signOut()}>יציאה</button>
        </div>

        <div className="tabs">
          <button className={tab === 'pick' ? 'on' : ''} onClick={() => setTab('pick')}>בחירת תמונות</button>
          <button className={tab === 'album' ? 'on' : ''} onClick={() => setTab('album')}>סידור האלבום</button>
        </div>

        {tab === 'pick' && (
          <>
            <label className="row mute" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={onlySel} onChange={(e) => setOnlySel(e.target.checked)} /> להציג רק את הנבחרות
            </label>
            <div className="photos">
              {shown.map((p, i) => (
                <div key={p.id} className={'ph' + (p.selected ? ' sel' : '')} {...drag(p)} role="button" tabIndex={0} aria-pressed={p.selected}
                  onClick={() => toggle(p)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(p))}>
                  {img(p)}
                  <span className="tick">{p.selected ? '✓' : ''}</span>
                  <button className="zoom" onClick={(e) => { e.stopPropagation(); setLb(i); }}>הגדלה</button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'album' && (
          <div className="album">
            <aside className="card tray">
              <b>ממתינות לשיבוץ ({unplaced.length})</b>
              <p className="mute" style={{ margin: '4px 0 10px' }}>גררי לעמוד, או בחרי עמוד מהרשימה.</p>
              {count === 0 && <p className="mute">קודם בוחרים תמונות בלשונית הראשונה.</p>}
              <div className="photos">
                {unplaced.map((p) => (
                  <div key={p.id}>
                    <div className="ph" {...drag(p)}>{img(p)}</div>
                    <select className="inp" value="" disabled={locked} onChange={(e) => e.target.value && place(p.id, +e.target.value)}>
                      <option value="">העברה לעמוד…</option>
                      {pages.map((n) => <option key={n} value={n}>עמוד {n}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </aside>
            <div>
              {pages.map((n) => {
                const items = selected.filter((p) => p.album_page === n).sort((a, b) => (a.album_pos ?? 0) - (b.album_pos ?? 0));
                return (
                  <section key={n} className="card pagebox">
                    <div className="row">
                      <b>עמוד {n}</b>
                      <input className="inp" style={{ flex: 1 }} placeholder="הנחיה לעמוד, למשל: תמונה גדולה במרכז" disabled={locked}
                        value={pageNotes[n] || ''} onChange={(e) => setPageNotes({ ...pageNotes, [n]: e.target.value })} onBlur={() => savePageNotes(pageNotes)} />
                    </div>
                    <div className={'drops' + (over === n ? ' over' : '')}
                      onDragOver={(e) => { e.preventDefault(); setOver(n); }} onDragLeave={() => setOver(null)}
                      onDrop={(e) => { e.preventDefault(); setOver(null); const pid = e.dataTransfer.getData('text/plain'); if (pid && !locked) place(pid, n); }}>
                      {items.length === 0 && <span className="mute">גררי לכאן תמונות</span>}
                      {items.map((p) => (
                        <div key={p.id} className="item"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(null); const pid = e.dataTransfer.getData('text/plain'); if (pid && pid !== p.id && !locked) place(pid, n, p.id); }}>
                          <div className="ph" {...drag(p)}>
                            {img(p)}
                            {!locked && <button className="zoom" style={{ opacity: 1 }} onClick={() => unplace(p.id)} aria-label="הסרה מהעמוד">✕</button>}
                          </div>
                          <textarea className="inp" placeholder="הערה לתמונה" disabled={locked} value={p.note || ''}
                            onChange={(e) => patch(p.id, { note: e.target.value })} onBlur={(e) => saveNote(p.id, e.target.value)} />
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
              {!locked && <button className="btn" onClick={() => setPageCount(pageCount + 1)}>הוספת עמוד</button>}
            </div>
          </div>
        )}
      </div>

      <div className={'basket' + (basketOver ? ' over' : '')}
        onDragOver={(e) => { e.preventDefault(); setBasketOver(true); }} onDragLeave={() => setBasketOver(false)}
        onDrop={(e) => { e.preventDefault(); setBasketOver(false); const p = photos.find((x) => x.id === e.dataTransfer.getData('text/plain')); if (p && !p.selected) toggle(p); }}>
        <div className="in">
          <div className="cnt">{count} / {quota}</div>
          <div style={{ flex: 1 }}>
            <div className="bar"><i style={{ width: `${Math.min(100, (count / quota) * 100)}%` }} /></div>
            <div className="mute">{locked ? 'נשלח לצלמת' : count >= quota ? 'מילאת את המכסה. אפשר לסדר את האלבום ולאשר.' : `נשארו ${quota - count} לבחירה (אפשר גם לגרור תמונה לכאן)`}</div>
          </div>
          {!locked && <button className="btn pri" disabled={busy || count === 0} onClick={submit}>{busy ? 'שולחת…' : 'אישור ושליחה לצלמת'}</button>}
        </div>
      </div>

      {cur && (
        <div className="lb" onClick={() => setLb(null)}>
          <img src={urls[cur.path]} alt="" draggable={false} onClick={(e) => e.stopPropagation()} />
          <button style={{ top: 16, insetInlineEnd: 16 }} onClick={() => setLb(null)} aria-label="סגירה">✕</button>
          <button style={{ top: '50%', right: 16 }} onClick={(e) => { e.stopPropagation(); setLb(Math.max(lb - 1, 0)); }} aria-label="הקודמת">›</button>
          <button style={{ top: '50%', left: 16 }} onClick={(e) => { e.stopPropagation(); setLb(Math.min(lb + 1, shown.length - 1)); }} aria-label="הבאה">‹</button>
          {!locked && (
            <button className="btn pri" style={{ bottom: 22, left: '50%', transform: 'translateX(-50%)', width: 'auto', borderRadius: 12, fontSize: 16, padding: '0 22px' }}
              onClick={(e) => { e.stopPropagation(); toggle(cur); }}>{cur.selected ? 'הסרת הבחירה' : 'בחירת התמונה'}</button>
          )}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
