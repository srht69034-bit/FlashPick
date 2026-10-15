import './globals.css';

export const metadata = { title: 'FlashPick — בחירת תמונות', robots: { index: false, follow: false } };

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
