/**
 * Cascade Handler Registry
 *
 * Registers all cascade handlers. Call once at app startup.
 */

import { registerTravelCascadeHandlers } from './travel-cascade';
import { registerAccommodationCascadeHandlers } from './accommodation-cascade';

let registered = false;

export function registerAllCascadeHandlers() {
  if (registered) return;
  registerTravelCascadeHandlers();
  registerAccommodationCascadeHandlers();
  registered = true;
}
