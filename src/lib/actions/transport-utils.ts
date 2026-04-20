const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

export function floorToThreeHourWindowUtc(date: Date): { start: Date; end: Date } {
  const bucket = Math.floor(date.getUTCHours() / 3) * 3;
  const start = new Date(Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), bucket, 0, 0, 0,
  ));
  return { start, end: new Date(start.getTime() + THREE_HOURS_MS) };
}

export type TravelRow = {
  id: string;
  personId: string;
  direction: string;
  toCity: string;
  toLocation: string | null;
  fromCity: string;
  fromLocation: string | null;
  arrivalAtUtc: Date | null;
  departureAtUtc: Date | null;
};

export type TravelCluster = {
  movementType: 'arrival' | 'departure';
  serviceDate: Date;
  timeWindowStart: Date;
  timeWindowEnd: Date;
  sourceCity: string;
  pickupHub: string;
  dropHub: string;
  records: Array<{ personId: string; travelRecordId: string }>;
};

export function buildClusters(records: TravelRow[]): TravelCluster[] {
  const map = new Map<string, TravelCluster>();
  for (const r of records) {
    const isInbound = r.direction === 'inbound' && r.arrivalAtUtc !== null;
    const isOutbound = r.direction === 'outbound' && r.departureAtUtc !== null;
    if (!isInbound && !isOutbound) continue;
    const movementType = isInbound ? 'arrival' : 'departure';
    const timestamp = isInbound ? r.arrivalAtUtc : r.departureAtUtc;
    if (timestamp === null) continue;
    const city = isInbound ? r.toCity : r.fromCity;
    const { start: winStart, end: winEnd } = floorToThreeHourWindowUtc(timestamp);
    const serviceDate = new Date(Date.UTC(
      timestamp.getUTCFullYear(), timestamp.getUTCMonth(), timestamp.getUTCDate(),
    ));
    const key = movementType + '|' + city + '|' + winStart.toISOString();
    if (!map.has(key)) {
      map.set(key, {
        movementType, serviceDate, timeWindowStart: winStart, timeWindowEnd: winEnd,
        sourceCity: city,
        pickupHub: isInbound ? (r.toLocation || city) : 'Event Venue',
        dropHub: isInbound ? 'Event Venue' : (r.fromLocation || city),
        records: [],
      });
    }
    map.get(key)?.records.push({ personId: r.personId, travelRecordId: r.id });
  }
  return Array.from(map.values());
}
