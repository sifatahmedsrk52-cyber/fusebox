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
  TURNSTILE_SECRET_KEY: string; // set via `wrangler secret put TURNSTILE_SECRET_KEY` - signup abuse protection
  LEMONSQUEEZY_API_KEY: string; // set via `wrangler secret put LEMONSQUEEZY_API_KEY`
  LEMONSQUEEZY_STORE_ID: string; // set via `wrangler secret put LEMONSQUEEZY_STORE_ID`
  LEMONSQUEEZY_VARIANT_ID: string; // set via `wrangler secret put LEMONSQUEEZY_VARIANT_ID` - the $7/mo product's variant
  LEMONSQUEEZY_WEBHOOK_SECRET: string; // set via `wrangler secret put LEMONSQUEEZY_WEBHOOK_SECRET`
}

const TURNSTILE_SITE_KEY = "0x4AAAAAAEZLSI2ckWLj8y1r"; // public, safe to embed client-side

async function verifyTurnstile(token: string, secretKey: string): Promise<boolean> {
  if (!token) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: secretKey, response: token }),
  });
  const data: any = await res.json().catch(() => ({}));
  return data?.success === true;
}

const PAID_TIER_CENTS = 700; // $7/mo

// Cron runs (scheduled()) have no request/origin to derive this from, unlike
// handleCheckout's url.origin - fixed since this Worker has one known domain.
const FUSEBOX_BASE_URL = "https://fusebox.sifatsrk.workers.dev";

// Free tier only gets told once the ceiling is actually blown - that's the
// baseline promise ("we'll email you"). Paid gets the early warnings too
// (50/80%), which is the part that actually lets you catch a runaway loop
// before it becomes a bad bill - the real reason to upgrade.
const FREE_THRESHOLDS: Array<50 | 80 | 100> = [100];
const PAID_THRESHOLDS: Array<50 | 80 | 100> = [50, 80, 100];

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
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
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
  .kicker { font-family:'IBM Plex Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:var(--amber); margin:0 0 10px; }
  .sub { color:var(--ink-soft); font-size:16px; margin:0 0 28px; max-width:48ch; line-height:1.5; }
  .mock { background:var(--paper-raised); border:1px solid var(--line); border-radius:6px; padding:16px 18px; margin:0 0 28px; font-family:'IBM Plex Mono',monospace; font-size:13px; }
  .mock .from { color:var(--steel); font-size:11px; margin-bottom:8px; }
  .mock .subj { color:var(--ink); font-weight:600; margin-bottom:10px; }
  .mock .bar { height:8px; background:var(--line); border-radius:4px; overflow:hidden; margin:10px 0; }
  .mock .bar-fill { height:100%; width:80%; background:var(--amber); }
  .mock .body { color:var(--ink-soft); }
  .pricing { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:0 0 28px; }
  .plan { background:var(--paper-raised); border:1px solid var(--line); border-radius:6px; padding:16px 18px; }
  .plan.paid { border-color:var(--ink); }
  .plan .tier { font-family:'IBM Plex Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); }
  .plan .price { font-family:'Big Shoulders Display',sans-serif; font-weight:800; font-size:26px; margin:4px 0 8px; }
  .plan ul { margin:0; padding-left:18px; font-size:13px; color:var(--ink-soft); line-height:1.7; }
  .trust { display:flex; gap:12px; align-items:flex-start; background:var(--paper-raised); border:1px solid var(--line); border-radius:6px; padding:16px 18px; margin:0 0 28px; font-size:13.5px; color:var(--ink-soft); line-height:1.6; }
  .trust b { color:var(--ink); }
  h2.formhead { font-family:'Big Shoulders Display',sans-serif; font-weight:800; font-size:24px; margin:44px 0 6px; }
</style>
</head>
<body>
<div class="wrap">
  <p class="kicker">Free · OpenAI API users</p>
  <h1>Know before it blows.</h1>
  <p class="sub">Set a monthly $ ceiling. Get emailed at 50%, 80%, and 100% of it — before a retry loop or a leaked key turns a $12 side project into a $300 surprise.</p>

  <div class="mock">
    <div class="from">Fusebox &lt;alerts@fusebox.dev&gt;</div>
    <div class="subj">You've hit 80% of your $50 ceiling</div>
    <div class="bar"><div class="bar-fill"></div></div>
    <div class="body">$40.10 spent this month. $9.90 left before you hit your limit.</div>
  </div>

  <div class="pricing">
    <div class="plan">
      <div class="tier">Free</div>
      <div class="price">$0</div>
      <ul><li>Emailed once you hit 100%</li><li>Unlimited months</li></ul>
    </div>
    <div class="plan paid">
      <div class="tier">Paid</div>
      <div class="price">$7<span style="font-size:14px;">/mo</span></div>
      <ul><li>Everything in Free</li><li>+ early warnings at 50% and 80%</li></ul>
    </div>
  </div>

  <div class="trust">
    <span>&#128274;</span>
    <div><b>The key we ask for can't spend a cent.</b> Scoped to <code style="background:var(--paper);padding:1px 5px;border-radius:3px;">api.usage.read</code> only — it can't touch billing, other keys, or your org's members. Worst case if it ever leaked: someone sees your usage numbers, nothing else.</div>
  </div>

  <h2 class="formhead">Get started — 3 fields, 2 minutes.</h2>
  <p class="lede">We check the key works before storing anything, then you're armed.</p>

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

    <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="onTurnstileToken" data-error-callback="onTurnstileError"></div>

    <button id="submit" type="submit" disabled>Loading...</button>
    <div id="msg"></div>
  </form>

  <div id="upgrade" class="steps" style="display:none;">
    <b>Free tier emails you once you've already hit your ceiling. Want the 50% and 80% early warnings too - the ones that actually let you catch a runaway loop before it becomes a bad bill?</b>
    <div style="margin-top:10px;">
      <button id="upgradeBtn" type="button" style="margin-top:0;">Upgrade - $7/mo</button>
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
  let turnstileToken = '';

  window.onTurnstileToken = function (token) {
    turnstileToken = token;
    btn.disabled = false;
    btn.textContent = 'Arm alert';
  };
  window.onTurnstileError = function () {
    msg.className = 'err';
    msg.textContent = 'Verification failed to load - refresh and try again.';
  };

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!turnstileToken) return;
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
          turnstileToken: turnstileToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      msg.className = 'ok';
      msg.textContent = "Armed. We'll email you once you hit your ceiling.";
      document.getElementById('upgrade').style.display = 'block';
      document.getElementById('upgrade').dataset.email = document.getElementById('email').value;
      f.reset();
    } catch (err) {
      msg.className = 'err';
      msg.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Arm alert';
      if (window.turnstile) { turnstile.reset(); turnstileToken = ''; btn.disabled = true; }
    }
  });

  document.getElementById('upgradeBtn').addEventListener('click', async () => {
    const upgradeBtn = document.getElementById('upgradeBtn');
    const upgradeMsg = document.getElementById('upgradeMsg');
    const email = document.getElementById('upgrade').dataset.email;
    upgradeBtn.disabled = true;
    upgradeMsg.textContent = '';
    try {
      // Prefer card/PayPal via Lemon Squeezy - crypto-only checkout is real
      // friction for most people. Falls back to NOWPayments (crypto)
      // automatically until Lemon Squeezy secrets are set, so this starts
      // working the moment they're configured with no frontend redeploy.
      let res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, gateway: 'lemonsqueezy' }),
      });
      if (res.status === 501) {
        res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, gateway: 'nowpayments' }),
        });
      }
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
  let body: { email?: string; ceiling?: string; key?: string; turnstileToken?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Malformed request." }, 400);
  }

  const turnstileOk = await verifyTurnstile(body.turnstileToken || "", env.TURNSTILE_SECRET_KEY);
  if (!turnstileOk) return json({ error: "Verification failed. Refresh and try again." }, 400);

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
  const unsubscribeToken = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO subscribers (id, email, provider, encrypted_key, iv, ceiling_cents, created_at, unsubscribe_token)
     VALUES (?, ?, 'openai', ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      email,
      ciphertext,
      iv,
      Math.round(ceilingDollars * 100),
      new Date().toISOString(),
      unsubscribeToken,
    )
    .run();

  return json({ ok: true });
}

async function handleUnsubscribe(req: Request, env: Env, url: URL): Promise<Response> {
  const token = url.searchParams.get("token") || "";
  if (!token) return new Response("Missing token.", { status: 400 });

  const result = await env.DB.prepare(
    `UPDATE subscribers SET active = 0 WHERE unsubscribe_token = ? AND active = 1`,
  )
    .bind(token)
    .run();

  const found = (result.meta?.changes ?? 0) > 0;
  return new Response(
    found
      ? "You're unsubscribed. No more Fusebox emails will be sent to this address."
      : "That unsubscribe link is invalid or already used.",
    { status: found ? 200 : 404, headers: { "content-type": "text/plain;charset=utf-8" } },
  );
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

  let secrets: Record<string, string> | undefined;
  if (gatewayName === "nowpayments" && env.NOWPAYMENTS_API_KEY) {
    secrets = { apiKey: env.NOWPAYMENTS_API_KEY };
  } else if (gatewayName === "lemonsqueezy" && env.LEMONSQUEEZY_API_KEY && env.LEMONSQUEEZY_STORE_ID && env.LEMONSQUEEZY_VARIANT_ID) {
    secrets = {
      apiKey: env.LEMONSQUEEZY_API_KEY,
      storeId: env.LEMONSQUEEZY_STORE_ID,
      variantId: env.LEMONSQUEEZY_VARIANT_ID,
    };
  }
  if (!secrets) return json({ error: `${gatewayName} isn't configured yet.` }, 501);

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
      secrets,
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

  const secret =
    gatewayName === "nowpayments"
      ? env.NOWPAYMENTS_IPN_SECRET
      : gatewayName === "lemonsqueezy"
        ? env.LEMONSQUEEZY_WEBHOOK_SECRET
        : undefined;
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
      const thresholds = row.tier === "paid" ? PAID_THRESHOLDS : FREE_THRESHOLDS;
      const crossed = thresholds.filter((t) => pct >= t && t > notifiedThreshold);
      const highest = crossed.length ? crossed[crossed.length - 1] : null;

      if (highest) {
        await sendThresholdEmail({
          resendApiKey: env.RESEND_API_KEY,
          to: row.email,
          threshold: highest,
          spentCents: totalCents,
          ceilingCents: row.ceiling_cents,
          unsubscribeUrl: `${FUSEBOX_BASE_URL}/api/unsubscribe?token=${row.unsubscribe_token}`,
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
    if (url.pathname === "/api/unsubscribe" && req.method === "GET") {
      return handleUnsubscribe(req, env, url);
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
