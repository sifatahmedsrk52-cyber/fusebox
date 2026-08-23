// The contract every payment gateway implements. Add a new gateway by adding
// a new file in this folder that satisfies this interface, then one line in
// gateways.ts - nothing else in the app needs to know a new gateway exists.

export interface CheckoutRequest {
  subscriberId: string;
  email: string;
  amountCents: number;
  currency: string; // 'usd'
  // Where the gateway should POST payment-status updates.
  webhookUrl: string;
  // Where the gateway should send the customer back to after paying.
  successUrl: string;
}

export interface CheckoutResult {
  checkoutUrl: string; // redirect the customer here
  externalId: string; // the gateway's id for this checkout, stored in `payments.external_id`
}

export interface WebhookVerifyResult {
  externalId: string;
  status: "paid" | "pending" | "failed" | "expired";
  raw: unknown;
}

export interface PaymentGateway {
  name: string;
  createCheckout(req: CheckoutRequest, apiKey: string): Promise<CheckoutResult>;
  // Verifies the webhook's authenticity (signature check) and returns the
  // parsed status, or null if the signature doesn't check out - callers
  // must treat null as "reject this webhook", never as "no payment found".
  verifyWebhook(req: Request, rawBody: string, secret: string): Promise<WebhookVerifyResult | null>;
}
