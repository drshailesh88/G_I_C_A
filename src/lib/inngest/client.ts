/**
 * Inngest Client
 *
 * Singleton client for sending events and defining functions.
 * In development, Inngest Dev Server runs locally.
 * In production, events go to Inngest Cloud.
 */

import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'gem-india',
});
