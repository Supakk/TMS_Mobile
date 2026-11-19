// Trip rules as pure functions (a port of the web app's execution/rules.ts). No React, no network.

import type { RouteGeometry } from './route';

export type TripStatus = 'PLANNED' | 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
export type StopStatus = 'PLANNED' | 'ARRIVED' | 'DELIVERED' | 'DEPARTED';
export type PodStatus = 'PENDING' | 'CAPTURED';
export type StopType = 'PICKUP' | 'DELIVERY';

export type Stop = {
  id: string;
  sequence: number;
  reference: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  serviceMinutes: number;
  status: StopStatus;
  plannedArrivalAt: string | null;
  actualArrivalAt: string | null;
  actualDepartureAt: string | null;
  podStatus: PodStatus;
  stopType: StopType;
  loadIds: string[] | null;
};

export type Trip = {
  id: string;
  tripNumber: string;
  name: string;
  status: TripStatus;
  vehicleKey: string | null;
  driverKey: string | null;
  helperCount: number | null;
  totalDistanceKm: number | null;
  estimatedArrivalAt: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelReason: string | null;
  loadIds: string[];
  stops: Stop[];
  /** The road route, when the backend sends one (see route.ts). Without it the map joins the stops with a straight line. */
  routeGeometry?: RouteGeometry | null;
  version: string;
};

export type StopAction = 'CHECK_IN' | 'PROOF' | 'CHECK_OUT';

export function sortedStops(trip: Pick<Trip, 'stops'>): Stop[] {
  return [...trip.stops].sort((a, b) => a.sequence - b.sequence);
}

const hasLeft = (stop: Stop) => stop.actualDepartureAt !== null;

/** A stop opens only when every earlier stop has left. */
export function isStopOpen(trip: Pick<Trip, 'stops'>, stopId: string): boolean {
  for (const stop of sortedStops(trip)) {
    if (stop.id === stopId) return true;
    if (!hasLeft(stop)) return false;
  }
  return false;
}

/** The stop the driver should work on now, or null when every stop has left. */
export function currentStop(trip: Pick<Trip, 'stops'>): Stop | null {
  return sortedStops(trip).find((stop) => !hasLeft(stop)) ?? null;
}

/** Buttons offered at a stop. Only an IN_TRANSIT trip and a stop that has not left allow any. */
export function stopActions(trip: Pick<Trip, 'status' | 'stops'>, stop: Stop): StopAction[] {
  if (trip.status !== 'IN_TRANSIT' || hasLeft(stop)) return [];
  switch (stop.status) {
    case 'PLANNED':
      return isStopOpen(trip, stop.id) ? ['CHECK_IN'] : [];
    case 'ARRIVED':
      return stop.podStatus === 'CAPTURED' ? ['CHECK_OUT'] : ['PROOF', 'CHECK_OUT'];
    case 'DELIVERED':
      return ['CHECK_OUT'];
    default:
      return [];
  }
}

export function stopsMissingProof(trip: Pick<Trip, 'stops'>): number {
  return trip.stops.filter((stop) => stop.podStatus !== 'CAPTURED').length;
}

export type TripStep = { action: 'START' | 'COMPLETE'; blockedProofCount: number } | null;

/** DISPATCHED can start; IN_TRANSIT can complete once every stop has proof. */
export function tripStep(trip: Pick<Trip, 'status' | 'stops'>): TripStep {
  if (trip.status === 'DISPATCHED') return { action: 'START', blockedProofCount: 0 };
  if (trip.status === 'IN_TRANSIT') return { action: 'COMPLETE', blockedProofCount: stopsMissingProof(trip) };
  return null;
}

export type StopWord = 'delivered' | 'deliveredLeft' | 'atStop' | 'leftNoProof' | 'waiting';

export function stopWord(stop: Stop): StopWord {
  if (stop.status === 'DELIVERED') return hasLeft(stop) ? 'deliveredLeft' : 'delivered';
  if (stop.status === 'ARRIVED') return 'atStop';
  if (stop.status === 'DEPARTED') return 'leftNoProof';
  return 'waiting';
}

/** A trip can be accepted or rejected only while it waits to start and has not been answered. */
export function canAcknowledge(trip: { status: TripStatus }, acknowledged: boolean): boolean {
  return !acknowledged && (trip.status === 'PLANNED' || trip.status === 'DISPATCHED');
}

export type TripBucket = 'PENDING' | 'ACCEPTED' | 'IN_TRANSIT' | 'DONE';

/**
 * Where a trip is shown on the home page. A trip that waits for the driver's answer is "pending" (a banner);
 * one answered but not started is "accepted"; finished and cancelled trips are "done".
 */
export function tripBucket(status: TripStatus, acknowledged: boolean): TripBucket {
  if (status === 'IN_TRANSIT') return 'IN_TRANSIT';
  if (status === 'DELIVERED' || status === 'CANCELLED') return 'DONE';
  return acknowledged ? 'ACCEPTED' : 'PENDING';
}
