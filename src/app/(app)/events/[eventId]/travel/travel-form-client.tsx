'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createTravelRecord, updateTravelRecord } from '@/lib/actions/travel';
import { TRAVEL_DIRECTIONS, TRAVEL_MODES } from '@/lib/validations/travel';
import { FormGrid } from '@/components/responsive/form-grid';

type Person = {
  id: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
};

type ExistingRecord = {
  id: string;
  personId: string;
  direction: string;
  travelMode: string;
  fromCity: string;
  fromLocation: string | null;
  toCity: string;
  toLocation: string | null;
  departureAtUtc: Date | null;
  arrivalAtUtc: Date | null;
  carrierName: string | null;
  serviceNumber: string | null;
  pnrOrBookingRef: string | null;
  seatOrCoach: string | null;
  terminalOrGate: string | null;
  attachmentUrl: string | null;
  notes: string | null;
};

const DIRECTION_LABELS: Record<string, string> = {
  inbound: 'Inbound',
  outbound: 'Outbound',
  intercity: 'Intercity',
  other: 'Other',
};

const MODE_LABELS: Record<string, string> = {
  flight: 'Flight',
  train: 'Train',
  car: 'Car',
  bus: 'Bus',
  self_arranged: 'Self Arranged',
  other: 'Other',
};

function formatDatetimeLocal(date: Date | null): string {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TravelFormClient({
  eventId,
  people,
  existing,
}: {
  eventId: string;
  people: Person[];
  existing?: ExistingRecord;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState(existing?.personId ?? '');

  const isEdit = !!existing;
  const filteredPeople = personSearch.length >= 2
    ? people.filter(
        (p) =>
          p.fullName.toLowerCase().includes(personSearch.toLowerCase()) ||
          p.email?.toLowerCase().includes(personSearch.toLowerCase()),
      ).slice(0, 10)
    : [];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const form = new FormData(e.currentTarget);
    const data: Record<string, string> = {};
    form.forEach((value, key) => {
      data[key] = value as string;
    });

    // Convert datetime-local to ISO strings
    if (data.departureAtUtc) data.departureAtUtc = new Date(data.departureAtUtc).toISOString();
    if (data.arrivalAtUtc) data.arrivalAtUtc = new Date(data.arrivalAtUtc).toISOString();

    try {
      if (isEdit) {
        await updateTravelRecord(eventId, {
          travelRecordId: existing.id,
          ...data,
        });
      } else {
        await createTravelRecord(eventId, data);
      }
      router.push(`/events/${eventId}/travel`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      setError(message);
      setLoading(false);
    }
  }

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/events/${eventId}/travel`} className="rounded-lg p-1.5 hover:bg-border/50">
          <ArrowLeft className="h-5 w-5 text-text-primary" />
        </Link>
        <h1 className="text-xl font-bold text-text-primary">
          {isEdit ? 'Edit Travel' : 'Add Travel'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
        {/* Person Picker — full width */}
        {!isEdit && (
          <div className="col-span-full">
            <label htmlFor="personId" className="mb-1 block text-sm font-medium text-text-primary">
              Person <span className="text-error">*</span>
            </label>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={personSearch}
              onChange={(e) => {
                setPersonSearch(e.target.value);
                setSelectedPersonId('');
              }}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
            {filteredPeople.length > 0 && !selectedPersonId && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
                {filteredPeople.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPersonId(p.id);
                      setPersonSearch(p.fullName);
                    }}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-border/30"
                  >
                    <span className="font-medium text-text-primary">{p.fullName}</span>
                    <span className="text-xs text-text-muted">{p.email || p.phoneE164}</span>
                  </button>
                ))}
              </div>
            )}
            <input type="hidden" id="personId" name="personId" value={selectedPersonId} required readOnly />
          </div>
        )}

        {/* Direction + Mode — side by side */}
        <FormGrid>
          <div>
            <label htmlFor="direction" className="mb-1 block text-sm font-medium text-text-primary">
              Direction <span className="text-error">*</span>
            </label>
            <select
              id="direction"
              name="direction"
              required
              defaultValue={existing?.direction || ''}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="" disabled>Select...</option>
              {TRAVEL_DIRECTIONS.map((d) => (
                <option key={d} value={d}>{DIRECTION_LABELS[d]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="travelMode" className="mb-1 block text-sm font-medium text-text-primary">
              Mode <span className="text-error">*</span>
            </label>
            <select
              id="travelMode"
              name="travelMode"
              required
              defaultValue={existing?.travelMode || ''}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="" disabled>Select...</option>
              {TRAVEL_MODES.map((m) => (
                <option key={m} value={m}>{MODE_LABELS[m]}</option>
              ))}
            </select>
          </div>
        </FormGrid>

        {/* From / To Cities — side by side */}
        <FormGrid>
          <div>
            <label htmlFor="fromCity" className="mb-1 block text-sm font-medium text-text-primary">
              From City <span className="text-error">*</span>
            </label>
            <input
              id="fromCity"
              name="fromCity"
              type="text"
              required
              defaultValue={existing?.fromCity || ''}
              placeholder="Delhi"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="toCity" className="mb-1 block text-sm font-medium text-text-primary">
              To City <span className="text-error">*</span>
            </label>
            <input
              id="toCity"
              name="toCity"
              type="text"
              required
              defaultValue={existing?.toCity || ''}
              placeholder="Mumbai"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
        </FormGrid>

        {/* From / To Locations — side by side */}
        <FormGrid>
          <div>
            <label htmlFor="fromLocation" className="mb-1 block text-sm font-medium text-text-primary">
              From Location
            </label>
            <input
              id="fromLocation"
              name="fromLocation"
              type="text"
              defaultValue={existing?.fromLocation || ''}
              placeholder="IGI Airport T3"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="toLocation" className="mb-1 block text-sm font-medium text-text-primary">
              To Location
            </label>
            <input
              id="toLocation"
              name="toLocation"
              type="text"
              defaultValue={existing?.toLocation || ''}
              placeholder="CSIA T2"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
        </FormGrid>

        {/* Departure / Arrival — side by side */}
        <FormGrid>
          <div>
            <label htmlFor="departureAtUtc" className="mb-1 block text-sm font-medium text-text-primary">
              Departure
            </label>
            <input
              id="departureAtUtc"
              name="departureAtUtc"
              type="datetime-local"
              defaultValue={formatDatetimeLocal(existing?.departureAtUtc ?? null)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="arrivalAtUtc" className="mb-1 block text-sm font-medium text-text-primary">
              Arrival
            </label>
            <input
              id="arrivalAtUtc"
              name="arrivalAtUtc"
              type="datetime-local"
              defaultValue={formatDatetimeLocal(existing?.arrivalAtUtc ?? null)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
        </FormGrid>

        {/* Carrier + Service Number — side by side */}
        <FormGrid>
          <div>
            <label htmlFor="carrierName" className="mb-1 block text-sm font-medium text-text-primary">
              Carrier / Airline
            </label>
            <input
              id="carrierName"
              name="carrierName"
              type="text"
              defaultValue={existing?.carrierName || ''}
              placeholder="Air India"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="serviceNumber" className="mb-1 block text-sm font-medium text-text-primary">
              Flight / Train No.
            </label>
            <input
              id="serviceNumber"
              name="serviceNumber"
              type="text"
              defaultValue={existing?.serviceNumber || ''}
              placeholder="AI 302"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
        </FormGrid>

        {/* PNR + Terminal — side by side */}
        <FormGrid>
          <div>
            <label htmlFor="pnrOrBookingRef" className="mb-1 block text-sm font-medium text-text-primary">
              PNR / Booking Ref
            </label>
            <input
              id="pnrOrBookingRef"
              name="pnrOrBookingRef"
              type="text"
              defaultValue={existing?.pnrOrBookingRef || ''}
              placeholder="ABC123"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="terminalOrGate" className="mb-1 block text-sm font-medium text-text-primary">
              Terminal / Gate
            </label>
            <input
              id="terminalOrGate"
              name="terminalOrGate"
              type="text"
              defaultValue={existing?.terminalOrGate || ''}
              placeholder="Terminal 3"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
        </FormGrid>

        {/* Seat — full width */}
        <div>
          <label htmlFor="seatOrCoach" className="mb-1 block text-sm font-medium text-text-primary">
            Seat / Coach
          </label>
          <input
            id="seatOrCoach"
            name="seatOrCoach"
            type="text"
            defaultValue={existing?.seatOrCoach || ''}
            placeholder="12A"
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Attachment URL — full width */}
        <div>
          <label htmlFor="attachmentUrl" className="mb-1 block text-sm font-medium text-text-primary">
            Ticket Attachment URL
          </label>
          <input
            id="attachmentUrl"
            name="attachmentUrl"
            type="url"
            defaultValue={existing?.attachmentUrl || ''}
            placeholder="https://..."
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Notes — full width */}
        <div>
          <label htmlFor="notes" className="mb-1 block text-sm font-medium text-text-primary">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={existing?.notes || ''}
            placeholder="Any additional details..."
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-50"
        >
          {loading ? 'Saving...' : isEdit ? 'Update Travel Record' : 'Create Travel Record'}
        </button>
      </form>
    </div>
  );
}
