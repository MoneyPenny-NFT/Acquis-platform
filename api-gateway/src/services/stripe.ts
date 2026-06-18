import Stripe from 'stripe';

// Stripe v22 exports StripeConstructor as default; derive instance type via utility
type StripeInstance = InstanceType<typeof Stripe>;
type StripeEvent = ReturnType<StripeInstance['webhooks']['constructEvent']>;

function getStripe(): StripeInstance {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY must be set');
  return new Stripe(key);
}

export async function createCustomerWithBankAccount(
  stripeToken: string,
  hederaAccountId: string,
): Promise<{ stripeCustomerId: string; stripeSourceId: string }> {
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    metadata: { hederaAccountId },
  });
  const source = (await stripe.customers.createSource(customer.id, {
    source: stripeToken,
  })) as { id: string };
  return { stripeCustomerId: customer.id, stripeSourceId: source.id };
}

export async function initiateACHCharge(
  stripeCustomerId: string,
  stripeSourceId: string,
  amountCents: number,
  metadata: Record<string, string>,
): Promise<{ chargeId: string; status: string }> {
  const stripe = getStripe();
  const charge = await stripe.charges.create({
    amount: amountCents,
    currency: 'usd',
    customer: stripeCustomerId,
    source: stripeSourceId,
    description: 'Acquis wallet funding',
    metadata,
  });
  return { chargeId: charge.id, status: charge.status };
}

export function constructWebhookEvent(rawBody: Buffer | string, signature: string): StripeEvent {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET must be set');
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}
