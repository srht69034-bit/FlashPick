export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { admin, userFromRequest, sendMail, esc } from '@/lib/server';

const fail = (error, status) => NextResponse.json({ error }, { status });

// אישור סופי של הלקוחה: נועל את הגלריה ושולח מייל סיכום לצלמת
export async function POST(req) {
  const user = await userFromRequest(req);
  if (!user) return fail('לא מחוברת', 401);
  const { galleryId } = await req.json();

  const db = admin();
  const { data: g } = await db.from('galleries').select('*').eq('id', galleryId).single();
  if (!g || g.client_id !== user.id) return fail('אין הרשאה', 403);
  if (g.status !== 'open') return fail('הבחירה כבר נשלחה', 409);

  const { data: sel } = await db.from('photos')
    .select('original_name,album_page,album_pos,note,position')
    .eq('gallery_id', g.id).eq('selected', true);
  if (!sel?.length) return fail('לא נבחרו תמונות', 400);
  sel.sort((a, b) => (a.album_page ?? 9999) - (b.album_page ?? 9999) ||
    (a.album_pos ?? a.position) - (b.album_pos ?? b.position));

  await db.from('galleries').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', g.id);

  const { data: owner } = await db.auth.admin.getUserById(g.photographer_id);
  const pn = g.page_notes || {};
  const rows = sel.map((p) => `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee"><b dir="ltr">${esc(p.original_name)}</b></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${p.album_page ? 'עמוד ' + p.album_page : '—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(p.note || '')}</td></tr>`).join('');
  const pageNotes = Object.entries(pn).filter(([, v]) => v)
    .map(([k, v]) => `<li>עמוד ${esc(k)}: ${esc(v)}</li>`).join('');

  let mailed = false;
  try {
    const r = await sendMail({
      to: owner?.user?.email,
      subject: `הבחירה הושלמה — ${g.title} (${g.client_name || g.client_email})`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7">
        <h2>${esc(g.client_name || g.client_email)} סיימה לבחור ✔</h2>
        <p>גלריה: <b>${esc(g.title)}</b> · נבחרו ${sel.length} מתוך ${g.quota}. אפשר להתחיל בעריכה הסופית.</p>
        <table style="border-collapse:collapse"><tr><th align="right">קובץ</th><th align="right">מיקום</th><th align="right">הערה</th></tr>${rows}</table>
        ${pageNotes ? `<h3>הערות לעמודים</h3><ul>${pageNotes}</ul>` : ''}</div>`,
    });
    mailed = !!r.sent;
  } catch { /* הסטטוס כבר נשמר; הצלמת תראה אותו בדשבורד */ }

  return NextResponse.json({ ok: true, mailed });
}
