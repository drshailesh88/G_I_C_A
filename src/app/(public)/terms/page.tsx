'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';

type Tab = 'terms' | 'privacy';

export const TERMS_SECTIONS = [
  {
    title: '1. Registration & Eligibility',
    body: 'Registration is open to medical professionals, researchers, and invited delegates. You must provide accurate personal and professional information. GEM India reserves the right to reject or cancel any registration at its sole discretion. Submitting false information may result in permanent disqualification from future events.',
  },
  {
    title: '2. Event Participation',
    body: 'Registered delegates are expected to attend sessions they have committed to. Session capacity is limited. GEM India may reassign or cancel sessions based on speaker availability. Delegate conduct must remain professional throughout the event.',
  },
  {
    title: '3. Travel & Accommodation',
    body: 'Travel and accommodation arrangements facilitated by GEM India are subject to availability and the policies of partner hotels and carriers. GEM India is not liable for disruptions caused by third parties. Any changes to arrangements must be communicated to the organising committee in advance.',
  },
  {
    title: '4. Communications & Notifications',
    body: 'By registering, you consent to receiving event-related communications via email and WhatsApp. You may contact the organising committee to opt out of non-essential communications. Operational notifications required for event participation cannot be disabled.',
  },
  {
    title: '5. Cancellation & Refund Policy',
    body: 'Cancellations made more than 30 days before the event date are eligible for a full refund. Cancellations within 30 days are non-refundable. Registration transfers to another delegate may be permitted subject to prior written approval.',
  },
  {
    title: '6. Code of Conduct',
    body: 'All delegates, speakers, and staff are expected to maintain a respectful and inclusive environment. Harassment, discrimination, or disruptive behaviour will result in immediate removal from the event without refund. GEM India reserves the right to refuse entry or remove any participant at its discretion.',
  },
];

export const PRIVACY_SECTIONS = [
  {
    title: '1. Information We Collect',
    body: 'We collect personal information you provide during registration, including name, email, phone number, professional designation, specialty, organisation, and city. We may also collect attendance and communication interaction data during the event.',
  },
  {
    title: '2. How We Use Your Information',
    body: 'Your information is used to manage your registration, communicate event logistics, issue certificates, and improve future events. We do not sell or rent your personal information to third parties.',
  },
  {
    title: '3. Data Sharing',
    body: 'We may share your information with event co-organisers, venue partners, and service providers strictly for event delivery purposes. All third-party partners are required to handle your data in accordance with applicable privacy laws.',
  },
  {
    title: '4. Communications',
    body: 'We use your contact details to send event confirmations, schedule updates, and post-event communications. You may request removal from our mailing list after the event by writing to the organising committee.',
  },
  {
    title: '5. Data Retention',
    body: 'We retain your registration data for up to three years after the event for record-keeping and certificate re-issuance purposes. Data no longer required will be securely deleted.',
  },
  {
    title: '6. Your Rights',
    body: 'You have the right to access, correct, or request deletion of your personal data. To exercise these rights, contact the organising committee at support@gemindia.org. We will respond to requests within 30 days.',
  },
];

function AccordionSection({ title, body }: { title: string; body: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-4 text-left text-sm font-medium text-text-primary hover:text-primary"
      >
        {title}
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-text-secondary transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <p className="pb-4 text-sm leading-relaxed text-text-secondary">{body}</p>
      )}
    </div>
  );
}

function BackToRegistrationButton({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  function handleClick() {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.assign('/');
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {children}
    </button>
  );
}

export default function TermsPage() {
  const [tab, setTab] = useState<Tab>('terms');

  const sections = tab === 'terms' ? TERMS_SECTIONS : PRIVACY_SECTIONS;

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BackToRegistrationButton className="text-text-secondary hover:text-text-primary">
            <span className="sr-only">Back to Registration</span>
            <ArrowLeft className="h-5 w-5" />
          </BackToRegistrationButton>
          <h1 className="text-lg font-semibold text-text-primary">Terms &amp; Privacy</h1>
        </div>

        {/* Tab toggle */}
        <div className="mt-6 flex gap-1 border-b border-border">
          <button
            type="button"
            onClick={() => setTab('terms')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'terms'
                ? 'border-b-2 border-primary text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Terms of Service
          </button>
          <button
            type="button"
            onClick={() => setTab('privacy')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'privacy'
                ? 'border-b-2 border-primary text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Privacy Policy
          </button>
        </div>

        {/* Content */}
        <div className="mt-6">
          <h2 className="text-2xl font-bold text-text-primary">
            {tab === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
          </h2>
          <p className="mt-1 text-xs text-text-secondary">Last updated: April 10, 2026</p>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            {tab === 'terms'
              ? 'By registering for a GEM India conference, you agree to the following terms governing your participation, data usage, and communication preferences.'
              : 'This policy describes how GEM India collects, uses, and protects your personal information when you register for and attend our conferences.'}
          </p>

          {/* Accordion sections */}
          <div className="mt-6 rounded-lg border border-border px-4">
            {sections.map((s) => (
              <AccordionSection key={s.title} title={s.title} body={s.body} />
            ))}
          </div>

          {/* Questions callout */}
          <div className="mt-6 rounded-lg bg-muted/50 p-4">
            <p className="text-sm font-medium text-text-primary">Questions?</p>
            <p className="mt-1 text-sm text-text-secondary">
              Contact the organising committee at{' '}
              <a href="mailto:support@gemindia.org" className="text-primary hover:underline">
                support@gemindia.org
              </a>{' '}
              for any questions about these terms.
            </p>
          </div>
        </div>

        {/* Back to Registration */}
        <div className="mt-10 pb-8 text-center">
          <BackToRegistrationButton className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-text-primary hover:bg-muted/50">
            Back to Registration
          </BackToRegistrationButton>
        </div>
      </div>
    </div>
  );
}
