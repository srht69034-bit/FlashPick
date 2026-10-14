import { createClient } from '@supabase/supabase-js';

export const BUCKET = 'galleries';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'
);

// קישורים חתומים לתמונות פרטיות (תקפים שעה; נוצרים רק למי שמחוברת ויש לה הרשאה)
export async function signedUrls(paths) {
  const out = {};
  for (let i = 0; i < paths.length; i += 200) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths.slice(i, i + 200), 3600);
    (data || []).forEach((d) => { if (d.signedUrl) out[d.path] = d.signedUrl; });
  }
  return out;
}

export async function fetchPhotos(galleryId) {
  let all = [], from = 0;
  for (;;) {
    const { data, error } = await supabase.from('photos').select('*')
      .eq('gallery_id', galleryId).order('position').range(from, from + 999);
    if (error || !data?.length) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

export async function authedFetch(url, body) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(body),
  });
}
