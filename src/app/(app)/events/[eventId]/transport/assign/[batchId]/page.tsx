import { redirect, notFound } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { getTransportBatch, getBatchVehicles, getBatchPassengers } from '@/lib/actions/transport';
import { VehicleKanbanClient } from './vehicle-kanban-client';

type Params = Promise<{ eventId: string; batchId: string }>;

export default async function VehicleAssignmentPage({
  params,
}: {
  params: Params;
}) {
  const { eventId, batchId } = await params;

  try {
    await assertEventAccess(eventId);
  } catch {
    redirect('/login');
  }

  try {
    const [batch, vehicles, passengers] = await Promise.all([
      getTransportBatch(eventId, batchId),
      getBatchVehicles(eventId, batchId),
      getBatchPassengers(eventId, batchId),
    ]);

    return (
      <VehicleKanbanClient
        eventId={eventId}
        batch={batch}
        vehicles={vehicles}
        passengers={passengers}
      />
    );
  } catch {
    notFound();
  }
}
