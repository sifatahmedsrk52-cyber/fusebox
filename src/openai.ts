// Pulls this-month-to-date spend from OpenAI's Costs API.
//
// IMPORTANT - response shape is UNVERIFIED against a live account: I built this
// from OpenAI's Dec 2024 announcement + community threads (WebFetch to the live
// docs page 403'd from this environment), not an observed request/response pair.
// The known-solid facts: endpoint is GET /v1/organization/costs, it needs an
// Admin API key with the `api.usage.read` scope (and only that scope - see
// README for why that matters), and results are bucketed with a `results[]`
// array per bucket carrying an `amount` object. The exact field name/currency
// units below are my best reconstruction, not confirmed. FIRST REAL RUN: check
// the Worker logs (`npm run tail`) for the "RAW COSTS RESPONSE" line and fix
// parseCostsResponse() below if the real shape differs.

export interface CostCheckResult {
  totalCents: number;
  raw: unknown;
}

function startOfCurrentMonthUnix(): number {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0);
  return Math.floor(start / 1000);
}

export function currentPeriodKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseCostsResponse(json: any): number {
  // Walk every bucket's results[] and sum amount.value, converting dollars -> cents.
  // Falls back to scanning for any {amount: {value: number}} shape anywhere in the
  // payload if the top-level `data` shape doesn't match what we expect.
  let totalDollars = 0;
  const buckets = Array.isArray(json?.data) ? json.data : [];
  for (const bucket of buckets) {
    const results = Array.isArray(bucket?.results) ? bucket.results : [];
    for (const r of results) {
      const v = r?.amount?.value;
      if (typeof v === "number") totalDollars += v;
    }
  }
  if (totalDollars === 0 && buckets.length === 0) {
    // Unexpected shape - try a shallow recursive scan so we at least don't
    // silently report $0 forever without a signal something's wrong.
    const found: number[] = [];
    const scan = (node: any, depth: number) => {
      if (depth > 6 || node == null) return;
      if (typeof node === "object") {
        if (typeof node.value === "number" && node.currency) found.push(node.value);
        for (const k in node) scan(node[k], depth + 1);
      }
    };
    scan(json, 0);
    totalDollars = found.reduce((a, b) => a + b, 0);
  }
  return Math.round(totalDollars * 100);
}

export async function fetchMonthToDateCostCents(
  adminApiKey: string,
  logRaw = false,
): Promise<CostCheckResult> {
  const start = startOfCurrentMonthUnix();
  const url = `https://api.openai.com/v1/organization/costs?start_time=${start}&limit=180`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${adminApiKey}`,
      "User-Agent": "Fusebox/0.1.0 (spend-alert MVP, pre-launch)",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI costs API ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  if (logRaw) console.log("RAW COSTS RESPONSE", JSON.stringify(json).slice(0, 2000));

  return { totalCents: parseCostsResponse(json), raw: json };
}
