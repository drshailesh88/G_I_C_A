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
