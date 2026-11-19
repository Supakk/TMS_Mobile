import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { routePath, type LatLng, type RouteGeometry } from '../domain/route';
import type { Stop } from '../domain/trip';
import { sortedStops } from '../domain/trip';
import { colors } from '../theme';

// The only place that knows which map library is used. A trip's stops are drawn in order as markers. They are joined
// by the road route when the backend sent one, otherwise by a dashed straight line (it only says "in this order"). The map is a still picture (Android "lite mode"): it does not fight the page for touches and it is light
// on a mid-range phone. With no signal the tiles are missing and the grey background shows; the stops stay listed below.

const PAD = 0.35; // extra room around the stops, as a fraction of their spread

function regionFor(points: LatLng[]) {
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    // A single stop still needs a sensible zoom.
    latitudeDelta: Math.max((maxLat - minLat) * (1 + PAD * 2), 0.04),
    longitudeDelta: Math.max((maxLon - minLon) * (1 + PAD * 2), 0.04),
  };
}

export function RouteMap({ stops, geometry, height = 190 }: { stops: Stop[]; geometry?: RouteGeometry | null; height?: number }) {
  const ordered = sortedStops({ stops }).filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  if (ordered.length === 0) return null;
  const stopPoints = ordered.map((s) => ({ latitude: s.latitude, longitude: s.longitude }));
  const road = routePath(geometry);

  return (
    <View style={[styles.frame, { height }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={regionFor(road ? [...road, ...stopPoints] : stopPoints)}
        liteMode
        toolbarEnabled={false}
        zoomEnabled={false}
        scrollEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {road ? (
          <Polyline coordinates={road} strokeColor={colors.accent} strokeWidth={4} lineJoin="round" lineCap="round" />
        ) : stopPoints.length > 1 ? (
          <Polyline coordinates={stopPoints} strokeColor={colors.accent} strokeWidth={3} lineDashPattern={[10, 8]} />
        ) : null}
        {ordered.map((s) => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.latitude, longitude: s.longitude }}
            title={`${s.sequence}. ${s.name}`}
            pinColor={colors.accent}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(22, 24, 29, 0.08)' },
});
