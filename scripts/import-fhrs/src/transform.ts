import type { FhrsEstablishment } from './fhrs-client';

/**
 * FHRS business types where people eat dishes. "Other catering premises"
 * covers market stalls and street food, so it's included despite some noise.
 */
export const RELEVANT_BUSINESS_TYPE_IDS: ReadonlySet<number> = new Set([
  1, // Restaurant/Cafe/Canteen
  7841, // Other catering premises
  7843, // Pub/bar/nightclub
  7844, // Takeaway/sandwich shop
  7846, // Mobile caterer
]);

// Loose UK bounding box — rejects 0,0 and other placeholder coordinates.
const UK_BOUNDS = { minLat: 49, maxLat: 61, minLng: -9, maxLng: 2.5 };

export interface RestaurantRecord {
  fhrsId: number;
  name: string;
  address: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  businessType: string;
  businessTypeId: number;
  localAuthority: string;
  hygieneRating: string | null;
}

/** Returns null for establishments that aren't places people eat, or have no usable name. */
export function toRestaurantRecord(
  establishment: FhrsEstablishment,
  localAuthority: string = establishment.LocalAuthorityName,
): RestaurantRecord | null {
  if (!RELEVANT_BUSINESS_TYPE_IDS.has(establishment.BusinessTypeID)) return null;

  const name = collapseWhitespace(establishment.BusinessName);
  if (!name) return null;

  const { latitude, longitude } = parseCoordinates(establishment.geocode);

  return {
    fhrsId: establishment.FHRSID,
    name,
    address: joinAddress([
      establishment.AddressLine1,
      establishment.AddressLine2,
      establishment.AddressLine3,
      establishment.AddressLine4,
    ]),
    postcode: collapseWhitespace(establishment.PostCode)?.toUpperCase() ?? null,
    latitude,
    longitude,
    businessType: establishment.BusinessType,
    businessTypeId: establishment.BusinessTypeID,
    localAuthority,
    hygieneRating: collapseWhitespace(establishment.RatingValue),
  };
}

function collapseWhitespace(value: string | null | undefined): string | null {
  const cleaned = value?.trim().replace(/\s+/g, ' ');
  return cleaned ? cleaned : null;
}

function joinAddress(lines: (string | null | undefined)[]): string | null {
  const parts = lines.map(collapseWhitespace).filter((l): l is string => l !== null);
  return parts.length > 0 ? parts.join(', ') : null;
}

function parseCoordinates(geocode: FhrsEstablishment['geocode']): {
  latitude: number | null;
  longitude: number | null;
} {
  const none = { latitude: null, longitude: null };
  if (geocode?.latitude == null || geocode.longitude == null) return none;
  if (geocode.latitude === '' || geocode.longitude === '') return none;

  const latitude = Number(geocode.latitude);
  const longitude = Number(geocode.longitude);
  const inUk =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= UK_BOUNDS.minLat &&
    latitude <= UK_BOUNDS.maxLat &&
    longitude >= UK_BOUNDS.minLng &&
    longitude <= UK_BOUNDS.maxLng;

  return inUk ? { latitude, longitude } : none;
}
