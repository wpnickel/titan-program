import "server-only";

const FROM = "Titan Program <titan@notify.sonitrol.co>";
const REPLY_TO = "titan@sonitrol.co";

async function send(to: string, subject: string, text: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, reply_to: REPLY_TO, subject, text }),
  });
  if (!res.ok) throw new Error(`Email failed (${res.status})`);
}

export function sendLoginCode(to: string, code: string) {
  return send(
    to,
    `Your Titan Program code: ${code}`,
    `Your Titan Program sign-in code is ${code}.\n\nIt expires in 10 minutes. If you did not try to sign in, you can ignore this email.`,
  );
}

export function sendInvite(to: string, firstName: string, link: string) {
  return send(
    to,
    "You're invited to the SNDA Sales Titan Program",
    `Hi ${firstName},\n\nYou have been invited to the SNDA Sales Titan Program. Use this link to set your password:\n\n${link}\n\nThe link works once and expires, so use it soon. After setting your password, sign in with your email and password. We will email you a 6-digit code each time you sign in on a new device.\n\nIf you were not expecting this, you can ignore this email.`,
  );
}

export function sendLateEntryAlert(to: string, message: string) {
  return send(to, "Late sale entered on a tally card", `${message}\n\nOpen the Audit page in the Titan Program to review it.`);
}
