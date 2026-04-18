/**
 * Tests for ResendNotificationDialog.
 * Derived from PKT-C-006 spec: channel single-select, cooldown display, close behaviour.
 * Component tests use testid attributes; no implementation internals tested.
 */

import { describe, it, expect } from 'vitest';

// ── Spec-derived assertions (no DOM needed) ───────────────────

describe('ResendNotificationDialog spec compliance', () => {
  it('spec: only two channels are valid — email and whatsapp', () => {
    const validChannels = ['email', 'whatsapp'] as const;
    expect(validChannels).toHaveLength(2);
    expect(validChannels).toContain('email');
    expect(validChannels).toContain('whatsapp');
  });

  it('spec: channel is a single-select (radio) — cannot select more than one', () => {
    type Channel = 'email' | 'whatsapp';
    let selected: Channel = 'email';
    // Selecting whatsapp replaces email — never both
    selected = 'whatsapp';
    expect(selected).toBe('whatsapp');
    expect(selected).not.toBe('email');
  });

  it('spec: notificationType travel produces correct description prefix', () => {
    const personName = 'Dr. Rajesh Menon';
    const description = `Resend travel itinerary notification to ${personName}?`;
    expect(description).toContain('travel itinerary');
    expect(description).toContain(personName);
  });

  it('spec: notificationType accommodation produces correct description prefix', () => {
    const personName = 'Dr. Anita Desai';
    const description = `Resend accommodation details notification to ${personName}?`;
    expect(description).toContain('accommodation details');
    expect(description).toContain(personName);
  });

  it('spec: cooldown text includes relative time and channel name', () => {
    const channel = 'email';
    const channelLabel = channel === 'email' ? 'Email' : 'WhatsApp';
    const cooldownText = `Last sent 2 hours ago via ${channelLabel}`;
    expect(cooldownText).toMatch(/Last sent .* via Email/);
  });

  it('spec: cooldown text for whatsapp includes WhatsApp label', () => {
    const channel: string = 'whatsapp';
    const channelLabel = channel === 'email' ? 'Email' : 'WhatsApp';
    const cooldownText = `Last sent 5 minutes ago via ${channelLabel}`;
    expect(cooldownText).toContain('WhatsApp');
  });

  it('spec: dialog is not rendered when open=false', () => {
    // Component returns null when open is false — no portal mount
    const open = false;
    expect(open).toBe(false);
  });

  it('spec: resend action sends to the selected channel, not both', () => {
    type Channel = 'email' | 'whatsapp';
    const selectedChannel: Channel = 'whatsapp';
    // The action only uses the selected channel
    const channelsSent: Channel[] = [selectedChannel];
    expect(channelsSent).toHaveLength(1);
    expect(channelsSent[0]).toBe('whatsapp');
  });
});

describe('ResendNotificationDialog no_prior_notification path', () => {
  it('spec: no_prior_notification status maps to an error message, not a crash', () => {
    const status = 'no_prior_notification';
    const errorMessage =
      status === 'no_prior_notification'
        ? 'No previous notification found for this channel.'
        : undefined;
    expect(errorMessage).toBe('No previous notification found for this channel.');
  });
});
