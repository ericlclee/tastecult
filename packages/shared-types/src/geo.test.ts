import { describe, expect, it } from 'vitest';
import { boundingBox, distanceKm } from './geo';

const kingsCross = { lat: 51.5355, lng: -0.125 };
const soho = { lat: 51.5134, lng: -0.134 };

describe('distanceKm', () => {
  it('measures a known London distance', () => {
    expect(distanceKm(kingsCross, soho)).toBeCloseTo(2.53, 1);
  });

  it('is zero for the same point and symmetric', () => {
    expect(distanceKm(kingsCross, kingsCross)).toBe(0);
    expect(distanceKm(kingsCross, soho)).toBeCloseTo(distanceKm(soho, kingsCross), 10);
  });
});

describe('boundingBox', () => {
  it('reaches the radius in each direction', () => {
    const box = boundingBox(kingsCross, 2);

    expect(distanceKm(kingsCross, { lat: box.maxLat, lng: kingsCross.lng })).toBeCloseTo(2, 3);
    expect(distanceKm(kingsCross, { lat: box.minLat, lng: kingsCross.lng })).toBeCloseTo(2, 3);
    expect(distanceKm(kingsCross, { lat: kingsCross.lat, lng: box.maxLng })).toBeCloseTo(2, 2);
    expect(distanceKm(kingsCross, { lat: kingsCross.lat, lng: box.minLng })).toBeCloseTo(2, 2);
  });

  it('stays finite at the poles', () => {
    const box = boundingBox({ lat: 90, lng: 0 }, 10);
    expect(Number.isFinite(box.minLng) && Number.isFinite(box.maxLng)).toBe(true);
  });
});
