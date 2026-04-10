'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createAccommodationRecord, updateAccommodationRecord } from '@/lib/actions/accommodation';
import { FormGrid } from '@/components/responsive/form-grid';

type PersonWithTravel = {
  personId: string;
  personName: string;
  personEmail: string | null;
  personPhone: string | null;
};

type ExistingRecord = {
  id: string;
  personId: string;
  hotelName: string;
  hotelAddress: string | null;
  hotelCity: string | null;
  googleMapsUrl: string | null;
  roomType: string | null;
  roomNumber: string | null;
  sharedRoomGroup: string | null;
  checkInDate: Date;
  checkOutDate: Date;
  bookingReference: string | null;
  attachmentUrl: string | null;
  specialRequests: string | null;
  notes: string | null;
};

function formatDateInput(date: Date | null): string {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function AccommodationFormClient({
  eventId,
  peopleWithTravel,
  existing,
}: {
  eventId: string;
  peopleWithTravel: PersonWithTravel[];
  existing?: ExistingRecord;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [personSearch, setPersonSearch] = useState('');

  const isEdit = !!existing;
  const filteredPeople = personSearch.length >= 2
    ? peopleWithTravel.filter(
        (p) =>
          p.personName.toLowerCase().includes(personSearch.toLowerCase()) ||
          p.personEmail?.toLowerCase().includes(personSearch.toLowerCase()),
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

    try {
      if (isEdit) {
        await updateAccommodationRecord(eventId, {
          accommodationRecordId: existing.id,
          ...data,
        });
      } else {
        await createAccommodationRecord(eventId, data);
      }
      router.push(`/events/${eventId}/accommodation`);
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
        <Link href={`/events/${eventId}/accommodation`} className="rounded-lg p-1.5 hover:bg-border/50">
          <ArrowLeft className="h-5 w-5 text-text-primary" />
        </Link>
        <h1 className="text-xl font-bold text-text-primary">
          {isEdit ? 'Edit Accommodation' : 'Add Accommodation'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="mt-6">
        <FormGrid columns={2}>
          {/* Person Picker - filtered to people WITH travel records */}
          {!isEdit && (
            <div className="col-span-full">
              <label htmlFor="personId" className="mb-1 block text-sm font-medium text-text-primary">
                Person <span className="text-error">*</span>
              </label>
              <p className="mb-2 text-xs text-text-muted">
                Only showing people with travel records for this event
              </p>
              <input
                type="text"
                placeholder="Search by name or email..."
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              {filteredPeople.length > 0 && (
                <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
                  {filteredPeople.map((p) => (
                    <button
                      key={p.personId}
                      type="button"
                      onClick={() => {
                        const hidden = document.getElementById('personId') as HTMLInputElement;
                        if (hidden) hidden.value = p.personId;
                        setPersonSearch(p.personName);
                      }}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-border/30"
                    >
                      <span className="font-medium text-text-primary">{p.personName}</span>
                      <span className="text-xs text-text-muted">{p.personEmail || p.personPhone}</span>
                    </button>
                  ))}
                </div>
              )}
              {personSearch.length >= 2 && filteredPeople.length === 0 && (
                <p className="mt-1 text-xs text-text-muted">
                  No people found. Ensure travel records exist first.
                </p>
              )}
              <input type="hidden" id="personId" name="personId" defaultValue="" required />
            </div>
          )}

          {/* Hotel Name */}
          <div>
            <label htmlFor="hotelName" className="mb-1 block text-sm font-medium text-text-primary">
              Hotel Name <span className="text-error">*</span>
            </label>
            <input
              id="hotelName"
              name="hotelName"
              type="text"
              required
              defaultValue={existing?.hotelName || ''}
              placeholder="Taj Mahal Palace"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Hotel City */}
          <div>
            <label htmlFor="hotelCity" className="mb-1 block text-sm font-medium text-text-primary">
              City
            </label>
            <input
              id="hotelCity"
              name="hotelCity"
              type="text"
              defaultValue={existing?.hotelCity || ''}
              placeholder="Mumbai"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Hotel Address */}
          <div className="col-span-full">
            <label htmlFor="hotelAddress" className="mb-1 block text-sm font-medium text-text-primary">
              Hotel Address
            </label>
            <input
              id="hotelAddress"
              name="hotelAddress"
              type="text"
              defaultValue={existing?.hotelAddress || ''}
              placeholder="Apollo Bunder, Colaba"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Check-in Date */}
          <div>
            <label htmlFor="checkInDate" className="mb-1 block text-sm font-medium text-text-primary">
              Check-in Date <span className="text-error">*</span>
            </label>
            <input
              id="checkInDate"
              name="checkInDate"
              type="date"
              required
              defaultValue={formatDateInput(existing?.checkInDate ?? null)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Check-out Date */}
          <div>
            <label htmlFor="checkOutDate" className="mb-1 block text-sm font-medium text-text-primary">
              Check-out Date <span className="text-error">*</span>
            </label>
            <input
              id="checkOutDate"
              name="checkOutDate"
              type="date"
              required
              defaultValue={formatDateInput(existing?.checkOutDate ?? null)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Room Type */}
          <div>
            <label htmlFor="roomType" className="mb-1 block text-sm font-medium text-text-primary">
              Room Type
            </label>
            <select
              id="roomType"
              name="roomType"
              defaultValue={existing?.roomType || ''}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="">Select...</option>
              <option value="single">Single</option>
              <option value="double">Double</option>
              <option value="twin">Twin</option>
              <option value="triple">Triple</option>
              <option value="suite">Suite</option>
              <option value="dormitory">Dormitory</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Room Number */}
          <div>
            <label htmlFor="roomNumber" className="mb-1 block text-sm font-medium text-text-primary">
              Room Number
            </label>
            <input
              id="roomNumber"
              name="roomNumber"
              type="text"
              defaultValue={existing?.roomNumber || ''}
              placeholder="301"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Shared Room Group */}
          <div className="col-span-full">
            <label htmlFor="sharedRoomGroup" className="mb-1 block text-sm font-medium text-text-primary">
              Shared Room Group
            </label>
            <input
              id="sharedRoomGroup"
              name="sharedRoomGroup"
              type="text"
              defaultValue={existing?.sharedRoomGroup || ''}
              placeholder="e.g. group-A (to link shared room occupants)"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Google Maps URL */}
          <div className="col-span-full">
            <label htmlFor="googleMapsUrl" className="mb-1 block text-sm font-medium text-text-primary">
              Google Maps URL
            </label>
            <input
              id="googleMapsUrl"
              name="googleMapsUrl"
              type="url"
              defaultValue={existing?.googleMapsUrl || ''}
              placeholder="https://maps.google.com/..."
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Booking Reference */}
          <div>
            <label htmlFor="bookingReference" className="mb-1 block text-sm font-medium text-text-primary">
              Booking Reference
            </label>
            <input
              id="bookingReference"
              name="bookingReference"
              type="text"
              defaultValue={existing?.bookingReference || ''}
              placeholder="BK-12345"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Booking PDF URL */}
          <div>
            <label htmlFor="attachmentUrl" className="mb-1 block text-sm font-medium text-text-primary">
              Booking PDF URL
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

          {/* Special Requests - full width */}
          <div className="col-span-full">
            <label htmlFor="specialRequests" className="mb-1 block text-sm font-medium text-text-primary">
              Special Requests
            </label>
            <textarea
              id="specialRequests"
              name="specialRequests"
              rows={2}
              defaultValue={existing?.specialRequests || ''}
              placeholder="Dietary needs, accessibility, etc."
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Notes - full width */}
          <div className="col-span-full">
            <label htmlFor="notes" className="mb-1 block text-sm font-medium text-text-primary">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={existing?.notes || ''}
              placeholder="Any additional details..."
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="col-span-full rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="col-span-full w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-50"
          >
            {loading ? 'Saving...' : isEdit ? 'Update Accommodation' : 'Create Accommodation'}
          </button>
        </FormGrid>
      </form>
    </div>
  );
}
