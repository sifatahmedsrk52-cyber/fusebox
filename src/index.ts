import { encryptSecret, decryptSecret } from "./crypto";
import { fetchMonthToDateCostCents, currentPeriodKey } from "./openai";
import { sendThresholdEmail } from "./email";
import { STORY_PAGE } from "./story";
import { getGateway } from "./payments/gateways";

export interface Env {
  DB: D1Database;
  ENCRYPTION_KEY: string; // base64, set via `wrangler secret put ENCRYPTION_KEY`
  RESEND_API_KEY: string; // set via `wrangler secret put RESEND_API_KEY`
  ADMIN_SECRET: string; // set via `wrangler secret put ADMIN_SECRET` - gates /api/run-now
  NOWPAYMENTS_API_KEY: string; // set via `wrangler secret put NOWPAYMENTS_API_KEY`
  NOWPAYMENTS_IPN_SECRET: string; // set via `wrangler secret put NOWPAYMENTS_IPN_SECRET`
}

const PAID_TIER_CENTS = 700; // $7/mo

const THRESHOLDS: Array<50 | 80 | 100> = [50, 80, 100];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const SIGNUP_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fusebox — Set your ceiling</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&family=Work+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --paper:#f2efe7; --paper-raised:#ffffff; --ink:#1d1a14; --ink-soft:#514c40;
    --steel:#8a8272; --line:#d8d0bd; --amber:#c97a1f; --safe:#2f7d51; --danger:#b6392f;
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:'Work Sans',sans-serif; }
  .wrap { max-width:560px; margin:0 auto; padding:56px 24px 80px; }
  a.back { font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--steel); text-decoration:none; }
  h1 { font-family:'Big Shoulders Display',sans-serif; font-weight:800; font-size:40px; margin:18px 0 8px; }
  p.lede { color:var(--ink-soft); font-size:15px; margin:0 0 32px; max-width:46ch; }
  label { display:block; font-family:'IBM Plex Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:var(--steel); margin:22px 0 8px; }
  input { width:100%; font-family:'IBM Plex Mono',monospace; font-size:15px; padding:13px 14px; border:1px solid var(--line); border-radius:4px; background:var(--paper-raised); color:var(--ink); }
  input:focus { outline:2px solid var(--ink); outline-offset:2px; }
  .hint { font-size:12.5px; color:var(--steel); margin-top:6px; line-height:1.5; }
  .hint b { color:var(--ink); }
  button { margin-top:30px; width:100%; font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:14px; text-transform:uppercase; letter-spacing:0.06em; color:var(--paper); background:var(--ink); border:none; padding:16px; border-radius:4px; cursor:pointer; }
  button:disabled { opacity:0.5; cursor:default; }
  #msg { margin-top:16px; font-size:14px; font-family:'IBM Plex Mono',monospace; }
  #msg.err { color:var(--danger); }
  #msg.ok { color:var(--safe); }
  .steps { background:var(--paper-raised); border:1px solid var(--line); border-radius:6px; padding:18px 20px; margin:26px 0; font-size:13.5px; color:var(--ink-soft); }
  .steps ol { margin:8px 0 0; padding-left:18px; }
  .steps li { margin:4px 0; }
  .steps code { background:var(--paper); padding:1px 5px; border-radius:3px; font-family:'IBM Plex Mono',monospace; font-size:12.5px; }
</style>
</head>
<body>
<div class="wrap">
  <a class="back" href="javascript:history.back()">&larr; back</a>
  <h1>Set your ceiling.</h1>
  <p class="lede">Three fields. We check the key works before storing anything, then you're armed.</p>

  <div class="steps">
    <b>Before you paste a key:</b> create a scoped OpenAI Admin key so we can only ever <i>read</i>, never spend or manage anything.
    <ol>
      <li>Go to <code>platform.openai.com/settings/organization/admin-keys</code></li>
      <li>Create key &rarr; grant <b>only</b> the <code>api.usage.read</code> scope</li>
      <li>Leave every other scope (members, projects, api keys) unchecked</li>
    </ol>
  </div>

  <form id="f">
    <label for="email">Email</label>
    <input id="email" name="email" type="email" required placeholder="you@example.com">

    <label for="ceiling">Monthly ceiling (USD)</label>
    <input id="ceiling" name="ceiling" type="number" min="1" step="0.01" required placeholder="50">

    <label for="key">OpenAI admin key <span style="text-transform:none">(scoped to api.usage.read only)</span></label>
    <input id="key" name="key" type="password" required placeholder="sk-admin-...">
    <div class="hint">Encrypted at rest. Used only to call the read-only costs endpoint on a schedule. Never used to make model requests, never shared.</div>

    <button id="submit" type="submit">Arm alert</button>
    <div id="msg"></div>
  </form>

  <div id="upgrade" class="steps" style="display:none;">
    <b>Want unlimited projects, all three thresholds, and full history?</b>
    <div style="margin-top:10px;">
      <button id="upgradeBtn" type="button" style="margin-top:0;">Upgrade - $7/mo, pay with crypto</button>
    </div>
    <div id="upgradeMsg" style="margin-top:10px; font-family:'IBM Plex Mono',monospace; font-size:13px;"></div>
  </div>

  <p style="margin-top:40px; font-size:13px; color:var(--steel); font-family:'IBM Plex Mono',monospace;">
    <a href="/story" style="color:var(--steel);">Why Fusebox doesn't support Claude yet &rarr;</a>
  </p>

  <a href="https://www.producthunt.com/posts/fusebox-3?utm_source=badge-featured&#0038;utm_medium=badge&#0038;utm_souce=badge-fusebox-3" target="_blank" style="display:inline-block; margin-top:24px;">
    <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1229652&theme=light" alt="Fusebox - Spend-ceiling alerts for solo OpenAI API users | Product Hunt" style="width:250px;height:54px;" width="250" height="54" />
  </a>
</div>
<script>
  const f = document.getElementById('f');
  const msg = document.getElementById('msg');
  const btn = document.getElementById('submit');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = 'Checking key...';
    msg.className = ''; msg.textContent = '';
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('email').value,
          ceiling: document.getElementById('ceiling').value,
          key: document.getElementById('key').value,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      msg.className = 'ok';
      msg.textContent = "Armed. We'll email you at 50%, 80%, and 100% of your ceiling.";
      document.getElementById('upgrade').style.display = 'block';
      document.getElementById('upgrade').dataset.email = document.getElementById('email').value;
      f.reset();
    } catch (err) {
      msg.className = 'err';
      msg.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Arm alert';
    }
  });

  document.getElementById('upgradeBtn').addEventListener('click', async () => {
    const upgradeBtn = document.getElementById('upgradeBtn');
    const upgradeMsg = document.getElementById('upgradeMsg');
    const email = document.getElementById('upgrade').dataset.email;
    upgradeBtn.disabled = true;
    upgradeMsg.textContent = '';
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, gateway: 'nowpayments' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      window.location.href = data.checkoutUrl;
    } catch (err) {
      upgradeMsg.style.color = 'var(--danger)';
      upgradeMsg.textContent = err.message;
      upgradeBtn.disabled = false;
    }
  });
</script>
</body>
</html>`;

async function handleSignup(req: Request, env: Env): Promise<Response> {
  let body: { email?: string; ceiling?: string; key?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Malformed request." }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  const ceilingDollars = Number(body.ceiling);
  const apiKey = (body.key || "").trim();

  if (!isValidEmail(email)) return json({ error: "That email doesn't look right." }, 400);
  if (!Number.isFinite(ceilingDollars) || ceilingDollars <= 0)
    return json({ error: "Ceiling must be a positive number." }, 400);
  if (!apiKey) return json({ error: "Paste your OpenAI admin key." }, 400);

  // Verify the key actually works and is readable BEFORE storing anything -
  // catches a wrongly-scoped or mistyped key immediately instead of days later.
  try {
    await fetchMonthToDateCostCents(apiKey, true);
  } catch (err: any) {
    return json(
      {
        error:
          "Couldn't read costs with that key. Check it has the api.usage.read scope and no typos.",
        detail: String(err?.message || err).slice(0, 200),
      },
      400,
    );
  }

  const { ciphertext, iv } = await encryptSecret(apiKey, env.ENCRYPTION_KEY);
  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO subscribers (id, email, provider, encrypted_key, iv, ceiling_cents, created_at)
     VALUES (?, ?, 'openai', ?, ?, ?, ?)`,
  )
    .bind(id, email, ciphertext, iv, Math.round(ceilingDollars * 100), new Date().toISOString())
    .run();

  return json({ ok: true });
}

async function handleCheckout(req: Request, env: Env, url: URL): Promise<Response> {
  let body: { email?: string; gateway?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Malformed request." }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  const gatewayName = (body.gateway || "").trim();
  if (!isValidEmail(email)) return json({ error: "That email doesn't look right." }, 400);

  const gateway = getGateway(gatewayName);
  if (!gateway) return json({ error: `Unknown payment gateway: ${gatewayName}` }, 400);

  const apiKeyEnvVar =
    gatewayName === "nowpayments" ? env.NOWPAYMENTS_API_KEY : undefined;
  if (!apiKeyEnvVar) return json({ error: `${gatewayName} isn't configured yet.` }, 501);

  const subscriber = await env.DB.prepare(`SELECT id FROM subscribers WHERE email = ? AND active = 1`)
    .bind(email)
    .first<{ id: string }>();
  if (!subscriber) {
    return json({ error: "Sign up for the free plan first, then upgrade from the same email." }, 404);
  }

  const paymentId = crypto.randomUUID();

  let result;
  try {
    result = await gateway.createCheckout(
      {
        subscriberId: subscriber.id,
        email,
        amountCents: PAID_TIER_CENTS,
        currency: "usd",
        webhookUrl: `${url.origin}/api/webhooks/${gatewayName}`,
        successUrl: `${url.origin}/?upgraded=1`,
      },
      apiKeyEnvVar,
    );
  } catch (err: any) {
    console.error(`checkout creation failed for ${email} via ${gatewayName}:`, err);
    return json({ error: "Couldn't start checkout. Try again in a moment." }, 502);
  }

  await env.DB.prepare(
    `INSERT INTO payments (id, subscriber_id, gateway, external_id, status, amount_cents, currency, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?, 'usd', ?)`,
  )
    .bind(paymentId, subscriber.id, gatewayName, result.externalId, PAID_TIER_CENTS, new Date().toISOString())
    .run();

  return json({ checkoutUrl: result.checkoutUrl });
}

async function handlePaymentWebhook(req: Request, env: Env, gatewayName: string): Promise<Response> {
  const gateway = getGateway(gatewayName);
  if (!gateway) return new Response("Unknown gateway", { status: 404 });

  const secret = gatewayName === "nowpayments" ? env.NOWPAYMENTS_IPN_SECRET : undefined;
  if (!secret) return new Response("Not configured", { status: 501 });

  const rawBody = await req.text();
  const result = await gateway.verifyWebhook(req, rawBody, secret);
  if (!result) return new Response("Invalid signature", { status: 401 });

  const payment = await env.DB.prepare(
    `SELECT id, subscriber_id FROM payments WHERE gateway = ? AND external_id = ?`,
  )
    .bind(gatewayName, result.externalId)
    .first<{ id: string; subscriber_id: string }>();

  if (!payment) {
    console.error(`webhook for unknown payment: ${gatewayName}/${result.externalId}`);
    return new Response("OK", { status: 200 }); // ack anyway - nothing to retry
  }

  await env.DB.prepare(`UPDATE payments SET status = ?, raw_webhook = ? WHERE id = ?`)
    .bind(result.status, JSON.stringify(result.raw).slice(0, 4000), payment.id)
    .run();

  if (result.status === "paid") {
    await env.DB.prepare(`UPDATE payments SET paid_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), payment.id)
      .run();
    await env.DB.prepare(`UPDATE subscribers SET tier = 'paid' WHERE id = ?`)
      .bind(payment.subscriber_id)
      .run();
  }

  return new Response("OK", { status: 200 });
}

async function runChecks(env: Env): Promise<void> {
  const period = currentPeriodKey();
  const { results } = await env.DB.prepare(
    `SELECT * FROM subscribers WHERE active = 1`,
  ).all<any>();

  for (const row of results ?? []) {
    try {
      const apiKey = await decryptSecret(row.encrypted_key, row.iv, env.ENCRYPTION_KEY);
      const { totalCents } = await fetchMonthToDateCostCents(apiKey);

      // Reset the notified-threshold watermark when the month rolls over.
      const notifiedThreshold = row.last_notified_period === period ? row.last_notified_threshold : 0;

      const pct = (totalCents / row.ceiling_cents) * 100;
      const crossed = THRESHOLDS.filter((t) => pct >= t && t > notifiedThreshold);
      const highest = crossed.length ? crossed[crossed.length - 1] : null;

      if (highest) {
        await sendThresholdEmail({
          resendApiKey: env.RESEND_API_KEY,
          to: row.email,
          threshold: highest,
          spentCents: totalCents,
          ceilingCents: row.ceiling_cents,
        });
        await env.DB.prepare(
          `UPDATE subscribers SET last_notified_threshold = ?, last_notified_period = ?, last_checked_at = ?, last_error = NULL WHERE id = ?`,
        )
          .bind(highest, period, new Date().toISOString(), row.id)
          .run();
      } else {
        await env.DB.prepare(
          `UPDATE subscribers SET last_checked_at = ?, last_error = NULL WHERE id = ?`,
        )
          .bind(new Date().toISOString(), row.id)
          .run();
      }
    } catch (err: any) {
      console.error(`check failed for ${row.id}:`, err);
      await env.DB.prepare(`UPDATE subscribers SET last_error = ?, last_checked_at = ? WHERE id = ?`)
        .bind(String(err?.message || err).slice(0, 300), new Date().toISOString(), row.id)
        .run();
    }
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/" && req.method === "GET") {
      return new Response(SIGNUP_PAGE, { headers: { "content-type": "text/html;charset=utf-8" } });
    }
    if (url.pathname === "/story" && req.method === "GET") {
      return new Response(STORY_PAGE, { headers: { "content-type": "text/html;charset=utf-8" } });
    }
    if (url.pathname === "/api/signup" && req.method === "POST") {
      return handleSignup(req, env);
    }
    if (url.pathname === "/api/checkout" && req.method === "POST") {
      return handleCheckout(req, env, url);
    }
    const webhookMatch = url.pathname.match(/^\/api\/webhooks\/([a-z]+)$/);
    if (webhookMatch && req.method === "POST") {
      return handlePaymentWebhook(req, env, webhookMatch[1]);
    }
    if (url.pathname === "/api/run-now" && req.method === "POST") {
      // Manual trigger for testing during setup - hit it once after signing up
      // instead of waiting up to 6h for the next cron tick. Gated behind
      // ADMIN_SECRET so it isn't a public "spam everyone's inbox" button.
      if (req.headers.get("x-admin-secret") !== env.ADMIN_SECRET) {
        return json({ error: "Not authorized." }, 401);
      }
      await runChecks(env);
      return json({ ok: true, ran: true });
    }
    return new Response("Not found", { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runChecks(env));
  },
};
