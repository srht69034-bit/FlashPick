'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { useUser } from '@/lib/useUser';

export default function StudioLogin() {
  const router = useRouter();
  const user = useUser();
  useEffect(() => { if (user) router.replace('/studio'); }, [user, router]);
  return (
    <main className="page"><div className="authbox">
      <h1>אזור צלמות</h1>
      <p className="mute">כניסה או הרשמה</p>
      <AuthForm studio onDone={() => router.replace('/studio')} />
    </div></main>
  );
}
