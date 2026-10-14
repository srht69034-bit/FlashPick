import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

export const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

export async function userFromRequest(req) {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  if (!token) return null;
  const { data } = await admin().auth.getUser(token);
  return data?.user || null;
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function sendMail({ to, subject, html }) {
  if (!process.env.SMTP_USER) return { skipped: true };
  const port = Number(process.env.SMTP_PORT || 465);
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await t.sendMail({ from: `"${process.env.STUDIO_NAME || 'Studio'}" <${process.env.SMTP_USER}>`, to, subject, html });
  return { sent: true };
}
