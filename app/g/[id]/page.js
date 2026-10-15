'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import Justified from '@/components/Justified';
import { supabase, authedFetch, fetchPhotos } from '@/lib/supabase';
import { SecureImg, useSecureUrl } from '@/lib/secure';
import { useUser } from '@/lib/useUser';

const stateOf = (p) => (p.selected ? 'yes' : p.rejected ? 'no' : null);

function Ring({ value, max }) {
  const r = 22, c = 2 * Math.PI * r, pct = Math.min(1, value / max);
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r={r} className="ring-bg" />
      <circle cx="28" cy="28" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 28 28)" />
      <text x="28" y="33" textAnchor="middle" className="ring-t">{value}</text>
    </svg>
  );
}

export default function ClientGallery() {
  const { id } = useParams();
  const user = useUser();
  const [g, setG] = useState(null); // null = טוען, false = אין גישה
  const [photos, setPhotos] = useState([]);
  const [tab, setTab] = useState('pick');
  const [view, setView] = useState('all');
  const [lb, setLb] = useState(null);
  const [cmp, setCmp] = useState([]);
  const [cmpOpen, setCmpOpen] = useState(false);
  const [intro, setIntro] = useState(false);
  const [albumOn, setAlbumOn] = useState(false);
  const [hideNotice, setHideNotice] = useState(false);
  const [toast, setToast] = useState('');
  const [pageCount, setPageCount] = useState(1);
  const [pageNotes, setPageNotes] = useState({});
  const [over, setOver] = useState(null);
  const [busy, setBusy] = useState(false);
  const [touchX, setTouchX] = useState(null);

  const load = useCallback(async () => {
    const { data: gal } = await supabase.from('galleries').select('*').eq('id', id).maybeSingle();
    if (!gal) return setG(false);
    setG(gal); setPageNotes(gal.page_notes || {});
    const ph = await fetchPhotos(id);
    setPhotos(ph);
    const maxPage = Math.max(0, ...ph.map((p) => p.album_page || 0));
    setPageCount(Math.max(1, maxPage));
    if (maxPage > 0) setAlbumOn(true);
  }, [id]);

  useEffect(() => { if (user) load(); }, [user?.id, load]); // eslint-disable-line
  useEffect(() => { if (user && !sessionStorage.getItem('intro-' + id)) setIntro(true); }, [user?.id, id]); // eslint-disable-line

  // ---- נתונים נגזרים (לפני כל return מוקדם) ----
  const locked = g?.status === 'submitted';
  const quota = g?.quota || 0;
  const selected = photos.filter((p) => p.selected);
  const count = selected.length;
  const rejectedN = photos.filter((p) => p.rejected).length;
  const shown = photos.filter((p) => view === 'all' || (view === 'yes' && p.selected) || (view === 'no' && p.rejected) || (view === 'none' && !p.selected && !p.rejected));
  const cur = lb !== null ? shown[lb] : null;
  const introBg = useSecureUrl(photos[0]?.path);
  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };
  const patch = (pid, f) => setPhotos((prev) => prev.map((p) => (p.id === pid ? { ...p, ...f } : p)));

  useEffect(() => {
    if (lb === null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLb(null);
      else if (e.key === 'ArrowLeft') setLb((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === 'ArrowRight') setLb((i) => Math.max(i - 1, 0));
      else if (cur && (e.key === 'v' || e.key === 'V' || e.key === 'ז')) mark(cur, 'yes');
      else if (cur && (e.key === 'x' || e.key === 'X' || e.key === 'ס')) mark(cur, 'no');
      else if (cur && (e.key === 'c' || e.key === 'C' || e.key === 'ב')) toggleCmp(cur.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line

  async function mark(p, next) {
    if (locked) return;
    if (stateOf(p) === next) next = null;
    if (next === 'yes' && count >= quota) return say(`הגעת למכסה של ${quota} תמונות. אפשר להסיר תמונה כדי לבחור אחרת.`);
    const f = { selected: next === 'yes', rejected: next === 'no' };
    if (next !== 'yes') { f.album_page = null; f.album_pos = null; }
    const prev = { selected: p.selected, rejected: p.rejected, album_page: p.album_page, album_pos: p.album_pos };
    patch(p.id, f);
    const { error } = await supabase.from('photos').update(f).eq('id', p.id);
    if (error) { patch(p.id, prev); say('השמירה נכשלה, נסי שוב'); }
    else if (next === 'yes' && count + 1 === quota) say('🎉 מילאת את המכסה! אפשר לאשר.');
  }

  function toggleCmp(pid) {
    const n = cmp.includes(pid) ? cmp.filter((x) => x !== pid) : [...cmp, pid].slice(-2);
    setCmp(n);
    if (n.length === 2) { setCmpOpen(true); setLb(null); }
    else if (!cmp.includes(pid)) say('בחרי עוד תמונה אחת להשוואה');
  }

  async function place(pid, page, beforeId = null) {
    const moving = photos.find((p) => p.id === pid);
    if (!moving?.selected) return;
    const target = selected.filter((p) => p.album_page === page && p.id !== pid).sort((a, b) => (a.album_pos ?? 0) - (b.album_pos ?? 0));
    const at = beforeId ? target.findIndex((p) => p.id === beforeId) : -1;
    target.splice(at < 0 ? target.length : at, 0, moving);
    const ups = target.map((p, i) => ({ id: p.id, album_page: page, album_pos: i }));
    setPhotos((prev) => prev.map((p) => { const u = ups.find((x) => x.id === p.id); return u ? { ...p, ...u } : p; }));
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

  // ---- מצבי טעינה / כניסה ----
  if (user === undefined) return <main className="page"><div className="wrap mute" style={{ paddingTop: 40 }}>טוען…</div></main>;
  if (user === null) return (
    <main className="page"><div className="authbox">
      <span className="brand"><i />FlashPick</span>
      <h1>הגלריה שלך מחכה</h1>
      <p className="mute">היכנסי עם המייל והסיסמה שקיבלת מהצלמת.</p>
      <AuthForm />
    </div></main>
  );
  if (g === false) return (
    <main className="page"><div className="authbox">
      <h1>אין גישה לגלריה הזו</h1>
      <p className="mute">ייתכן שנכנסת עם משתמש אחר, או שהגלריה נמחקה.</p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>החלפת משתמש</button>
    </div></main>
  );
  if (!g) return <main className="page"><div className="wrap mute" style={{ paddingTop: 40 }}>טוען…</div></main>;

  const img = (p) => <SecureImg path={p.path} />;
  const items = shown.map((p, i) => ({ id: p.id, ratio: p.w && p.h ? p.w / p.h : 0.75, p, i }));
  const unplaced = selected.filter((p) => !p.album_page);
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
  const drag = (p) => ({ draggable: !locked, onDragStart: (e) => e.dataTransfer.setData('text/plain', p.id) });
  const cmpPhotos = cmp.map((x) => photos.find((p) => p.id === x)).filter(Boolean);
  const filt = (k, label) => <button className={view === k ? 'on' : ''} onClick={() => { setView(k); setLb(null); }}>{label}</button>;

  return (
    <main className="page" onContextMenu={(e) => e.preventDefault()}>
      {intro && (
        <div className="intro">
          {introBg && <div className="bgimg" style={{ backgroundImage: `url(${introBg})` }} />}
          <div className="box">
            <div className="mute" style={{ marginBottom: 8 }}>{g.client_name ? `שלום ${g.client_name}` : 'שלום'}</div>
            <h1>{g.title}</h1>
            <p style={{ fontSize: 18, margin: 0, opacity: .9 }}>בחרי עד <b>{quota}</b> תמונות. אין לחץ, אפשר לשנות עד האישור הסופי.</p>
            <div className="hints"><span>✓ בחירה</span><span>✗ פסילה</span><span>⇄ השוואה בין שתיים</span></div>
            <button className="btn pri" onClick={() => { sessionStorage.setItem('intro-' + id, '1'); setIntro(false); }}>בואי נתחיל</button>
          </div>
        </div>
      )}

      <header className="ghead"><div className="in">
        <Ring value={count} max={quota} />
        <div style={{ flex: 1, minWidth: 140 }}>
          <h1>{g.title}</h1>
          <div className="mute small">{locked ? 'הבחירה נשלחה לצלמת ✔' : `נבחרו ${count} מתוך ${quota} · נפסלו ${rejectedN}`}</div>
        </div>
        <div className="row">
          {cmp.length === 1 && <span className="mute small">נבחרה תמונה להשוואה</span>}
          {!locked && <button className="btn pri" disabled={busy || count === 0} onClick={submit}>{busy ? 'שולחת…' : 'אישור ושליחה לצלמת'}</button>}
          <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>יציאה</button>
        </div>
      </div></header>

      <div className="wrap" style={{ paddingTop: 14 }}>
        {locked && <div className="done-banner">הבחירה נשלחה לצלמת. תודה! היא תיצור איתך קשר להמשך.</div>}

        {albumOn && (
          <div className="filters" style={{ marginBottom: 12 }}>
            <button className={tab === 'pick' ? 'on' : ''} onClick={() => setTab('pick')}>בחירת תמונות</button>
            <button className={tab === 'album' ? 'on' : ''} onClick={() => setTab('album')}>עיצוב האלבום</button>
          </div>
        )}

        {tab === 'pick' && (
          <>
            <div className="filters" style={{ marginBottom: 14 }}>
              {filt('all', `הכול (${photos.length})`)}
              {filt('yes', `✓ נבחרו (${count})`)}
              {filt('no', `✗ נפסלו (${rejectedN})`)}
              {filt('none', 'עוד לא סימנתי')}
            </div>

            {!albumOn && !locked && !hideNotice && count > 0 && (
              <div className="notice">
                <div><b>אופציונלי: יש לך עיצוב מסוים בראש לאלבום?</b><div className="mute small">אפשר לסדר את התמונות בעמודים ולכתוב הערות. אם לא, הצלמת תעצב עבורך.</div></div>
                <div className="row"><button className="btn sm" onClick={() => { setAlbumOn(true); setTab('album'); }}>כן, לסדר אלבום</button>
                  <button className="btn ghost sm" onClick={() => setHideNotice(true)}>לא צריך</button></div>
              </div>
            )}

            {shown.length === 0 && <div className="empty mute">אין כאן תמונות בקטגוריה הזו.</div>}
            <Justified items={items} render={({ p, i }) => (
              <div className={'tile ' + (stateOf(p) || '')} onClick={() => setLb(i)}>
                {img(p)}
                {stateOf(p) === 'yes' && <span className="tag yes">✓</span>}
                {stateOf(p) === 'no' && <span className="tag no">✗</span>}
                {cmp.includes(p.id) && <span className="tag cmp">⇄</span>}
                {!locked && (
                  <div className="acts" onClick={(e) => e.stopPropagation()}>
                    <button className={'rb no' + (stateOf(p) === 'no' ? ' on' : '')} aria-label="פסילה" onClick={() => mark(p, 'no')}>✗</button>
                    <button className={'rb cmp' + (cmp.includes(p.id) ? ' on' : '')} aria-label="השוואה" onClick={() => toggleCmp(p.id)}>⇄</button>
                    <button className={'rb yes' + (stateOf(p) === 'yes' ? ' on' : '')} aria-label="בחירה" onClick={() => mark(p, 'yes')}>✓</button>
                  </div>
                )}
              </div>
            )} />
          </>
        )}

        {tab === 'album' && (
          <div className="album">
            <aside className="card tray">
              <b>ממתינות לשיבוץ ({unplaced.length})</b>
              <p className="mute small" style={{ margin: '4px 0 0' }}>גררי לעמוד, או בחרי עמוד מהרשימה.</p>
              {count === 0 && <p className="mute small">קודם בוחרים תמונות בלשונית הראשונה.</p>}
              <div className="trayg">
                {unplaced.map((p) => (
                  <div key={p.id}>
                    <div className="tile sq" {...drag(p)} style={{ cursor: 'grab' }}>{img(p)}</div>
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
                const its = selected.filter((p) => p.album_page === n).sort((a, b) => (a.album_pos ?? 0) - (b.album_pos ?? 0));
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
                      {its.length === 0 && <span className="mute small">גררי לכאן תמונות</span>}
                      {its.map((p) => (
                        <div key={p.id} className="item"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(null); const pid = e.dataTransfer.getData('text/plain'); if (pid && pid !== p.id && !locked) place(pid, n, p.id); }}>
                          <div className="tile sq" {...drag(p)} style={{ cursor: 'grab' }}>
                            {img(p)}
                            {!locked && <button className="rb del" style={{ opacity: 1 }} onClick={() => unplace(p.id)} aria-label="הסרה מהעמוד">✕</button>}
                          </div>
                          <textarea className="inp" placeholder="הערה לתמונה" disabled={locked} value={p.note || ''}
                            onChange={(e) => patch(p.id, { note: e.target.value })} onBlur={(e) => saveNote(p.id, e.target.value)} />
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
              {!locked && <button className="btn" onClick={() => setPageCount(pageCount + 1)}>＋ הוספת עמוד</button>}
            </div>
          </div>
        )}
      </div>

      {cur && (
        <div className="lb" onClick={() => setLb(null)}
          onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
          onTouchEnd={(e) => { if (touchX === null) return; const d = e.changedTouches[0].clientX - touchX; setTouchX(null);
            if (d < -60) setLb(Math.min(lb + 1, shown.length - 1)); else if (d > 60) setLb(Math.max(lb - 1, 0)); }}>
          <SecureImg key={cur.id} path={cur.path} onClick={(e) => e.stopPropagation()} />
          <span className="cnt">{lb + 1} / {shown.length}</span>
          <button className="x" onClick={() => setLb(null)} aria-label="סגירה">✕</button>
          <button className="nav-b" style={{ right: 16 }} onClick={(e) => { e.stopPropagation(); setLb(Math.max(lb - 1, 0)); }} aria-label="הקודמת">›</button>
          <button className="nav-b" style={{ left: 16 }} onClick={(e) => { e.stopPropagation(); setLb(Math.min(lb + 1, shown.length - 1)); }} aria-label="הבאה">‹</button>
          {!locked && (
            <div className="bot" onClick={(e) => e.stopPropagation()}>
              <button className={'big no' + (stateOf(cur) === 'no' ? ' on' : '')} onClick={() => mark(cur, 'no')}>✗ פסילה</button>
              <button className={'big cmp' + (cmp.includes(cur.id) ? ' on' : '')} onClick={() => toggleCmp(cur.id)}>⇄ השוואה</button>
              <button className={'big yes' + (stateOf(cur) === 'yes' ? ' on' : '')} onClick={() => mark(cur, 'yes')}>✓ בחירה</button>
            </div>
          )}
        </div>
      )}

      {cmpOpen && cmpPhotos.length === 2 && (
        <div className="cmpv">
          <div className="top">
            <b>השוואה בין שתי תמונות</b>
            <button className="btn sm" onClick={() => { setCmpOpen(false); setCmp([]); }}>סיום</button>
          </div>
          <div className="panes">
            {cmpPhotos.map((p) => (
              <div key={p.id} className={'pane ' + (stateOf(p) || '')}>
                <SecureImg path={p.path} />
                {!locked && (
                  <div className="row">
                    <button className={'big no' + (stateOf(p) === 'no' ? ' on' : '')} onClick={() => mark(p, 'no')}>✗</button>
                    <button className={'big yes' + (stateOf(p) === 'yes' ? ' on' : '')} onClick={() => mark(p, 'yes')}>✓ בחירה</button>
                    <button className="big" onClick={() => { setCmp(cmp.filter((x) => x !== p.id)); setCmpOpen(false); }}>החלפה</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
