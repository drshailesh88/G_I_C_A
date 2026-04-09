# communications — Spec 007

STATUS: PASSING
TESTED: 21/21
PASS: 21
FAIL: 0
BLOCKED: 0
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Circuit Breaker
- [x] **Closed when failures below threshold** — 0 failures; verify checkCircuit returns 'closed' `[CONFIRMED]`
- [x] **Closed at 4 failures** — record 4 failures; verify still 'closed' `[CONFIRMED]`
- [x] **Open at 5 failures** — record 5 failures; verify CircuitOpenError thrown `[CONFIRMED]`
- [x] **Half-open after cooldown** — open circuit, advance time 60s; verify returns 'half-open' `[CONFIRMED]`
- [x] **Single probe in half-open** — two concurrent checkCircuit after cooldown; verify only one gets 'half-open' `[CONFIRMED]`
- [x] **Success resets circuit** — open circuit, recordSuccess; verify next check returns 'closed' `[CONFIRMED]`
- [x] **Success deletes all Redis keys** — after recordSuccess; verify failures, opened, probe keys deleted `[CONFIRMED]`
- [x] **Failure increments atomically** — concurrent recordFailure calls; verify counter incremented correctly (INCR) `[CONFIRMED]`
- [x] **Keys auto-expire after 5 min** — verify Redis keys set with TTL=300 `[CONFIRMED]`
- [x] **Status reports closed** — fresh state; verify getStatus returns {state:'closed', failures:0, openedAt:null} `[CONFIRMED]`
- [x] **Status reports open** — 5 failures; verify getStatus returns {state:'open', failures:5} with openedAt set `[CONFIRMED]`

### Webhook Parsers
#### Resend Parser
- [x] **email.sent maps to sent** — parseResendWebhook with type='email.sent'; verify eventType='sent' `[CONFIRMED]`
- [x] **email.delivered maps to delivered** — verify eventType='delivered' `[CONFIRMED]`
- [x] **email.bounced maps to failed** — verify eventType='failed' `[CONFIRMED]`
- [x] **email.complained maps to failed** — verify eventType='failed' `[CONFIRMED]`
- [x] **email.opened maps to read** — verify eventType='read' `[CONFIRMED]`
- [x] **email_id extracted** — verify providerMessageId from data.email_id `[CONFIRMED]`
- [x] **Malformed payload returns null** — missing type field; verify null returned `[CONFIRMED]`
- [x] **Unknown event type returns null** — type='email.unknown'; verify null returned `[CONFIRMED]`

#### Evolution Parser
- [x] **Status 2 (SERVER_ACK) maps to sent** — parseEvolutionWebhook; verify eventType='sent' `[CONFIRMED]`
- [x] **Status 3 (DELIVERY_ACK) maps to delivered** — verify eventType='delivered' `[CONFIRMED]`
- [x] **Status 4 (READ) maps to read** — verify eventType='read' `[CONFIRMED]`
