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

**Not yet done:** a real subscriber with a valid OpenAI admin key hasn't gone through
the flow yet, so the *success*-path response parsing in `src/openai.ts` (see below)
is still unverified against a real 200 response. First real signup should have its
Worker logs (`npm run tail`) checked for the `RAW COSTS RESPONSE` line. Repo is not
yet pushed to GitHub — say the word and I'll init + push.

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
