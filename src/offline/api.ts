import * as trips from '../api/trips';
import { getDeviceKey } from '../device';
import type { EngineApi } from './types';

/** Connects the engine to the real API for one signed-in driver. */
export function makeApi(token: string): EngineApi {
  const auth = { token };
  return {
    fetchTrip: (tripId) => trips.getTrip(auth, tripId),
    fetchProofId: (tripId, stopId) => trips.getProofId(auth, tripId, stopId),
    startTrip: async (tripId, version, key, occurredAt) =>
      trips.startTrip({ token, version, idempotencyKey: key }, tripId, { occurredAt, deviceKey: await getDeviceKey() }),
    completeTrip: async (tripId, version, key, occurredAt) =>
      trips.completeTrip({ token, version, idempotencyKey: key }, tripId, { occurredAt, deviceKey: await getDeviceKey() }),
    checkIn: async (tripId, stopId, version, body) =>
      trips.checkIn({ token, version }, tripId, stopId, { ...body, deviceKey: await getDeviceKey() }),
    checkOut: async (tripId, stopId, version, occurredAt) =>
      trips.checkOut({ token, version }, tripId, stopId, { occurredAt, deviceKey: await getDeviceKey() }),
    captureProof: async (tripId, stopId, version, key, body) => {
      const result = await trips.captureProof({ token, version, idempotencyKey: key }, tripId, stopId, body);
      return { proofId: result.proof.id, version: result.version };
    },
    uploadPhoto: (proofId, photo, clientDocumentId) => trips.uploadProofPhoto(auth, proofId, photo, clientDocumentId),
    acknowledge: (tripId, accepted, reason) => trips.acknowledge(auth, tripId, accepted, reason ?? undefined),
    reportProblem: async (tripId, body) => void (await trips.reportProblem(auth, tripId, body)),
    addNote: async (tripId, text) => void (await trips.addNote(auth, tripId, text)),
    requestLoadRemoval: async (tripId, key, body) =>
      void (await trips.requestLoadRemoval({ token, idempotencyKey: key }, tripId, body)),
    sendTracking: (tripId, items) => trips.sendTracking(auth, tripId, items),
  };
}
