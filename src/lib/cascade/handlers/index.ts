import { registerTravelCascadeHandlers } from './travel-cascade';
import { registerAccommodationCascadeHandlers } from './accommodation-cascade';
import { registerRegistrationCascadeHandlers } from './registration-cascade';
import { registerSessionCascadeHandlers } from './session-cascade';
import { registerCertificateCascadeHandlers } from './certificate-cascade';
import { registerProgramCascadeHandlers } from './program-cascade';
import { registerProgramBundleCascadeHandlers } from './program-bundle-cascade';
import { registerTransportCascadeHandlers } from './transport-cascade';

let registered = false;

export function registerAllCascadeHandlers() {
  if (registered) return;
  registerTravelCascadeHandlers();
  registerAccommodationCascadeHandlers();
  registerRegistrationCascadeHandlers();
  registerSessionCascadeHandlers();
  registerCertificateCascadeHandlers();
  registerProgramCascadeHandlers();
  registerProgramBundleCascadeHandlers();
  registerTransportCascadeHandlers();
  registered = true;
}
