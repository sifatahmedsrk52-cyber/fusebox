// Registry of every payment gateway Fusebox knows how to use. To add another
// one (Lemon Squeezy, Payoneer-backed checkout, whatever comes next):
//   1. Write src/payments/<name>.ts implementing PaymentGateway (types.ts).
//   2. Import it and add one line below.
// Nothing in index.ts or the D1 schema needs to change.

import type { PaymentGateway } from "./types";
import { nowpayments } from "./nowpayments";
import { lemonsqueezy } from "./lemonsqueezy";

export const GATEWAYS: Record<string, PaymentGateway> = {
  nowpayments,
  lemonsqueezy,
};

export function getGateway(name: string): PaymentGateway | undefined {
  return GATEWAYS[name];
}
