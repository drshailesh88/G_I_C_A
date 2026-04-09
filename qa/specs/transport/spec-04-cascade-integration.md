# Spec 04: Cascade Integration (Travel -> Transport)

Covers: C1, C2, C3, C4, C5, C6

## Checkpoints

- [CP-01] Travel update creates red flags on transport passenger assignments for the affected travel record
- [CP-02] Travel cancellation creates red flags on transport passenger assignments
- [CP-03] Travel update sends email notification when person has email
- [CP-04] Travel update sends WhatsApp notification when person has phone
- [CP-05] Travel update skips email when person has no email address
- [CP-06] Travel update skips WhatsApp when person has no phone number
- [CP-07] Travel cancellation skips ALL notifications when person not found
- [CP-08] Cascade continues even when notification provider throws
- [CP-09] Idempotency keys are unique across successive updates for same travel record
- [CP-10] Cascade does not flag cancelled transport passenger assignments
