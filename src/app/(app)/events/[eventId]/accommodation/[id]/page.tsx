import { redirect, notFound } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { getAccommodationRecord } from '@/lib/actions/accommodation';
import { AccommodationFormClient } from '../accommodation-form-client';

type Params = Promise<{ eventId: string; id: string }>;

export default async function EditAccommodationPage({
  params,
}: {
  params: Params;
}) {
  const { eventId, id } = await params;

  try {
    await assertEventAccess(eventId);
  } catch {
    redirect('/login');
  }

  try {
    const record = await getAccommodationRecord(eventId, id);
    return (
      <AccommodationFormClient
        eventId={eventId}
        peopleWithTravel={[]}
        existing={{
          id: record.id,
          personId: record.personId,
          hotelName: record.hotelName,
          hotelAddress: record.hotelAddress,
          hotelCity: record.hotelCity,
          googleMapsUrl: record.googleMapsUrl,
          roomType: record.roomType,
          roomNumber: record.roomNumber,
          sharedRoomGroup: record.sharedRoomGroup,
          checkInDate: record.checkInDate,
          checkOutDate: record.checkOutDate,
          bookingReference: record.bookingReference,
          attachmentUrl: record.attachmentUrl,
          specialRequests: record.specialRequests,
          notes: record.notes,
        }}
      />
    );
  } catch {
    notFound();
  }
}
