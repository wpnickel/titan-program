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
