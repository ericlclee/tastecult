const EARTH_RADIUS_KM = 6371;

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Lat/lng box around a circle of `radiusKm`, used as an index-friendly prefilter
 * before exact distance filtering. It's never smaller than the circle.
 */
export function boundingBox({ lat, lng }: Coordinates, radiusKm: number): BoundingBox {
  const latDelta = toDegrees(radiusKm / EARTH_RADIUS_KM);
  // A degree of longitude shrinks towards the poles; clamp so the box stays finite there
  const lngDelta = latDelta / Math.max(Math.cos(toRadians(lat)), 0.01);
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

/** Great-circle (haversine) distance in km. */
export function distanceKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
