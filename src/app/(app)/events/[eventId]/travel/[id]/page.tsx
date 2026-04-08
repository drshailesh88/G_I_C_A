import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { getTravelRecord } from '@/lib/actions/travel';
import { TravelFormClient } from '../travel-form-client';

type Params = Promise<{ eventId: string; id: string }>;

export default async function EditTravelPage({
  params,
}: {
  params: Params;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const { eventId, id } = await params;

  try {
    const record = await getTravelRecord(eventId, id);
    return (
      <TravelFormClient
        eventId={eventId}
        people={[]}
        existing={{
          id: record.id,
          personId: record.personId,
          direction: record.direction,
          travelMode: record.travelMode,
          fromCity: record.fromCity,
          fromLocation: record.fromLocation,
          toCity: record.toCity,
          toLocation: record.toLocation,
          departureAtUtc: record.departureAtUtc,
          arrivalAtUtc: record.arrivalAtUtc,
          carrierName: record.carrierName,
          serviceNumber: record.serviceNumber,
          pnrOrBookingRef: record.pnrOrBookingRef,
          seatOrCoach: record.seatOrCoach,
          terminalOrGate: record.terminalOrGate,
          attachmentUrl: record.attachmentUrl,
          notes: record.notes,
        }}
      />
    );
  } catch {
    notFound();
  }
}
