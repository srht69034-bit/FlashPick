'use client';
import { useEffect, useRef, useState } from 'react';

// גריד "שורות מיושרות": כל תמונה שומרת על יחס הגובה-רוחב המקורי שלה
export default function Justified({ items, render, target = 250, gap = 8 }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const t = w && w < 600 ? 150 : target;
  const rows = []; let row = [], sum = 0;
  if (w) for (const it of items) {
    const r = it.ratio || 0.75;
    row.push({ it, r }); sum += r;
    if (sum * t + gap * (row.length - 1) >= w) { rows.push({ row, sum, full: true }); row = []; sum = 0; }
  }
  if (row.length) rows.push({ row, sum, full: false });

  return (
    <div ref={ref}>
      {rows.map((R, i) => {
        const avail = w - gap * (R.row.length - 1);
        const h = Math.min(R.full ? avail / R.sum : t, t * 1.9);
        return (
          <div key={i} style={{ display: 'flex', gap, marginBottom: gap, height: h }}>
            {R.row.map(({ it, r }) => (
              <div key={it.id} style={{ width: h * r, height: h, flex: 'none' }}>{render(it)}</div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
