export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextResponse } from 'next/server';
import { admin } from '@/lib/server';

// רץ אוטומטית פעם ביום (vercel.json):
//  1) Keep-Alive: שאילתה קטנה למסד הנתונים, כדי ש-Supabase לא ישעה אותו בגלל חוסר פעילות
//  2) מחיקה לצמיתות של גלריות (וקבצי התמונות) שחלף חודש מיצירתן
export async function GET(req) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = admin();
  await db.from('profiles').select('id').limit(1);

  const { data: old } = await db.from('galleries').select('id').lt('expires_at', new Date().toISOString());
  let deleted = 0;
  for (const g of old || []) {
    for (let i = 0; i < 50; i++) {
      const { data: files } = await db.storage.from('galleries').list(g.id, { limit: 1000 });
      if (!files?.length) break;
      const { error } = await db.storage.from('galleries').remove(files.map((f) => `${g.id}/${f.name}`));
      if (error) break;
    }
    const { error } = await db.from('galleries').delete().eq('id', g.id);
    if (!error) deleted++;
  }
  return NextResponse.json({ ok: true, deleted });
}
