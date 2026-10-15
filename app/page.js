import Link from 'next/link';

export default function Home() {
  return (
    <main className="page">
      <div className="authbox">
        <span className="brand"><i />FlashPick</span>
        <h1>בחירת תמונות, בלי בלגן</h1>
        <p className="mute">הצלמת מעלה גלריה, הלקוחה בוחרת ומאשרת, והסיכום מגיע ישר למייל.</p>
        <p><Link className="btn pri" href="/studio">כניסה לאזור הצלמות</Link></p>
        <p className="mute small">לקוחה? היכנסי דרך הקישור האישי שקיבלת מהצלמת.</p>
      </div>
    </main>
  );
}
