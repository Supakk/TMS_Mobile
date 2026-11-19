// The road route of a trip, as the backend sends it. Pure functions: no React, no network.
//
// Proposed contract (the backend does not send it yet; every field is optional):
//   Trip.routeGeometry is one of
//     - a string: an encoded polyline, precision 5 (the format Google and OSRM use), or
//     - a GeoJSON LineString: { "type": "LineString", "coordinates": [[longitude, latitude], ...] }
//   covering the whole trip from the first stop to the last, in driving order.
// The app keeps it with the saved trip, so the line also shows without a signal.

export type LatLng = { latitude: number; longitude: number };
export type RouteGeometry = string | { type: 'LineString'; coordinates: [number, number][] };

/** Decodes an encoded polyline (precision 5 unless told otherwise). Returns [] for text that is not one. */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    const dLat = next();
    const dLon = next();
    if (dLat === null || dLon === null) return [];
    lat += dLat;
    lon += dLon;
    points.push({ latitude: lat / factor, longitude: lon / factor });
  }
  return points;
}

const valid = (p: LatLng) =>
  Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;

/** The points to draw, or null when there is no usable route (missing, malformed, or fewer than two points). */
export function routePath(geometry: RouteGeometry | null | undefined): LatLng[] | null {
  if (!geometry) return null;
  let points: LatLng[];
  if (typeof geometry === 'string') {
    points = decodePolyline(geometry);
  } else if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
    points = geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
  } else {
    return null;
  }
  return points.length >= 2 && points.every(valid) ? points : null;
}
