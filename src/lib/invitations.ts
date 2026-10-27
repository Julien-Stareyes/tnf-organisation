import "server-only";
import { createHash, randomBytes } from "node:crypto";

// Le lien contient le token en clair ; la base n'en stocke que l'empreinte SHA-256.

export function generateInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function inviteUrl(token: string) {
  return `${siteUrl()}/invite/${token}`;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Envoie l'invitation via l'API Resend. Renvoie false si l'envoi n'est pas configuré ou échoue. */
export async function sendInviteEmail({ to, inviterName, url }: { to: string; inviterName: string; url: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return false;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;background:#111114;color:#ececf1;border-radius:12px">
      <div style="width:48px;height:48px;border-radius:14px;background:#d4ff3a;color:#0b0b0d;font-weight:900;font-size:13px;line-height:48px;text-align:center">TNF</div>
      <h1 style="font-size:20px;margin:24px 0 8px">Tu es invité·e sur Organisation TNF</h1>
      <p style="color:#a1a1ad;line-height:1.5">${escapeHtml(inviterName)} t'invite à rejoindre l'espace de travail des équipes The New Face.</p>
      <a href="${url}" style="display:inline-block;margin:16px 0;padding:12px 20px;background:#d4ff3a;color:#0b0b0d;font-weight:700;border-radius:8px;text-decoration:none">Rejoindre</a>
      <p style="color:#6c6c78;font-size:12px">Ce lien expire dans 7 jours. Si tu ne t'attendais pas à cette invitation, ignore ce mail.</p>
    </div>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: "Invitation — Organisation TNF", html }),
  });
  return response.ok;
}
