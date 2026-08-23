// Sends threshold alerts via Resend (https://resend.com). Free tier: 3,000
// emails/month, 100/day - plenty for an MVP's worth of subscribers, and the
// shared `onboarding@resend.dev` sender works with zero domain setup, so
// this needs nothing beyond a free Resend account + API key.

export async function sendThresholdEmail(opts: {
  resendApiKey: string;
  to: string;
  threshold: 50 | 80 | 100;
  spentCents: number;
  ceilingCents: number;
}): Promise<void> {
  const spent = (opts.spentCents / 100).toFixed(2);
  const ceiling = (opts.ceilingCents / 100).toFixed(2);
  const pct = opts.threshold;

  const subject =
    pct >= 100
      ? `Fusebox: you've hit your $${ceiling} ceiling`
      : `Fusebox: you're at ${pct}% of your $${ceiling} ceiling`;

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <p style="font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: #c97a1f; margin: 0 0 8px;">Fusebox alert</p>
      <h1 style="font-size: 26px; margin: 0 0 16px;">$${spent} of $${ceiling} spent this month</h1>
      <p style="font-size: 15px; color: #514c40; line-height: 1.5;">
        That's ${pct}% of the ceiling you set. ${
          pct >= 100
            ? "You're at or past it - worth checking what's driving spend before the month rolls further."
            : "Nothing to do yet - just the heads-up you asked for."
        }
      </p>
      <p style="font-size: 12px; color: #8a8272; margin-top: 32px;">
        You're getting this because you signed up for Fusebox alerts. This is a pre-launch MVP -
        reply to this email if something looks wrong.
      </p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Fusebox <onboarding@resend.dev>",
      to: [opts.to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
}
