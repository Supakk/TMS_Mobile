import type { Trip } from '../domain/trip';
import { request } from './client';

// Shapes follow MobileContracts.cs and OperationsContracts.cs. Every call is under /mobile/me.

export type TripSummary = {
  id: string;
  tripNumber: string;
  name: string;
  status: Trip['status'];
  vehicleCode: string | null;
  scheduledStartAt: string | null;
  estimatedArrivalAt: string | null;
  stopCount: number;
  completedStopCount: number;
  acknowledged: boolean;
  version: string;
};

export type DeviceView = { id: string; platform: string; deviceKey: string; pushEnabled: boolean; lastSeenAt: string };
export type SyncView = { serverTime: string; trips: TripSummary[]; devices: DeviceView[] };

export type ArrivalStatus = {
  tripId: string;
  stopId: string;
  distanceMeters: number | null;
  arrivalGeofenceMeters: number;
  gpsFresh: boolean;
  canCheckIn: boolean;
};

export type Proof = { id: string; tripStopId: string; recipientName: string; deliveredAt: string };

export type TrackingItem = {
  clientEventId: string;
  eventType: string;
  occurredAt: string;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  notes?: string | null;
};

export type ExceptionView = { id: string; type: string; severity: string; status: string; description: string };
export type NoteView = { id: string; at: string; by: string; text: string };
export type LoadChangeView = { id: string; action: string; status: string; reasonCode: string; reasonText: string };

type Auth = { token: string };
type Versioned = Auth & { version: string };
type Keyed = Versioned & { idempotencyKey: string };

const trip = (id: string) => `/mobile/me/trips/${id}`;
const stop = (tripId: string, stopId: string) => `${trip(tripId)}/stops/${stopId}`;

export async function sync({ token }: Auth): Promise<SyncView> {
  return (await request<SyncView>('/mobile/me/sync', { token })).data;
}

export async function registerDevice({ token }: Auth, deviceKey: string, platform: 'ANDROID' | 'IOS'): Promise<void> {
  await request('/mobile/me/devices', { method: 'POST', token, body: { platform, deviceKey, pushToken: null } });
}

export async function getTrip({ token }: Auth, tripId: string): Promise<Trip> {
  return (await request<Trip>(trip(tripId), { token })).data;
}

export async function acknowledge({ token }: Auth, tripId: string, accepted: boolean, reason?: string): Promise<void> {
  await request(`${trip(tripId)}/acknowledge`, { method: 'POST', token, body: { accepted, reason: reason ?? null } });
}

type EventBody = { occurredAt: string; deviceKey: string };

export async function startTrip(auth: Keyed, tripId: string, body: EventBody): Promise<Trip> {
  return (
    await request<Trip>(`${trip(tripId)}/start`, {
      method: 'POST',
      token: auth.token,
      version: auth.version,
      idempotencyKey: auth.idempotencyKey,
      body,
    })
  ).data;
}

export async function completeTrip(auth: Keyed, tripId: string, body: EventBody): Promise<Trip> {
  return (
    await request<Trip>(`${trip(tripId)}/complete`, {
      method: 'POST',
      token: auth.token,
      version: auth.version,
      idempotencyKey: auth.idempotencyKey,
      body,
    })
  ).data;
}

export async function arrivalStatus({ token }: Auth, tripId: string, stopId: string): Promise<ArrivalStatus> {
  return (await request<ArrivalStatus>(`${stop(tripId, stopId)}/arrival-status`, { token })).data;
}

/** Check-in and check-out carry no idempotency key: a retry after a lost answer gives 412. */
export async function checkIn(
  auth: Versioned,
  tripId: string,
  stopId: string,
  body: EventBody & { manualOverride: boolean; overrideReason: string | null },
): Promise<Trip> {
  return (
    await request<Trip>(`${stop(tripId, stopId)}/check-in`, {
      method: 'POST',
      token: auth.token,
      version: auth.version,
      body,
    })
  ).data;
}

export async function checkOut(auth: Versioned, tripId: string, stopId: string, body: EventBody): Promise<Trip> {
  return (
    await request<Trip>(`${stop(tripId, stopId)}/check-out`, {
      method: 'POST',
      token: auth.token,
      version: auth.version,
      body,
    })
  ).data;
}

export async function getProofId({ token }: Auth, tripId: string, stopId: string): Promise<string> {
  return (await request<Proof>(`${stop(tripId, stopId)}/proof-of-delivery`, { token })).data.id;
}

export async function captureProof(
  auth: Keyed,
  tripId: string,
  stopId: string,
  body: { recipientName: string; deliveredAt: string; notes: string | null },
): Promise<{ proof: Proof; version: string | null }> {
  const { data, etag } = await request<Proof>(`${stop(tripId, stopId)}/proof-of-delivery`, {
    method: 'POST',
    token: auth.token,
    version: auth.version,
    idempotencyKey: auth.idempotencyKey,
    body: { ...body, signatureReference: null, documentReference: null },
  });
  return { proof: data, version: etag ? etag.replace(/"/g, '') : null };
}

/** One photo per call, with a stable clientDocumentId so a retry does not store it twice. */
export async function uploadProofPhoto(
  { token }: Auth,
  proofId: string,
  file: { uri: string; name: string; mimeType: string },
  clientDocumentId: string,
): Promise<void> {
  const form = new FormData();
  // React Native accepts this {uri, name, type} shape for a file part.
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  form.append('type', 'POD_PHOTO');
  form.append('description', 'Proof of delivery photo');
  form.append('clientDocumentId', clientDocumentId);
  await request(`/mobile/me/proofs/${proofId}/documents`, { method: 'POST', token, body: form });
}

export async function sendTracking({ token }: Auth, tripId: string, items: TrackingItem[]): Promise<void> {
  await request(`${trip(tripId)}/tracking-events/batch`, { method: 'POST', token, body: { items } });
}

export async function reportProblem(
  { token }: Auth,
  tripId: string,
  body: { type: string; severity: string; description: string },
): Promise<ExceptionView> {
  return (await request<ExceptionView>(`${trip(tripId)}/exceptions`, { method: 'POST', token, body })).data;
}

export async function listProblems({ token }: Auth, tripId: string): Promise<ExceptionView[]> {
  return (await request<ExceptionView[]>(`${trip(tripId)}/exceptions`, { token })).data;
}

export async function addNote({ token }: Auth, tripId: string, text: string): Promise<NoteView> {
  return (await request<NoteView>(`${trip(tripId)}/notes`, { method: 'POST', token, body: { text } })).data;
}

export async function listNotes({ token }: Auth, tripId: string): Promise<NoteView[]> {
  return (await request<NoteView[]>(`${trip(tripId)}/notes`, { token })).data;
}

/** A request only: the planner decides. */
export async function requestLoadRemoval(
  auth: Auth & { idempotencyKey: string },
  tripId: string,
  body: { loadId: string; reasonCode: string; reasonText: string | null },
): Promise<LoadChangeView> {
  return (
    await request<LoadChangeView>(`${trip(tripId)}/load-changes`, {
      method: 'POST',
      token: auth.token,
      idempotencyKey: auth.idempotencyKey,
      body: { action: 'REMOVE', ...body },
    })
  ).data;
}

export async function listLoadChanges({ token }: Auth, tripId: string): Promise<LoadChangeView[]> {
  return (await request<LoadChangeView[]>(`${trip(tripId)}/load-changes`, { token })).data;
}
