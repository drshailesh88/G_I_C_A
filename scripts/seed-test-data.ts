/**
 * Seed Test Data — Idempotent
 *
 * Creates/updates:
 *   - Clerk org "GEM India (E2E)" with 4 custom roles assumed already created
 *     in the dashboard (org:super_admin, org:event_coordinator, org:ops,
 *     org:read_only).
 *   - 5 test users with deterministic credentials and org memberships.
 *   - 1 organization row + 3 events (A active, B active, archived).
 *   - Certificate templates for A.
 *   - 2 people: one attached only to A, one attached to both A and B.
 *   - event_user_assignments rows for coord_A, coord_B, coord_AB, readonly_A.
 *
 * Re-runs are safe — every create is guarded by a "look up first, else create".
 * Output: writes an `.env.test.local.fixtures` file that you merge into
 * `.env.test.local` (or just source it into your shell) with all the IDs.
 *
 * Usage:
 *   DATABASE_URL="$DATABASE_URL_TEST" \
 *   CLERK_SECRET_KEY=<test-key> \
 *   npx tsx scripts/seed-test-data.ts
 *
 * Requires: `dotenv` loaded from .env.test.local.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.test.local' });
loadEnv({ path: '.env.local' }); // fallback for CLERK_SECRET_KEY if not overridden
import { createClerkClient } from '@clerk/backend';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq } from 'drizzle-orm';
import { writeFile } from 'node:fs/promises';
import * as schema from '../src/lib/db/schema';
import { organizations } from '../src/lib/db/schema/organizations';
import { events, eventUserAssignments } from '../src/lib/db/schema/events';
import { people } from '../src/lib/db/schema/people';
import { eventPeople } from '../src/lib/db/schema/event-people';
import { certificateTemplates } from '../src/lib/db/schema/certificates';

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const DATABASE_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

if (!CLERK_SECRET_KEY) throw new Error('CLERK_SECRET_KEY not set');
if (!DATABASE_URL) throw new Error('DATABASE_URL_TEST not set');

const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });
const sql = neon(DATABASE_URL);
const db = drizzle(sql, { schema });

const ORG_SLUG = 'gem-india-e2e';
const ORG_NAME = 'GEM India (E2E)';

type UserSpec = {
  envPrefix: string;
  emailLocal: string;
  password: string;
  firstName: string;
  lastName: string;
  clerkRole: 'org:super_admin' | 'org:event_coordinator' | 'org:ops' | 'org:read_only';
};

const USERS: UserSpec[] = [
  { envPrefix: 'E2E_SUPER',       emailLocal: 'e2e-super',       password: 'TestSuperAdmin!2026Q2', firstName: 'Super',  lastName: 'Admin',       clerkRole: 'org:super_admin' },
  { envPrefix: 'E2E_COORD_A',     emailLocal: 'e2e-coord-a',     password: 'TestCoordA!2026Q2',    firstName: 'Coord',  lastName: 'A',           clerkRole: 'org:event_coordinator' },
  { envPrefix: 'E2E_COORD_B',     emailLocal: 'e2e-coord-b',     password: 'TestCoordB!2026Q2',    firstName: 'Coord',  lastName: 'B',           clerkRole: 'org:event_coordinator' },
  { envPrefix: 'E2E_COORD_AB',    emailLocal: 'e2e-coord-ab',    password: 'TestCoordAB!2026Q2',   firstName: 'Coord',  lastName: 'AB',          clerkRole: 'org:event_coordinator' },
  // Ops role deferred — Clerk free-tier 5-member cap means we drop E2E_OPS_A
  // until plan upgrade. Contract test CE14 (certificates) tests read_only only.
  { envPrefix: 'E2E_READONLY_A',  emailLocal: 'e2e-ro-a',        password: 'TestReadOnlyA!2026Q2', firstName: 'ReadOnly', lastName: 'A',         clerkRole: 'org:read_only' },
];
const EMAIL_DOMAIN = 'ecg.shailesh@gmail.com'.split('@')[1]; // or use a catch-all if preferred
function emailFor(spec: UserSpec) {
  return `${spec.emailLocal}@${EMAIL_DOMAIN}`;
}

async function ensureOrg(superUserId: string): Promise<string> {
  const list = await clerk.organizations.getOrganizationList({ limit: 50 });
  const existing = list.data.find((o) => o.name === ORG_NAME);
  if (existing) return existing.id;
  // Super user creates the org — Clerk auto-adds creator as org:admin,
  // which we overwrite to org:super_admin in ensureMembership.
  const created = await clerk.organizations.createOrganization({ name: ORG_NAME, createdBy: superUserId });
  return created.id;
}

async function ensureUser(spec: UserSpec): Promise<string> {
  const email = emailFor(spec);
  const existing = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const created = await clerk.users.createUser({
    emailAddress: [email],
    password: spec.password,
    firstName: spec.firstName,
    lastName: spec.lastName,
    skipPasswordChecks: true,
  });
  return created.id;
}

async function ensureMembership(orgId: string, userId: string, role: string) {
  const memberships = await clerk.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    limit: 100,
  });
  const existing = memberships.data.find((m) => m.publicUserData?.userId === userId);
  if (!existing) {
    await clerk.organizations.createOrganizationMembership({
      organizationId: orgId,
      userId,
      role,
    });
    return;
  }
  if (existing.role !== role) {
    await clerk.organizations.updateOrganizationMembership({
      organizationId: orgId,
      userId,
      role: role as any,
    });
  }
}

async function ensureOrganizationRow(): Promise<string> {
  const existing = await db.select().from(organizations).where(eq(organizations.slug, 'gem-india')).limit(1);
  if (existing[0]) return existing[0].id;
  const [row] = await db.insert(organizations).values({
    name: 'GEM India',
    slug: 'gem-india',
  }).returning({ id: organizations.id });
  return row.id;
}

async function ensureEvent(
  orgId: string,
  slug: string,
  name: string,
  status: 'published' | 'archived',
  createdBy: string,
  durationDays = 3,
): Promise<string> {
  const existing = await db
    .select()
    .from(events)
    .where(and(eq(events.organizationId, orgId), eq(events.slug, slug)))
    .limit(1);
  if (existing[0]) {
    // Keep status aligned
    if (existing[0].status !== status) {
      await db.update(events).set({ status, updatedBy: createdBy, updatedAt: new Date() })
        .where(eq(events.id, existing[0].id));
    }
    return existing[0].id;
  }
  const start = new Date('2026-05-15T04:30:00Z');
  const end = new Date(start);
  end.setDate(start.getDate() + durationDays);
  const [row] = await db.insert(events).values({
    organizationId: orgId,
    slug,
    name,
    startDate: start,
    endDate: end,
    timezone: 'Asia/Kolkata',
    status,
    venueName: `${name} Venue`,
    venueCity: 'New Delhi',
    moduleToggles: { certificates: true, registration: true, travel: true, accommodation: true },
    fieldConfig: {},
    branding: {},
    registrationSettings: {},
    communicationSettings: {},
    publicPageSettings: {},
    createdBy,
    updatedBy: createdBy,
  }).returning({ id: events.id });
  return row.id;
}

async function ensureAssignment(eventId: string, authUserId: string, assignmentType: 'owner' | 'collaborator', assignedBy: string) {
  const [existing] = await db
    .select()
    .from(eventUserAssignments)
    .where(and(eq(eventUserAssignments.eventId, eventId), eq(eventUserAssignments.authUserId, authUserId)))
    .limit(1);
  if (existing) {
    if (existing.assignmentType !== assignmentType || !existing.isActive) {
      await db.update(eventUserAssignments).set({ assignmentType, isActive: true, updatedAt: new Date() })
        .where(eq(eventUserAssignments.id, existing.id));
    }
    return;
  }
  await db.insert(eventUserAssignments).values({
    eventId, authUserId, assignmentType, isActive: true, assignedBy,
  });
}

async function ensurePerson(fullName: string, email: string, createdBy: string): Promise<string> {
  const [existing] = await db.select().from(people).where(eq(people.email, email)).limit(1);
  if (existing) return existing.id;
  const [row] = await db.insert(people).values({
    fullName, email, createdBy, updatedBy: createdBy,
  }).returning({ id: people.id });
  return row.id;
}

async function ensureEventPerson(eventId: string, personId: string, source: string) {
  const [existing] = await db
    .select()
    .from(eventPeople)
    .where(and(eq(eventPeople.eventId, eventId), eq(eventPeople.personId, personId)))
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db.insert(eventPeople).values({ eventId, personId, source })
    .returning({ id: eventPeople.id });
  return row.id;
}

async function ensureTemplate(
  eventId: string,
  certificateType: string,
  audienceScope: string,
  name: string,
  createdBy: string,
  required: string[],
): Promise<string> {
  const [existing] = await db
    .select()
    .from(certificateTemplates)
    .where(and(eq(certificateTemplates.eventId, eventId), eq(certificateTemplates.certificateType, certificateType)))
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db.insert(certificateTemplates).values({
    eventId,
    templateName: name,
    certificateType,
    audienceScope,
    templateJson: { version: 'seed-v1' },
    pageSize: 'A4_landscape',
    orientation: 'landscape',
    allowedVariablesJson: [...required, 'full_name', 'salutation'],
    requiredVariablesJson: required,
    status: 'active',
    createdBy,
    updatedBy: createdBy,
  }).returning({ id: certificateTemplates.id });
  return row.id;
}

async function main() {
  console.log('🌱 Seeding Clerk + DB test fixtures\n');

  // 1. Clerk side — create users FIRST (no org membership yet), then org (as super), then memberships.
  const userIds: Record<string, string> = {};
  for (const spec of USERS) {
    const userId = await ensureUser(spec);
    userIds[spec.envPrefix] = userId;
  }
  const superUserId = userIds.E2E_SUPER;
  const orgId = await ensureOrg(superUserId);
  console.log('Clerk org:', orgId);
  for (const spec of USERS) {
    await ensureMembership(orgId, userIds[spec.envPrefix], spec.clerkRole);
    console.log(`  ${spec.envPrefix.padEnd(18)} ${userIds[spec.envPrefix]}  (${spec.clerkRole})`);
  }

  // 2. DB side
  const orgRowId = await ensureOrganizationRow();
  console.log('\nOrg row:', orgRowId);

  const createdBy = userIds.E2E_SUPER;

  const eventAId = await ensureEvent(orgRowId, 'gic-e2e-a', 'GIC E2E Event A', 'published', createdBy, 3);
  const eventBId = await ensureEvent(orgRowId, 'gic-e2e-b', 'GIC E2E Event B', 'published', createdBy, 3);
  const eventArchivedId = await ensureEvent(orgRowId, 'gic-e2e-archived', 'GIC E2E Archived', 'archived', createdBy, 3);
  console.log(`  Event A         ${eventAId}`);
  console.log(`  Event B         ${eventBId}`);
  console.log(`  Event Archived  ${eventArchivedId}`);

  // Assignments
  await ensureAssignment(eventAId, userIds.E2E_COORD_A, 'owner', createdBy);
  await ensureAssignment(eventBId, userIds.E2E_COORD_B, 'owner', createdBy);
  await ensureAssignment(eventAId, userIds.E2E_COORD_AB, 'owner', createdBy);
  await ensureAssignment(eventBId, userIds.E2E_COORD_AB, 'owner', createdBy);
  await ensureAssignment(eventAId, userIds.E2E_READONLY_A, 'collaborator', createdBy);
  // E2E_OPS_A deferred until Clerk plan upgrade
  console.log('  Assignments: seeded');

  // People
  const personA = await ensurePerson('Dr. Priya A. Patel', 'priya.e2e@example.com', createdBy);
  const personAB = await ensurePerson('Dr. Shared A+B', 'shared.e2e@example.com', createdBy);
  const personOnlyB = await ensurePerson('Dr. Only B', 'onlyb.e2e@example.com', createdBy);
  await ensureEventPerson(eventAId, personA, 'manual');
  await ensureEventPerson(eventAId, personAB, 'manual');
  await ensureEventPerson(eventBId, personAB, 'manual');
  await ensureEventPerson(eventBId, personOnlyB, 'manual');
  console.log(`  Persons:        A-only=${personA}  shared=${personAB}  B-only=${personOnlyB}`);

  // Templates (Event A)
  const tplDelegate = await ensureTemplate(eventAId, 'delegate_attendance', 'delegate', 'Delegate Attendance Template', createdBy, ['full_name']);
  const tplCme = await ensureTemplate(eventAId, 'cme_attendance', 'delegate', 'CME Attendance Template', createdBy,
    ['full_name', 'cme_credit_hours', 'accrediting_body_name', 'accreditation_code', 'cme_claim_text']);
  console.log(`  Templates: delegate=${tplDelegate}  cme=${tplCme}`);

  // 3. Output fixture env vars
  const lines = [
    '# --- Auto-generated by scripts/seed-test-data.ts ---',
    `CLERK_ORG_ID=${orgId}`,
    `EVENT_A_ID=${eventAId}`,
    `EVENT_B_ID=${eventBId}`,
    `EVENT_ARCHIVED_ID=${eventArchivedId}`,
    `E2E_EVENT_A_DURATION_HOURS=72`,
    `CERT_TEMPLATE_DELEGATE_ATT_ID=${tplDelegate}`,
    `CERT_TEMPLATE_CME_ID=${tplCme}`,
    `E2E_PERSON_ATTENDED_A_ID=${personA}`,
    `E2E_DELEGATE_A_PERSON_ID=${personA}`,
    `E2E_DELEGATE_AB_PERSON_ID=${personAB}`,
    `E2E_SHARED_PERSON_ID=${personAB}`,
    `E2E_PERSON_ONLY_B_ID=${personOnlyB}`,
    '',
    '# Clerk test users — credentials are deterministic. Username is the email.',
  ];
  for (const spec of USERS) {
    lines.push(`${spec.envPrefix}_USERNAME=${emailFor(spec)}`);
    lines.push(`${spec.envPrefix}_PASSWORD=${spec.password}`);
    lines.push(`${spec.envPrefix}_USER_ID=${userIds[spec.envPrefix]}`);
  }
  // Alias for tests that use E2E_DELEGATE_A_USER_ID
  lines.push(`E2E_DELEGATE_A_USER_ID=${userIds.E2E_COORD_A}  # placeholder — no delegate-Clerk-user model yet`);
  const outPath = 'scripts/.env.test.local.fixtures';
  await writeFile(outPath, lines.join('\n') + '\n');
  console.log(`\n✅ Wrote ${outPath} — append contents to .env.test.local`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
