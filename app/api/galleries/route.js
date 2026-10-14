export const dynamic = 'force-dynamic';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { admin, userFromRequest, sendMail, esc } from '@/lib/server';

const fail = (error, status) => NextResponse.json({ error }, { status });

// יצירת גלריה + חשבון לקוחה (מייל + סיסמה אישית) + קישור ייחודי
export async function POST(req) {
  const user = await userFromRequest(req);
  if (!user) return fail('לא מחוברת', 401);

  const db = admin();
  const { data: me } = await db.from('profiles').select('role,full_name').eq('id', user.id).single();
  if (me?.role !== 'photographer') return fail('אין הרשאה', 403);

  const b = await req.json();
  const email = String(b.clientEmail || '').trim().toLowerCase();
  const title = String(b.title || '').trim();
  const quota = parseInt(b.quota, 10);
  const password = String(b.password || '').trim() || crypto.randomBytes(9).toString('base64url');
  if (!email || !title || !(quota > 0)) return fail('חסרים פרטים', 400);
  if (password.length < 8) return fail('הסיסמה חייבת להכיל לפחות 8 תווים', 400);

  // לקוחה קיימת (אותו מייל) -> משתמשים בחשבון ומעדכנים סיסמה. צלמת לא תהפוך ללקוחה.
  let clientId;
  const { data: ex } = await db.from('profiles').select('id,role').eq('email', email).maybeSingle();
  if (ex) {
    if (ex.role !== 'client') return fail('המייל הזה שייך לחשבון צלמת', 409);
    clientId = ex.id;
    const { error } = await db.auth.admin.updateUserById(clientId, { password });
    if (error) return fail(error.message, 500);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { role: 'client', full_name: b.clientName || null },
    });
    if (error) return fail(error.message, 400);
    clientId = data.user.id;
  }

  const { data: g, error } = await db.from('galleries').insert({
    photographer_id: user.id, client_id: clientId, title,
    client_name: b.clientName || null, client_email: email, quota,
  }).select().single();
  if (error) return fail(error.message, 500);

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const link = `${origin}/g/${g.id}`;

  let mail = 'skipped';
  if (b.sendEmail) {
    try {
      const r = await sendMail({
        to: email, subject: `הגלריה שלך מוכנה — ${title}`,
        html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7">
          <p>שלום ${esc(b.clientName || '')},</p>
          <p>הגלריה "${esc(title)}" מוכנה לבחירה (עד ${quota} תמונות).</p>
          <p><a href="${link}">לכניסה לגלריה</a></p>
          <p>מייל: <b>${esc(email)}</b><br>סיסמה: <b dir="ltr">${esc(password)}</b></p></div>`,
      });
      mail = r.sent ? 'sent' : 'skipped';
    } catch { mail = 'failed'; }
  }
  return NextResponse.json({ id: g.id, link, email, password, mail });
}
