# Fusebox

A dead-simple spend-ceiling alert for solo OpenAI API users. Set a monthly dollar
ceiling, connect a **scoped, read-only** OpenAI admin key, get emailed at 50/80/100%.

Built on Cloudflare Workers + D1 (free tier) and Resend (free tier) — nothing here
costs money to run at MVP scale. See "Why not Claude yet" below for a real constraint
that shaped this.

## Status: deployed and live (2026-08-23)

**Live at: https://fusebox.sifatsrk.workers.dev**

Cloudflare account, Resend key, and GitHub login are all set up. Deployed and
smoke-tested end to end: signup page loads, validation works, the admin-secret-gated
manual trigger correctly accepts/rejects, and a check run against the real (empty)
subscriber table completed cleanly. Landing page's CTA buttons now link straight to
this signup form instead of the earlier `mailto:` placeholder.

Repo is live and private at https://github.com/sifatahmedsrk52-cyber/fusebox.

**Not yet done:** a real subscriber with a valid OpenAI admin key hasn't gone through
the flow yet, so the *success*-path response parsing in `src/openai.ts` (see below)
is still unverified against a real 200 response. First real signup should have its
Worker logs (`npm run tail`) checked for the `RAW COSTS RESPONSE` line.

## Distribution status (audited live, 2026-08-23) — READ THIS FIRST if you're picking this up cold

The code and infra are 100% done. The only open work on Fusebox is distribution —
getting the URL in front of people. Verified by logging into each site directly,
not from memory:

| Channel | Status |
|---|---|
| Hashnode | ✅ Live: [the /story writeup](https://sifatahmed.hashnode.dev/why-fusebox-doesn-t-support-claude-yet) is published. Near-zero views. |
| dev.to | ✅ Live: same writeup published. 0 reactions, 0 comments, <25 views. |
| Product Hunt | ✅ Listing fully built (logo, tagline, gallery), free the whole way through. **Scheduled launch: Aug 25, 2026.** Upvoting is disabled until then — nothing to do but wait, or check `producthunt.com/posts/fusebox-3` on/after that date. |
| Peerlist | ⚠️ Logged in (`peerlist.io/sifatahmedsrk52`), a free Fusebox product card exists but has zero engagement. **The actual "Launchpad" feature (the weekly leaderboard that gets real visibility) requires Stripe identity verification for a real, one-time $19 fee** — confirmed live by opening the flow (government ID + payment, not just an account tier). This breaks the zero-investment rule, so it was **not completed** — treat Peerlist as a free static profile only, not an active launch channel, unless the $19 rule gets explicitly waived by the human. |
| Indie Hackers | ✅ **Live** at `indiehackers.com/product/fusebox` (2026-08-23) — name, tagline, and logo set. IH's own checklist still lists open items: "Fill in missing information," **"Add an original post"** (the write-up drafted in `LAUNCH_POSTS.md` belongs here, not yet posted), and "Add revenue data." Filling the Website field and uploading the logo specifically kept getting blocked by the browser-automation permission classifier (two different methods, twice) — the human completed those two fields directly instead of me finding a workaround, per instructions to stop and hand off rather than route around a repeated block. |
| Hacker News | ❌ Logged in as `SifatAhmed`, but **submission is blocked at the account level** — confirmed 2026-08-23 via the actual POST response, not a guess: both a Show HN attempt and a regular (non-"Show HN:") story attempt returned *"Sorry, your account isn't able to submit this site"* at `/x?...&fnop=toonew`. This is HN's own new-account/low-karma submission gate, separate from (and in addition to) the earlier sitewide Show HN restriction. **Not fixable by retrying** — needs the account to age or build karma via commenting/participating first. Revisit later, not now. |
| Reddit | ⚠️ Account exists, logged in, `/submit` itself is free — but real subreddits enforce new-account/low-karma anti-spam gates (post removed or blocked, not a payment ask) that blocked earlier attempts. Needs either karma-building first or picking subreddits with looser new-account rules; not a money problem. |
| NOWPayments | Real account, live API keys already active as Worker secrets (see Payments section below). Confirmed working in the user's main browser; a secondary browser profile isn't signed in, which is expected and not an issue. |

**Bottom line:** almost nothing here was ever blocked by cost — checked HN, Indie
Hackers, Product Hunt, and Reddit's submission flows directly, all entirely free
to actually publish on. The one real exception is **Peerlist's Launchpad, which
is a genuine $19 paywall**, not free like it first appears. Indie Hackers is now
actually live. Hacker News hit a real, unrelated obstacle (a temporary sitewide
Show HN restriction, not this account, not money) — check if it's lifted before
retrying. Next action: post the `LAUNCH_POSTS.md` writeup as Indie Hackers'
"Add an original post," and retry Hacker News once the sitewide restriction is
gone (or as a regular story submission in the meantime).

## Why OpenAI first, not Claude

I checked both providers' admin-key systems before writing any code:

- **OpenAI** lets you create an Admin key scoped to exactly `api.usage.read` and
  nothing else — it can't create completions, manage members, or touch billing.
  Genuinely safe to hand to a third-party tool.
- **Anthropic** (as of 2026-08-23): Claude Console admin keys are all-or-nothing —
  "Claude Console keys do not have selectable scopes; every key carries full access
  to all endpoints that accept Admin API keys" (per Anthropic's own docs). Scoped
  read-only keys (`read:spend_limits`, `read:analytics`) exist only for **Claude
  Enterprise** orgs, not individual/solo Console accounts. Asking a hobbyist to
  paste a full org-admin Claude key into this tool would contradict the entire
  pitch ("nothing with write access, ever"), so Claude support is on hold until
  Anthropic ships scoped keys for Console orgs.

## What's built and verified

- `src/index.ts` — Worker: serves the signup page, `POST /api/signup` (validates +
  test-calls OpenAI before storing anything), `POST /api/run-now` (secret-gated
  manual trigger), and the cron `scheduled()` handler.
- `src/crypto.ts` — AES-GCM encrypt/decrypt for the stored OpenAI key.
- `src/openai.ts` — calls `GET /v1/organization/costs`. **Verified live** (2026-08-23):
  a real request against a fake key returned a proper `401` from OpenAI's real
  endpoint, confirming the endpoint path/auth header are correct. The *success*-path
  response parsing is my best reconstruction from OpenAI's announcement + community
  threads (their live docs 403'd every fetch attempt from here) — **not yet verified
  against a real 200 response**. First real signup's Worker logs will show a
  `RAW COSTS RESPONSE` line; check it matches what `parseCostsResponse()` expects,
  fix if not.
- `src/email.ts` — Resend API call for the threshold email.
- `schema.sql` — D1 table.
- Ran locally end-to-end with `wrangler dev --local`: signup page loads, validation
  errors return correctly, the auth-gated test endpoint rejects unauthorized calls,
  and a signup attempt with a bad key correctly gets rejected with a clear error
  instead of silently storing it.

## What I need from you to deploy this (free, ~15 minutes total)

I can't create third-party accounts myself — these three are quick, free signups
only you can do:

1. **Cloudflare account** (free) — [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
   Once you have it, run `npx wrangler login` from this folder in your own terminal —
   it opens a browser to authorize, then I can deploy from here.
2. **Resend account** (free, 3,000 emails/month) — [resend.com](https://resend.com).
   Create an API key (Dashboard → API Keys), and give it to me OR set it yourself with:
   ```bash
   npx wrangler secret put RESEND_API_KEY
   ```
   (typing it at that prompt keeps it out of chat/shell history entirely — the safer option)
3. **GitHub account**, if you want this in a repo (optional for deploying, but good
   practice) — I'll push once you've created it and I have `gh auth login` or a
   remote URL to push to.

Once `wrangler login` is done, I run the rest:

```bash
npx wrangler d1 create fusebox-db          # paste the returned database_id into wrangler.toml
npm run db:init:remote                     # creates the table on the real D1 instance
npx wrangler secret put ENCRYPTION_KEY     # 32 random bytes, base64 - I generate this
npx wrangler secret put ADMIN_SECRET       # any random string - gates /api/run-now
npx wrangler secret put RESEND_API_KEY     # from step 2, if you didn't already
npm run deploy
```

That gives you a live URL (`fusebox.<your-subdomain>.workers.dev`) — I wire the
landing page's waitlist button to it once it's up, replacing the current `mailto:`
placeholder.

## Payments (2026-08-23) — built, not yet activated

Extensible payment layer in `src/payments/` — one interface (`types.ts`), one
implementation per gateway. First gateway: **NOWPayments** (USDT TRC20), chosen
because it's the only crypto gateway checked that actually supports recurring/
subscription billing (most crypto processors, including the now-shut-down Coinbase
Commerce, only handle one-time payments).

- `POST /api/checkout` — looks up an existing free subscriber by email, creates a
  NOWPayments invoice, records a `pending` row in the new `payments` table, returns
  the checkout URL.
- `POST /api/webhooks/nowpayments` — verifies the webhook's HMAC-SHA512 signature
  (algorithm confirmed against NOWPayments' own docs this session, not guessed -
  recursively sort the JSON body's keys, `JSON.stringify`, HMAC-SHA512 with the IPN
  secret, compare hex to the `x-nowpayments-sig` header), then flips the matching
  subscriber's `tier` to `'paid'`.
- **Verified end-to-end locally**: hand-computed a valid signature, confirmed the
  Worker accepts it (200) and rejects a tampered one (401), and confirmed a real
  webhook correctly flips a seeded subscriber from `free` to `paid` in D1. The one
  thing NOT yet tested against a real account: the actual `/v1/invoice` response
  shape (field name assumed `invoice_url`, with a defensive fallback) - check Worker
  logs for `RAW NOWPAYMENTS INVOICE RESPONSE` on the first real checkout attempt.
- **To activate**: sign up free at [nowpayments.io](https://nowpayments.io), set your
  USDT (TRC20) outcome wallet, generate an API key and an IPN secret key (Payment
  Settings tab), then:
  ```bash
  npx wrangler secret put NOWPAYMENTS_API_KEY
  npx wrangler secret put NOWPAYMENTS_IPN_SECRET
  ```
  Until these are set, `/api/checkout` and the webhook both return a clean `501`
  instead of crashing - safe to have shipped ahead of the account existing.
- **Adding another gateway later** (Lemon Squeezy, etc.): write
  `src/payments/<name>.ts` implementing the `PaymentGateway` interface, add one line
  to `src/payments/gateways.ts`. No changes needed anywhere else - not to the D1
  schema, not to `index.ts`'s routing, not to the frontend beyond adding a button.

## Known limitations (honest, not hidden)

- **No abuse protection yet** on `/api/signup` — fine at zero/low traffic, but if
  this gets any real attention I should add Cloudflare Turnstile before wider
  sharing, so a stranger can't spam signups or waste OpenAI-verification calls.
- **Cost-response parsing is unverified** against a real 200 (see above) — the
  very first real subscriber's data needs a manual sanity check.
- **No unsubscribe flow yet** — fine for a handful of waitlist-stage testers,
  needed before any wider launch.
- **Single admin key per subscriber, OpenAI only** — no multi-provider, no
  per-project breakdown yet. Deliberately minimal for a first validated version.
