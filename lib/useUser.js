'use client';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// undefined = טוען, null = לא מחוברת
export function useUser() {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);
  return user;
}
