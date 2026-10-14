import Link from 'next/link';

export default function Home() {
  return (
    <main className="page">
      <div className="authbox">
        <h1>בחירת תמונות, בלי בלגן</h1>
        <p className="mute">הצלמת מעלה גלריה, הלקוחה בוחרת ומאשרת, והסיכום מגיע למייל.</p>
        <p><Link className="btn pri" href="/studio">כניסה לאזור הצלמות</Link></p>
        <p className="mute">לקוחה? היכנסי דרך הקישור האישי שקיבלת מהצלמת.</p>
      </div>
    </main>
  );
}
