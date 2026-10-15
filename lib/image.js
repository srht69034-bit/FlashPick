// דחיסה + סימן מים בצד הלקוח (בדפדפן של הצלמת). המקור לעולם לא עולה לשרת.
export async function makePreview(file, text, maxSide = 1400) {
  let bmp;
  try { bmp = await createImageBitmap(file, { resizeWidth: maxSide, resizeQuality: 'medium' }); }
  catch { bmp = await createImageBitmap(file); }

  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();

  if (text) {
    const fs = Math.max(16, Math.round(Math.min(w, h) / 14));
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.font = `600 ${fs}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,.30)';
    ctx.strokeStyle = 'rgba(0,0,0,.20)';
    ctx.lineWidth = fs / 14;
    const sx = ctx.measureText(text).width + fs * 2, sy = fs * 3.2, R = Math.hypot(w, h) / 2;
    let row = 0;
    for (let y = -R; y <= R; y += sy, row++)
      for (let x = -R; x <= R; x += sx) {
        const px = x + (row % 2 ? sx / 2 : 0);
        ctx.strokeText(text, px, y); ctx.fillText(text, px, y);
      }
    ctx.restore();
  }
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.72)); // JPEG: נתמך בכל הדפדפנים
  return { blob, w, h };
}

export async function runPool(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx], idx); }
  }));
}
