// NOWPayments (crypto/USDT) gateway. Docs verified live this session against
// their own help center + Postman collection (nowpayments.zendesk.com,
// documenter.getpostman.com/view/7907941) - not guessed. Two things below are
// still UNVERIFIED against a real account, since testing needs a real API key:
// the exact field name for the checkout URL in the /invoice response (assumed
// `invoice_url`, with a defensive fallback scan), and the full set of
// `payment_status` values NOWPayments actually sends (mapped the ones their
// docs mention - "finished"/"confirmed" as paid, "failed"/"expired" as such,
// everything else as pending). FIRST REAL WEBHOOK: check Worker logs
// (`npm run tail`) for the "RAW NOWPAYMENTS WEBHOOK" line and fix the mapping
// below if the real payload differs.

import type { CheckoutRequest, CheckoutResult, PaymentGateway, WebhookVerifyResult } from "./types";

const API_BASE = "https://api.nowpayments.io/v1";

async function createCheckout(req: CheckoutRequest, apiKey: string): Promise<CheckoutResult> {
  const res = await fetch(`${API_BASE}/invoice`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      price_amount: req.amountCents / 100,
      price_currency: req.currency,
      pay_currency: "usdttrc20",
      order_id: req.subscriberId,
      order_description: "Fusebox - unlimited plan",
      ipn_callback_url: req.webhookUrl,
      success_url: req.successUrl,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`NOWPayments invoice ${res.status}: ${body.slice(0, 300)}`);
  }

  const json: any = await res.json();
  console.log("RAW NOWPAYMENTS INVOICE RESPONSE", JSON.stringify(json).slice(0, 1000));

  const checkoutUrl = json.invoice_url ?? json.checkout_url ?? json.pay_url;
  const externalId = String(json.id ?? json.invoice_id ?? json.payment_id ?? req.subscriberId);

  if (!checkoutUrl) {
    throw new Error(`NOWPayments invoice response had no recognizable checkout URL: ${JSON.stringify(json).slice(0, 300)}`);
  }

  return { checkoutUrl, externalId };
}

// Sorts object keys recursively, matching NOWPayments' reference Node.js
// implementation exactly (docs: "IPN and how to setup").
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyWebhook(
  req: Request,
  rawBody: string,
  secret: string,
): Promise<WebhookVerifyResult | null> {
  const signature = req.headers.get("x-nowpayments-sig");
  if (!signature) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }

  console.log("RAW NOWPAYMENTS WEBHOOK", rawBody.slice(0, 1000));

  const sortedJson = JSON.stringify(sortKeysDeep(parsed));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sortedJson));
  const computedHex = bytesToHex(sigBuf);

  if (!timingSafeEqual(computedHex, signature.toLowerCase())) {
    console.error("NOWPayments webhook signature mismatch");
    return null;
  }

  const rawStatus = String(parsed.payment_status ?? "").toLowerCase();
  let status: WebhookVerifyResult["status"] = "pending";
  if (["finished", "confirmed"].includes(rawStatus)) status = "paid";
  else if (["failed", "expired"].includes(rawStatus)) status = rawStatus as "failed" | "expired";

  return {
    externalId: String(parsed.order_id ?? parsed.invoice_id ?? parsed.payment_id ?? ""),
    status,
    raw: parsed,
  };
}

export const nowpayments: PaymentGateway = {
  name: "nowpayments",
  createCheckout,
  verifyWebhook,
};
