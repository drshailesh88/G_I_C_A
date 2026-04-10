import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('./failed-notifications-client.tsx', import.meta.url),
  'utf8',
);

function getFunctionBlock(name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(
    new RegExp(`function ${escapedName}\\(logId: string\\) \\{[\\s\\S]*?\\n  \\}`, 'm'),
  );

  if (!match) {
    throw new Error(`Unable to locate function block for ${name}`);
  }

  return match[0];
}

describe('FailedNotificationsClient — adversarial source checks', () => {
  it('handleRetry should inspect the returned retry status before removing the failed row', () => {
    const handleRetryBlock = getFunctionBlock('handleRetry');
    const resultAssignment = handleRetryBlock.match(
      /(?:const|let)\s+(\w+)\s*=\s*await\s+retryNotification\(/,
    );

    expect(resultAssignment, handleRetryBlock).not.toBeNull();
    const resultVar = resultAssignment?.[1] ?? 'result';
    expect(handleRetryBlock).toMatch(new RegExp(`\\b${resultVar}\\.status\\b`));
  });

  it('handleResend should inspect the returned resend status before showing success', () => {
    const handleResendBlock = getFunctionBlock('handleResend');
    const resultAssignment = handleResendBlock.match(
      /(?:const|let)\s+(\w+)\s*=\s*await\s+manualResend\(/,
    );

    expect(resultAssignment, handleResendBlock).not.toBeNull();
    const resultVar = resultAssignment?.[1] ?? 'result';
    expect(handleResendBlock).toMatch(new RegExp(`\\b${resultVar}\\.status\\b`));
  });
});

describe('FailedNotificationsClient — responsive layout', () => {
  it('imports ResponsiveList from the responsive components', () => {
    expect(source).toContain("from '@/components/responsive/responsive-list'");
    expect(source).toContain('ResponsiveList');
  });

  it('uses ResponsiveList component in JSX', () => {
    expect(source).toMatch(/<ResponsiveList/);
  });

  it('defines a renderCard function for mobile card view', () => {
    expect(source).toMatch(/renderCard/);
  });

  it('defines columns with priority levels', () => {
    // Must have high priority columns (recipient + error for mobile)
    expect(source).toMatch(/priority:\s*['"]high['"]/);
    // Must have medium priority columns (channel + time for tablet)
    expect(source).toMatch(/priority:\s*['"]medium['"]/);
    // Must have low priority columns (retry action for desktop)
    expect(source).toMatch(/priority:\s*['"]low['"]/);
  });

  it('card view shows recipient info', () => {
    expect(source).toMatch(/recipientEmail|recipientPhoneE164/);
  });

  it('card view shows error info', () => {
    expect(source).toMatch(/lastErrorCode/);
  });

  it('preserves channel filter functionality', () => {
    expect(source).toMatch(/channelFilter/);
    expect(source).toMatch(/setChannelFilter/);
  });

  it('preserves retry and resend actions', () => {
    expect(source).toMatch(/handleRetry/);
    expect(source).toMatch(/handleResend/);
  });

  it('preserves the action result toast', () => {
    expect(source).toMatch(/actionResult/);
  });
});
