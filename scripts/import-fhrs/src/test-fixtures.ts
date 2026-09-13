import type { EstablishmentsResult, FhrsAuthority, FhrsEstablishment } from './fhrs-client.js';

// Shape taken from a real FHRS API response (Dishoom, Hammersmith and Fulham).
export function makeEstablishment(overrides: Partial<FhrsEstablishment> = {}): FhrsEstablishment {
  return {
    FHRSID: 1604237,
    BusinessName: 'Dishoom',
    BusinessType: 'Restaurant/Cafe/Canteen',
    BusinessTypeID: 1,
    AddressLine1: 'Unit 7',
    AddressLine2: 'Mitre Bridge Industrial Park',
    AddressLine3: 'Mitre Way',
    AddressLine4: 'London',
    PostCode: 'W10 6AU',
    RatingValue: '5',
    LocalAuthorityName: 'Hammersmith and Fulham',
    geocode: { latitude: '51.5243312', longitude: '-0.2313306' },
    ...overrides,
  };
}

export function makeAuthority(overrides: Partial<FhrsAuthority> = {}): FhrsAuthority {
  return {
    LocalAuthorityId: 100,
    Name: 'Hammersmith and Fulham',
    RegionName: 'London',
    EstablishmentCount: 1,
    ...overrides,
  };
}

export function feed(establishments: FhrsEstablishment[], complete = true): EstablishmentsResult {
  return { establishments, invalidCount: 0, complete };
}
