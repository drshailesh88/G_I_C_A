# communications — Spec 007

STATUS: PENDING
TESTED: 0/21
PASS: 0
FAIL: 0
BLOCKED: 0
PAGE: unit-test (no browser needed)
MODULE: communications

---
### Circuit Breaker
- [ ] **Closed when failures below threshold** — 0 failures; verify checkCircuit returns 'closed' `[CONFIRMED]`
- [ ] **Closed at 4 failures** — record 4 failures; verify still 'closed' `[CONFIRMED]`
- [ ] **Open at 5 failures** — record 5 failures; verify CircuitOpenError thrown `[CONFIRMED]`
- [ ] **Half-open after cooldown** — open circuit, advance time 60s; verify returns 'half-open' `[CONFIRMED]`
- [ ] **Single probe in half-open** — two concurrent checkCircuit after cooldown; verify only one gets 'half-open' `[CONFIRMED]`
- [ ] **Success resets circuit** — open circuit, recordSuccess; verify next check returns 'closed' `[CONFIRMED]`
- [ ] **Success deletes all Redis keys** — after recordSuccess; verify failures, opened, probe keys deleted `[CONFIRMED]`
- [ ] **Failure increments atomically** — concurrent recordFailure calls; verify counter incremented correctly (INCR) `[CONFIRMED]`
- [ ] **Keys auto-expire after 5 min** — verify Redis keys set with TTL=300 `[CONFIRMED]`
- [ ] **Status reports closed** — fresh state; verify getStatus returns {state:'closed', failures:0, openedAt:null} `[CONFIRMED]`
- [ ] **Status reports open** — 5 failures; verify getStatus returns {state:'open', failures:5} with openedAt set `[CONFIRMED]`

### Webhook Parsers
#### Resend Parser
- [ ] **email.sent maps to sent** — parseResendWebhook with type='email.sent'; verify eventType='sent' `[CONFIRMED]`
- [ ] **email.delivered maps to delivered** — verify eventType='delivered' `[CONFIRMED]`
- [ ] **email.bounced maps to failed** — verify eventType='failed' `[CONFIRMED]`
- [ ] **email.complained maps to failed** — verify eventType='failed' `[CONFIRMED]`
- [ ] **email.opened maps to read** — verify eventType='read' `[CONFIRMED]`
- [ ] **email_id extracted** — verify providerMessageId from data.email_id `[CONFIRMED]`
- [ ] **Malformed payload returns null** — missing type field; verify null returned `[CONFIRMED]`
- [ ] **Unknown event type returns null** — type='email.unknown'; verify null returned `[CONFIRMED]`

#### Evolution Parser
- [ ] **Status 2 (SERVER_ACK) maps to sent** — parseEvolutionWebhook; verify eventType='sent' `[CONFIRMED]`
- [ ] **Status 3 (DELIVERY_ACK) maps to delivered** — verify eventType='delivered' `[CONFIRMED]`
- [ ] **Status 4 (READ) maps to read** — verify eventType='read' `[CONFIRMED]`
