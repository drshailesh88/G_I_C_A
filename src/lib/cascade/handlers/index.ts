import { registerTravelCascadeHandlers } from './travel-cascade';
import { registerAccommodationCascadeHandlers } from './accommodation-cascade';
import { registerRegistrationCascadeHandlers } from './registration-cascade';
import { registerSessionCascadeHandlers } from './session-cascade';
import { registerCertificateCascadeHandlers } from './certificate-cascade';

let registered = false;

export function registerAllCascadeHandlers() {
  if (registered) return;
  registerTravelCascadeHandlers();
  registerAccommodationCascadeHandlers();
  registerRegistrationCascadeHandlers();
  registerSessionCascadeHandlers();
  registerCertificateCascadeHandlers();
  registered = true;
}
