# Launch posts — drafted, not sent

Four communities, four angles on the same honest pitch. None of these have been
posted anywhere. Pick which ones you want out, edit anything that doesn't sound
like you, and tell me whether you want to post them yourself or have me drive it
through your logged-in browser (I'll ask for that explicitly either way — publishing
to a public platform isn't something I do on a standing "go ahead").

---

## Show HN (news.ycombinator.com)

**Title:** Show HN: Fusebox – a spend-ceiling alert for solo OpenAI API users

**Body:**
I kept seeing people get blindsided by OpenAI bills — a retry loop left running, a
demo link shared wider than intended. Team observability tools (Helicone, Vantage)
exist, but they're built for a finance meeting, not a hobbyist who just wants a
warning email before $12 becomes $300.

Fusebox: set a monthly ceiling, connect an OpenAI Admin key scoped to `api.usage.read`
only (nothing else — can't touch billing, keys, or members), get emailed at 50/80/100%.
Runs on Cloudflare Workers + D1, checks every 6 hours.

Deliberately OpenAI-only for now — Claude's Console admin keys are currently
all-or-nothing (no scoped read-only option for individual accounts), so I didn't want
to ask for a key with more access than the pitch implies. Adding it once Anthropic
exposes the same kind of scoping.

Free while in early access: https://fusebox.sifatsrk.workers.dev

Would genuinely like feedback on whether the OpenAI-only limitation kills it for
people, or whether solo-API spend anxiety is a real enough problem to want this
even scoped down.

---

## r/OpenAI

**Title:** Built a free tool that emails you before your OpenAI bill blows past a number you set

**Body:**
Anyone else had a side project rack up a surprise bill because a loop retried
overnight or a demo link got shared further than expected? That happened to me
enough times that I built something for it.

Fusebox: you set a monthly $ ceiling, connect an OpenAI Admin key scoped to just
`api.usage.read` (it can't touch billing, other keys, or org members — checked
this carefully before building it), and it emails you at 50%, 80%, and 100% of
your ceiling. That's the whole product.

Free right now, early access, rough edges. Link: https://fusebox.sifatsrk.workers.dev

Mainly want to know: is this an actual problem for people here, or does everyone
already have this solved some other way? Happy to hear "this is pointless" too.

---

## r/LocalLLaMA

**Title:** For those of you still paying for hosted API access — a spend-ceiling alert tool

**Body:**
Know a lot of people here run local models for the bulk of things but still keep
an OpenAI key around for whatever local can't handle yet. Built a small free tool
for the part where that key quietly runs up a bill you didn't notice — set a
monthly ceiling, get emailed at 50/80/100% of it. Uses a key scoped to
`api.usage.read` only, so it's read-only by construction, not just by policy.

https://fusebox.sifatsrk.workers.dev — early access, OpenAI only for now (Claude's
admin keys don't support this kind of scoping yet for individual accounts, so I
didn't want to build that path with a key that has more access than it should).

Curious if this is actually useful to this crowd or if local-first means nobody
here has this problem in the first place.

---

## Indie Hackers

**Title:** Shipped a spend-alert tool for solo OpenAI users — here's the whole build, including the part I almost got wrong

**Body:**
Quick build-in-public post. The idea: solo devs using OpenAI's API get surprised
by bills (retry loops, shared demo links) — team tools like Helicone/Vantage exist
but are priced and built for a company, not a hobbyist.

Before writing any code I checked what kind of access key I'd actually need. OpenAI
lets you scope an Admin key to exactly `api.usage.read` and nothing else — genuinely
safe to ask a stranger for. Anthropic's equivalent (Claude Console admin keys) is
currently all-or-nothing for individual accounts — full org-admin access, no scoped
read-only option. That would've meant asking for way more trust than the product
needed, so Claude support is on hold until that changes on their end. Small thing,
but it's the kind of detail that either makes a tool trustworthy or makes it a
"why does this need THAT much access" red flag.

Stack: Cloudflare Workers + D1 (free tier), Resend for email (free tier). Zero
infra cost at this stage — earn before spend.

Live: https://fusebox.sifatsrk.workers.dev — genuinely want to know if this is a
real problem or a problem I invented. Roast it.
