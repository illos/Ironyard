import { Resend } from 'resend';
import type { Bindings } from '../types';

type SendMagicLinkArgs = {
  to: string;
  link: string;
  env: Bindings;
};

// If RESEND_API_KEY is unset, the function logs the link to the worker console
// and returns it so the caller can include it in a dev response. Phase 0 stays
// usable without a Resend account configured.
export async function sendMagicLinkEmail({
  to,
  link,
  env,
}: SendMagicLinkArgs): Promise<{ delivered: 'email' | 'console'; link?: string }> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    console.log(`[magic-link] (no Resend config) ${to} → ${link}`);
    return { delivered: 'console', link };
  }

  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: env.RESEND_FROM,
    to,
    subject: 'Your Ironyard sign-in link',
    text: `Click to sign in:\n\n${link}\n\nThis link is single-use and expires in 15 minutes. If you did not request it, ignore this email.`,
  });
  return { delivered: 'email' };
}
