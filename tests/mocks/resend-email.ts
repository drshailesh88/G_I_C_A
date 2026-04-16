// DRAFT — MSW handler for Resend transactional emails.
// Intercepts all send attempts so tests are deterministic + offline.

import { http, HttpResponse } from "msw";

interface CapturedEmail {
  to: string | string[];
  from: string;
  subject: string;
  html?: string;
  text?: string;
  capturedAt: string;
}

const captured: CapturedEmail[] = [];

export const resendEmailHandlers = [
  http.post("https://api.resend.com/emails", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    captured.push({
      to: body.to as string | string[],
      from: body.from as string,
      subject: body.subject as string,
      ...(typeof body.html === "string" ? { html: body.html } : {}),
      ...(typeof body.text === "string" ? { text: body.text } : {}),
      capturedAt: new Date().toISOString(),
    });
    return HttpResponse.json({ id: `re_test_${captured.length}` });
  }),
];

/** Use in Playwright specs to assert on captured emails. Resets via
 * clearCapturedEmails(). */
export function getCapturedEmails(): readonly CapturedEmail[] {
  return [...captured];
}

export function clearCapturedEmails(): void {
  captured.length = 0;
}
