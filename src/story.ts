export const STORY_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Why Fusebox doesn't support Claude yet</title>
<meta name="description" content="Before building a spend-alert tool for OpenAI API users, I checked whether Anthropic's admin keys could be scoped read-only the same way. They can't - here's what that meant for the product.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&family=Work+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --paper:#f2efe7; --paper-raised:#ffffff; --ink:#1d1a14; --ink-soft:#514c40;
    --steel:#8a8272; --line:#d8d0bd; --amber:#c97a1f; --safe:#2f7d51; --danger:#b6392f;
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:'Work Sans',sans-serif; line-height:1.6; }
  .wrap { max-width:640px; margin:0 auto; padding:56px 24px 90px; }
  a.back { font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--steel); text-decoration:none; }
  .kicker { font-family:'IBM Plex Mono',monospace; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:var(--amber); margin:26px 0 12px; }
  h1 { font-family:'Big Shoulders Display',sans-serif; font-weight:800; font-size:44px; line-height:1.02; margin:0 0 26px; }
  p { font-size:16.5px; color:var(--ink-soft); margin:0 0 20px; }
  p strong { color:var(--ink); font-weight:600; }
  code { font-family:'IBM Plex Mono',monospace; font-size:14px; background:var(--paper-raised); border:1px solid var(--line); padding:1px 6px; border-radius:3px; color:var(--ink); }
  blockquote { margin:26px 0; padding:16px 20px; border-left:3px solid var(--amber); background:var(--paper-raised); font-size:15px; color:var(--ink-soft); font-style:italic; }
  h2 { font-family:'Big Shoulders Display',sans-serif; font-weight:700; font-size:26px; margin:38px 0 14px; }
  .cta { margin-top:44px; padding:22px; border:1px solid var(--line); border-radius:6px; background:var(--paper-raised); }
  .cta a { font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:14px; text-transform:uppercase; letter-spacing:0.05em; color:var(--paper); background:var(--ink); text-decoration:none; padding:12px 20px; border-radius:4px; display:inline-block; margin-top:10px; }
</style>
</head>
<body>
<div class="wrap">
  <a class="back" href="/">&larr; fusebox.sifatsrk.workers.dev</a>
  <p class="kicker">Build notes</p>
  <h1>Why Fusebox doesn't support Claude yet</h1>

  <p>Fusebox emails you before your OpenAI bill blows past a number you set. Before writing any of that code, I spent an afternoon checking one thing: what kind of API key would I actually need to ask you for?</p>

  <p>That question mattered more than it sounds like it should. A tool that reads your spend needs some kind of credential from your account. The honest version of that credential is one that can <strong>only read</strong> - it can't touch billing, can't create or revoke other keys, can't add or remove people from your org. The dishonest version asks for more than it needs and hopes you don't check.</p>

  <h2>OpenAI: genuinely scoped</h2>
  <p>OpenAI lets you create an Admin key and restrict it to specific permissions per resource - None, Read, or Write. For usage and cost data specifically, that's a scope called <code>api.usage.read</code>. Grant only that, and the key can pull your spend numbers and do nothing else. That's exactly the shape of trust a tool like this should ask for, and it's why Fusebox is built on it.</p>

  <h2>Anthropic: not yet, for individual accounts</h2>
  <p>I checked the same thing for Claude, expecting a similar scoped option. Anthropic's own documentation says otherwise, for Claude Console (the product individual developers and small teams actually use):</p>
  <blockquote>"Claude Console keys do not have selectable scopes; every key carries full access to all endpoints that accept Admin API keys."</blockquote>
  <p>Scoped read-only keys do exist on Anthropic's side - <code>read:spend_limits</code>, <code>read:analytics</code> - but only for <strong>Claude Enterprise</strong> organizations, not individual Console accounts. For everyone else, the only key that can read usage data is one that can also manage your organization's members, create and revoke other people's API keys, and generally do anything an admin can do.</p>

  <p>Asking a solo developer to hand that over to a third-party tool, in service of a feature as small as "email me at 80% of my budget," is a bad trade. So Fusebox doesn't do it. Claude support is built and waiting - it's a small amount of code - but it stays off until Anthropic ships the same kind of scoping for individual accounts that OpenAI already has.</p>

  <h2>Why this is worth writing down</h2>
  <p>Most tools that ask for API access don't explain what they're actually asking for, and most users don't check. I'd rather the constraint be visible than quietly work around it. If you're building something similar and you've found a cleaner way to do the Claude side of this safely, I'd genuinely like to hear about it.</p>

  <div class="cta">
    <div>Fusebox is free, early access, OpenAI-only for now.</div>
    <a href="/">Set your ceiling &rarr;</a>
  </div>
</div>
</body>
</html>`;
