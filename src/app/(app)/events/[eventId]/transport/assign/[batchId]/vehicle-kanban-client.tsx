'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, User, Bus, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useResponsiveNav, type NavMode } from '@/hooks/use-responsive-nav';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { movePassenger, createVehicleAssignment } from '@/lib/actions/transport';
import { VEHICLE_TYPES } from '@/lib/validations/transport';

type Batch = {
  id: string;
  eventId: string;
  pickupHub: string;
  dropHub: string;
  timeWindowStart: Date;
  timeWindowEnd: Date;
  batchStatus: string;
};

type Vehicle = {
  id: string;
  batchId: string;
  vehicleLabel: string;
  vehicleType: string;
  capacity: number;
  driverName: string | null;
  assignmentStatus: string;
};

type Passenger = {
  id: string;
  batchId: string;
  vehicleAssignmentId: string | null;
  personId: string;
  assignmentStatus: string;
  personName: string;
  personPhone: string | null;
};

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  sedan: 'Sedan',
  suv: 'SUV',
  van: 'Van',
  tempo_traveller: 'Tempo',
  bus: 'Bus',
  other: 'Other',
};

// Unassigned column uses a sentinel ID
const UNASSIGNED_COLUMN = 'unassigned';

// ── Pure layout helper (exported for testing) ───────────────

export function getKanbanLayoutClasses(navMode: NavMode) {
  const boardClasses = {
    mobile: 'flex flex-col gap-4',
    tablet: 'flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4',
    desktop: 'flex gap-4 pb-4',
  }[navMode];

  const columnClasses = {
    mobile: 'w-full',
    tablet: 'min-w-[300px] flex-shrink-0 snap-start',
    desktop: 'min-w-[250px] flex-1',
  }[navMode];

  const addVehicleClasses = {
    mobile: 'w-full',
    tablet: 'min-w-[300px] flex-shrink-0 snap-start',
    desktop: 'w-64 flex-shrink-0',
  }[navMode];

  const enableDragDrop = navMode !== 'mobile';

  return { boardClasses, columnClasses, addVehicleClasses, enableDragDrop };
}

export function VehicleKanbanClient({
  eventId,
  batch,
  vehicles,
  passengers,
}: {
  eventId: string;
  batch: Batch;
  vehicles: Vehicle[];
  passengers: Passenger[];
}) {
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const { navMode, isMobile } = useResponsiveNav();
  const { boardClasses, columnClasses, addVehicleClasses, enableDragDrop } = getKanbanLayoutClasses(navMode);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Group passengers by vehicle (null = unassigned)
  const unassigned = passengers.filter((p) => !p.vehicleAssignmentId);
  const byVehicle = new Map<string, Passenger[]>();
  for (const v of vehicles) {
    byVehicle.set(v.id, passengers.filter((p) => p.vehicleAssignmentId === v.id));
  }

  // Build a set of valid column IDs for resolving drop targets
  const columnIds = new Set([UNASSIGNED_COLUMN, ...vehicles.map((v) => v.id)]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const passengerId = active.id as string;
    const overId = over.id as string;

    // Resolve target column: if dropped on a column directly, use it.
    // If dropped on another passenger card, resolve to that card's container.
    let targetColumnId: string;
    if (columnIds.has(overId)) {
      targetColumnId = overId;
    } else {
      // over.id is a passenger card — get its container from sortable data
      targetColumnId = (over.data?.current?.containerId as string) || UNASSIGNED_COLUMN;
    }

    // Don't move if same column as source
    const sourceColumnId = (active.data?.current?.containerId as string) || UNASSIGNED_COLUMN;
    if (targetColumnId === sourceColumnId) return;

    const targetVehicleId = targetColumnId === UNASSIGNED_COLUMN ? '' : targetColumnId;

    setMoving(true);
    try {
      await movePassenger(eventId, {
        passengerAssignmentId: passengerId,
        targetVehicleAssignmentId: targetVehicleId,
      });
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to move passenger');
    } finally {
      setMoving(false);
    }
  }

  async function handleAddVehicle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddingVehicle(true);

    const form = new FormData(e.currentTarget);
    const data = {
      batchId: batch.id,
      vehicleLabel: form.get('vehicleLabel') as string,
      vehicleType: form.get('vehicleType') as string,
      capacity: Number(form.get('capacity')),
      driverName: form.get('driverName') as string || undefined,
    };

    try {
      await createVehicleAssignment(eventId, data);
      setShowAddVehicle(false);
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add vehicle');
    } finally {
      setAddingVehicle(false);
    }
  }

  const boardContent = (
    <div className={cn('mt-6', boardClasses)}>
      {/* Unassigned Column */}
      <KanbanColumn
        id={UNASSIGNED_COLUMN}
        title="Unassigned"
        count={unassigned.length}
        passengers={unassigned}
        className={columnClasses}
        enableDragDrop={enableDragDrop}
      />

      {/* Vehicle Columns */}
      {vehicles.map((vehicle) => {
        const vPassengers = byVehicle.get(vehicle.id) || [];
        return (
          <KanbanColumn
            key={vehicle.id}
            id={vehicle.id}
            title={vehicle.vehicleLabel}
            subtitle={`${VEHICLE_TYPE_LABELS[vehicle.vehicleType] || vehicle.vehicleType} · Cap: ${vehicle.capacity}`}
            driver={vehicle.driverName}
            count={vPassengers.length}
            capacity={vehicle.capacity}
            passengers={vPassengers}
            className={columnClasses}
            enableDragDrop={enableDragDrop}
          />
        );
      })}

      {/* Add Vehicle Column */}
      <div className={addVehicleClasses}>
        {showAddVehicle ? (
          <form onSubmit={handleAddVehicle} className="rounded-xl border border-dashed border-border bg-surface p-3">
            <div className="space-y-2">
              <input
                name="vehicleLabel"
                type="text"
                required
                placeholder="Vehicle label"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <select
                name="vehicleType"
                required
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              >
                {VEHICLE_TYPES.map((t) => (
                  <option key={t} value={t}>{VEHICLE_TYPE_LABELS[t] || t}</option>
                ))}
              </select>
              <input
                name="capacity"
                type="number"
                required
                min={1}
                placeholder="Capacity"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <input
                name="driverName"
                type="text"
                placeholder="Driver name (optional)"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <div className="flex gap-2">
                <button type="submit" disabled={addingVehicle} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                  {addingVehicle ? 'Adding...' : 'Add'}
                </button>
                <button type="button" onClick={() => setShowAddVehicle(false)} className="flex-1 rounded-lg border border-border px-3 py-2 text-xs text-text-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowAddVehicle(true)}
            className={cn(
              'flex h-24 items-center justify-center rounded-xl border-2 border-dashed border-border text-sm text-text-muted hover:border-accent/50 hover:text-accent',
              isMobile ? 'w-full' : 'w-full',
            )}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Vehicle
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/events/${eventId}/transport`} className="rounded-lg p-1.5 hover:bg-border/50">
            <ArrowLeft className="h-5 w-5 text-text-primary" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Vehicle Assignment</h1>
            <p className="text-xs text-text-muted">
              {batch.pickupHub} → {batch.dropHub} ·{' '}
              {format(new Date(batch.timeWindowStart), 'HH:mm')}–{format(new Date(batch.timeWindowEnd), 'HH:mm')}
            </p>
          </div>
        </div>
      </div>

      {moving && (
        <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Moving passenger...
        </div>
      )}

      {/* Kanban Board — wrap in DndContext only when drag-drop is enabled */}
      {enableDragDrop ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
        >
          {boardContent}
        </DndContext>
      ) : (
        boardContent
      )}
    </div>
  );
}

function KanbanColumn({
  id,
  title,
  subtitle,
  driver,
  count,
  capacity,
  passengers,
  className,
  enableDragDrop,
}: {
  id: string;
  title: string;
  subtitle?: string;
  driver?: string | null;
  count: number;
  capacity?: number;
  passengers: Passenger[];
  className?: string;
  enableDragDrop: boolean;
}) {
  const isOverCapacity = capacity !== undefined && count > capacity;
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className={cn('rounded-xl border border-border bg-background p-3', className)}>
      {/* Column Header */}
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {id === UNASSIGNED_COLUMN ? (
              <User className="h-4 w-4 text-text-muted" />
            ) : (
              <Bus className="h-4 w-4 text-primary" />
            )}
            <span className="text-sm font-semibold text-text-primary">{title}</span>
          </div>
          <span className={cn('text-xs font-medium', isOverCapacity ? 'text-red-600' : 'text-text-muted')}>
            {count}{capacity !== undefined ? `/${capacity}` : ''}
          </span>
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
        {driver && <p className="text-xs text-text-muted">Driver: {driver}</p>}
      </div>

      {/* Drop Zone — registered as droppable container */}
      <div
        ref={setNodeRef}
        className={cn(
          'min-h-[80px] space-y-2 rounded-lg transition-colors',
          isOver && 'bg-accent/5 ring-2 ring-accent/30',
        )}
      >
        {passengers.map((passenger) => (
          <PassengerCard key={passenger.id} passenger={passenger} containerId={id} enableDragDrop={enableDragDrop} />
        ))}
        {passengers.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border text-xs text-text-muted">
            Drop passengers here
          </div>
        )}
      </div>
    </div>
  );
}

function PassengerCard({ passenger, containerId, enableDragDrop }: { passenger: Passenger; containerId: string; enableDragDrop: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: passenger.id,
    data: { containerId },
    disabled: !enableDragDrop,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(enableDragDrop ? listeners : {})}
      className={cn(
        'flex items-center gap-2 rounded-lg border border-border bg-surface p-2.5 text-sm',
        enableDragDrop && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-50 shadow-lg',
      )}
    >
      {enableDragDrop && <GripVertical className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-text-primary">{passenger.personName}</p>
        {passenger.personPhone && (
          <p className="truncate text-xs text-text-muted">{passenger.personPhone}</p>
        )}
      </div>
    </div>
  );
}
