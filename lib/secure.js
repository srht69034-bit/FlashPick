'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase, BUCKET } from './supabase';

// טעינת תמונות פרטיות עם ההזדהות של המשתמשת (Authorization header),
// ללא קישור ציבורי או חתום. התוצאה היא blob שקיים רק בלשונית הזו.
const cache = new Map();   // path -> blob URL
const pending = new Map(); // path -> Promise

export function loadImage(path) {
  if (cache.has(path)) return Promise.resolve(cache.get(path));
  if (!pending.has(path)) {
    pending.set(path, supabase.storage.from(BUCKET).download(path).then(
      ({ data, error }) => {
        pending.delete(path);
        if (error || !data) throw error || new Error('download failed');
        const u = URL.createObjectURL(data);
        cache.set(path, u);
        return u;
      },
      (e) => { pending.delete(path); throw e; }
    ));
  }
  return pending.get(path);
}

export function SecureImg({ path, ...rest }) {
  const ref = useRef(null);
  const [got, setGot] = useState(null);
  const src = (got && got.path === path ? got.url : null) || (path && cache.get(path)) || null;

  useEffect(() => {
    if (!path || src) return;
    let dead = false;
    const go = () => loadImage(path).then((url) => { if (!dead) setGot({ path, url }); }).catch(() => {});
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); go(); } }, { rootMargin: '700px' });
    if (ref.current) io.observe(ref.current);
    return () => { dead = true; io.disconnect(); };
  }, [path, src]);

  return src
    ? <img src={src} alt="" draggable={false} {...rest} />
    : <span ref={ref} style={{ display: 'block', width: '100%', height: '100%' }} />;
}

export function useSecureUrl(path) {
  const [got, setGot] = useState(null);
  useEffect(() => {
    if (!path) return;
    let dead = false;
    loadImage(path).then((url) => { if (!dead) setGot({ path, url }); }).catch(() => {});
    return () => { dead = true; };
  }, [path]);
  return got && got.path === path ? got.url : (path && cache.get(path)) || null;
}
