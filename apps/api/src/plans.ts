/**
 * What each plan allows. Routes, the web app and (later) Stripe all read this one table.
 * Today everyone is on the free plan; phase 8 resolves a paid plan from the user's subscription.
 */
export interface Limits {
  /** Saved projects */
  projects: number;
  /** Published links that are not revoked */
  publishedLinks: number;
  /** Pilot requests per day */
  pilotPerDay: number;
}

export const FREE: Limits = { projects: 3, publishedLinks: 3, pilotPerDay: 10 };

export type LimitsFor = (userId: string) => Promise<Limits>;

export const limitsFor: LimitsFor = async () => FREE;
