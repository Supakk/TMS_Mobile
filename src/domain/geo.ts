// The backend's own arrival rule (MobileRules): within 200 m of the stop, using a position no older than 5 minutes.
// The app uses it to decide, without a connection, whether to offer a normal check-in or a manual one.
// The server still has the final say when the command arrives.

export const ARRIVAL_GEOFENCE_METERS = 200;
export const MAX_GPS_AGE_MS = 5 * 60 * 1000;

export type Fix = { latitude: number; longitude: number; at: number };

const radians = (value: number) => (value * Math.PI) / 180;

/** Great-circle distance in metres (haversine), the same radius the backend uses. */
export function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const radius = 6_371_008.8;
  const dLat = radians(bLat - aLat);
  const dLon = radians(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export type LocalArrival = { gpsFresh: boolean; distanceMeters: number | null; canCheckIn: boolean };

export function localArrival(fix: Fix | null, stop: { latitude: number; longitude: number }, now: number): LocalArrival {
  if (!fix || now - fix.at > MAX_GPS_AGE_MS) return { gpsFresh: false, distanceMeters: null, canCheckIn: false };
  const distance = distanceMeters(fix.latitude, fix.longitude, stop.latitude, stop.longitude);
  return { gpsFresh: true, distanceMeters: Math.round(distance), canCheckIn: distance <= ARRIVAL_GEOFENCE_METERS };
}
