import type { Trip } from './trip';

// What the driver does is stored as a command. The screen shows the server's copy of a trip with the
// commands that are still waiting to be sent applied on top (a "projection"), so the app keeps working
// without a signal and the server's copy is never overwritten by a guess.

export type Photo = { uri: string; name: string; mimeType: string };

export type Command =
  | { kind: 'ACK'; accepted: boolean; reason: string | null }
  | { kind: 'START'; occurredAt: string }
  | { kind: 'CHECK_IN'; stopId: string; occurredAt: string; manualOverride: boolean; overrideReason: string | null }
  | { kind: 'CHECK_OUT'; stopId: string; occurredAt: string }
  | {
      kind: 'POD';
      stopId: string;
      recipientName: string;
      deliveredAt: string;
      notes: string | null;
      photo: Photo | null;
      clientDocumentId: string;
    }
  | { kind: 'COMPLETE'; occurredAt: string }
  | { kind: 'PROBLEM'; type: string; severity: string; description: string }
  | { kind: 'NOTE'; text: string }
  | { kind: 'LOAD_REQUEST'; loadId: string; reasonCode: string; reasonText: string | null }
  | { kind: 'POD_PHOTO'; proofId: string; photo: Photo; clientDocumentId: string };

export type CommandKind = Command['kind'];

/** Commands that change the trip: sent one at a time, in order, each with the trip's latest version. */
const TRIP_KINDS: CommandKind[] = ['START', 'CHECK_IN', 'CHECK_OUT', 'POD', 'COMPLETE'];

export const isTripCommand = (kind: CommandKind): boolean => TRIP_KINDS.includes(kind);

const patchStop = (trip: Trip, stopId: string, patch: Partial<Trip['stops'][number]>): Trip => ({
  ...trip,
  stops: trip.stops.map((stop) => (stop.id === stopId ? { ...stop, ...patch } : stop)),
});

/** The trip as it will be once the server has accepted this command. Other kinds leave it unchanged. */
export function applyCommand(trip: Trip, command: Command): Trip {
  switch (command.kind) {
    case 'START':
      return { ...trip, status: 'IN_TRANSIT', startedAt: command.occurredAt };
    case 'CHECK_IN':
      return patchStop(trip, command.stopId, { status: 'ARRIVED', actualArrivalAt: command.occurredAt });
    case 'CHECK_OUT': {
      const stop = trip.stops.find((x) => x.id === command.stopId);
      // Leaving without proof marks the stop DEPARTED; leaving after proof keeps it DELIVERED.
      const status = stop?.podStatus === 'CAPTURED' ? 'DELIVERED' : 'DEPARTED';
      return patchStop(trip, command.stopId, { status, actualDepartureAt: command.occurredAt });
    }
    case 'POD':
      return patchStop(trip, command.stopId, { status: 'DELIVERED', podStatus: 'CAPTURED' });
    case 'COMPLETE':
      return { ...trip, status: 'DELIVERED', completedAt: command.occurredAt };
    default:
      return trip;
  }
}

export type RowState = 'pending' | 'sending' | 'failed' | 'done';

/**
 * The server's trip plus the commands still waiting, in the order they were made. Rows after a failed
 * one are left out: they cannot be sent until the driver deals with the failure, so showing their effect
 * would promise something that is not going to happen.
 */
export function projectTrip(server: Trip, rows: { command: Command; status: RowState }[]): Trip {
  let trip = server;
  for (const row of rows) {
    if (row.status === 'failed') break;
    if (row.status === 'done') continue;
    trip = applyCommand(trip, row.command);
  }
  return trip;
}

/** True when the server's copy already shows what the command wanted, so resending it is pointless. */
export function effectApplied(trip: Trip, command: Command): boolean {
  const stop = 'stopId' in command ? trip.stops.find((x) => x.id === command.stopId) : undefined;
  switch (command.kind) {
    case 'START':
      return trip.status === 'IN_TRANSIT' || trip.status === 'DELIVERED';
    case 'CHECK_IN':
      return !!stop && (stop.status !== 'PLANNED' || stop.actualArrivalAt !== null);
    case 'CHECK_OUT':
      return !!stop && stop.actualDepartureAt !== null;
    case 'POD':
      return !!stop && stop.podStatus === 'CAPTURED';
    case 'COMPLETE':
      return trip.status === 'DELIVERED';
    default:
      return false;
  }
}
