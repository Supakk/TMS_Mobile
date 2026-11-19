import { decodePolyline, routePath } from '../src/domain/route';

describe('decodePolyline', () => {
  it('decodes the standard example', () => {
    // From Google's documentation of the encoded polyline format.
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ latitude: 38.5, longitude: -120.2 });
    expect(points[1]).toEqual({ latitude: 40.7, longitude: -120.95 });
    expect(points[2]).toEqual({ latitude: 43.252, longitude: -126.453 });
  });

  it('gives nothing for text that is cut off or not a polyline', () => {
    expect(decodePolyline('')).toEqual([]);
    expect(decodePolyline('_p~iF')).toEqual([]); // a latitude with no longitude
    expect(decodePolyline('hello world')).toEqual([]);
  });
});

describe('routePath', () => {
  it('reads an encoded polyline', () => {
    expect(routePath('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toHaveLength(3);
  });

  it('reads a GeoJSON LineString, which is longitude first', () => {
    const path = routePath({ type: 'LineString', coordinates: [[100.5, 13.7], [100.6, 13.8]] });
    expect(path).toEqual([
      { latitude: 13.7, longitude: 100.5 },
      { latitude: 13.8, longitude: 100.6 },
    ]);
  });

  it('is null when there is no route or it is unusable', () => {
    expect(routePath(null)).toBeNull();
    expect(routePath(undefined)).toBeNull();
    expect(routePath('')).toBeNull();
    expect(routePath({ type: 'LineString', coordinates: [[100.5, 13.7]] })).toBeNull(); // one point is not a line
    expect(routePath({ type: 'LineString', coordinates: [[100.5, 13.7], [100.6, 913.8]] })).toBeNull(); // not a latitude
  });
});
