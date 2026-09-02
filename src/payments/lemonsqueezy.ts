// Lemon Squeezy gateway - cards/PayPal via a merchant of record, added
// alongside NOWPayments because crypto-only checkout is a real conversion
// killer for a mainstream (non-crypto-native) solo-dev audience. Docs
// verified live this session (docs.lemonsqueezy.com, plus a working
// Cloudflare Workers HMAC example at xiegerts.com) - not guessed. UNVERIFIED
// against a real store, since testing needs real API credentials: the exact
// shape of a real checkout response (assumed `data.attributes.url` per docs)
// and the real webhook event Lemon Squeezy sends for a subscription's first
// payment (assumed `subscription_payment_success`, with `order_created` as a
// fallback in case the product ends up configured as one-time instead of
// recurring). FIRST REAL WEBHOOK: check Worker logs (`npm run tail`) for the
// "RAW LEMONSQUEEZY WEBHOOK" line and fix the event/field names below if the
// real payload differs. Store ID and variant ID (created once you have a
// real account and a $7/mo product set up) are passed in alongside the API
// key via the `secrets` object - see the PaymentGateway interface.

import type { CheckoutRequest, CheckoutResult, PaymentGateway, WebhookVerifyResult } from "./types";

const API_BASE = "https://api.lemonsqueezy.com/v1";

// Beyond `secrets.apiKey`, this gateway needs two more values off the same
// object (see the PaymentGateway.createCheckout doc in types.ts):
//   secrets.storeId    - numeric store ID, from the Lemon Squeezy dashboard
//   secrets.variantId  - the $7/mo product's variant ID
// index.ts is responsible for assembling that object from the relevant
// `wrangler secret put` values before calling createCheckout.

async function createCheckout(req: CheckoutRequest, secrets: Record<string, string>): Promise<CheckoutResult> {
  if (!secrets.storeId || !secrets.variantId) {
    throw new Error("Lemon Squeezy store/variant not configured");
  }

  const res = await fetch(`${API_BASE}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secrets.apiKey}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: req.email,
            custom: { subscriber_id: req.subscriberId },
          },
          product_options: {
            redirect_url: req.successUrl,
          },
        },
        relationships: {
          store: { data: { type: "stores", id: secrets.storeId } },
          variant: { data: { type: "variants", id: secrets.variantId } },
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Lemon Squeezy checkout ${res.status}: ${body.slice(0, 300)}`);
  }

  const json: any = await res.json();
  console.log("RAW LEMONSQUEEZY CHECKOUT RESPONSE", JSON.stringify(json).slice(0, 1000));

  const checkoutUrl = json?.data?.attributes?.url;
  const externalId = String(json?.data?.id ?? "");

  if (!checkoutUrl) {
    throw new Error(`Lemon Squeezy checkout response had no recognizable URL: ${JSON.stringify(json).slice(0, 300)}`);
  }

  return { checkoutUrl, externalId };
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function verifyWebhook(
  req: Request,
  rawBody: string,
  secret: string,
): Promise<WebhookVerifyResult | null> {
  const signature = req.headers.get("x-signature");
  if (!signature) return null;

  console.log("RAW LEMONSQUEEZY WEBHOOK", rawBody.slice(0, 1000));

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = hexToBytes(signature);
  } catch {
    return null;
  }

  const verified = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(rawBody),
  );
  if (!verified) {
    console.error("Lemon Squeezy webhook signature mismatch");
    return null;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }

  const eventName = req.headers.get("x-event-name") || parsed?.meta?.event_name || "";
  const paidEvents = ["subscription_payment_success", "order_created"];
  const failedEvents = ["subscription_payment_failed", "subscription_expired"];

  let status: WebhookVerifyResult["status"] = "pending";
  if (paidEvents.includes(eventName)) status = "paid";
  else if (failedEvents.includes(eventName)) status = "failed";

  const externalId = String(parsed?.data?.id ?? "");

  return { externalId, status, raw: parsed };
}

export const lemonsqueezy: PaymentGateway = {
  name: "lemonsqueezy",
  createCheckout,
  verifyWebhook,
};
