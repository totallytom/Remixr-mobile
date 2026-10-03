/**
 * Feature switches for things built but deliberately held back from release.
 */

/**
 * In-app concert ticket sales (Stripe Checkout, My Tickets, door QR scanner).
 * Deferred to phase 2: needs the ticket-checkout / stripe-ticket-webhook Edge
 * Functions deployed, Stripe secrets set and a Stripe webhook registered.
 * While off, concerts still show and external "Get Tickets" links still work.
 */
export const IN_APP_TICKETS_ENABLED = false;

/**
 * Selling the Fan tier. Off for launch: the website (which shares this account
 * system) only sells the Artist plan (shown there as "Pro"), and Fan has no perk
 * of its own (the app has no ads). Give it one before switching this on. Anyone
 * who already has Fan keeps it and still sees it as their current plan.
 */
export const FAN_TIER_ENABLED = false;
