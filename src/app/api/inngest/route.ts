/**
 * Inngest API Route
 *
 * Serves all Inngest functions for the Inngest Dev Server (local)
 * and Inngest Cloud (production) to discover and invoke.
 *
 * Middleware already allows /api/inngest as a public route.
 */

import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { inngestFunctions } from '@/lib/inngest/functions';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
