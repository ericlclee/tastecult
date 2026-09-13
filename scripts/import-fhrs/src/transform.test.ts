import { describe, expect, it } from 'vitest';
import { makeEstablishment } from './test-fixtures.js';
import { toRestaurantRecord } from './transform.js';

describe('toRestaurantRecord', () => {
  it('maps a restaurant establishment', () => {
    expect(toRestaurantRecord(makeEstablishment())).toEqual({
      fhrsId: 1604237,
      name: 'Dishoom',
      address: 'Unit 7, Mitre Bridge Industrial Park, Mitre Way, London',
      postcode: 'W10 6AU',
      latitude: 51.5243312,
      longitude: -0.2313306,
      businessType: 'Restaurant/Cafe/Canteen',
      businessTypeId: 1,
      localAuthority: 'Hammersmith and Fulham',
      hygieneRating: '5',
    });
  });

  it.each([
    [7841, 'Other catering premises'],
    [7843, 'Pub/bar/nightclub'],
    [7844, 'Takeaway/sandwich shop'],
    [7846, 'Mobile caterer'],
  ])('keeps business type %i (%s)', (id, name) => {
    expect(
      toRestaurantRecord(makeEstablishment({ BusinessTypeID: id, BusinessType: name })),
    ).not.toBeNull();
  });

  it.each([
    [7840, 'Retailers - supermarkets/hypermarkets'],
    [7839, 'Manufacturers/packers'],
    [5, 'Hospitals/Childcare/Caring Premises'],
  ])('drops business type %i (%s)', (id, name) => {
    expect(
      toRestaurantRecord(makeEstablishment({ BusinessTypeID: id, BusinessType: name })),
    ).toBeNull();
  });

  it('stores null coordinates when the geocode is missing', () => {
    const noGeocode = toRestaurantRecord(makeEstablishment({ geocode: null }));
    expect(noGeocode).toMatchObject({ latitude: null, longitude: null });

    const nullLatitude = toRestaurantRecord(
      makeEstablishment({ geocode: { latitude: null, longitude: '-0.1' } }),
    );
    expect(nullLatitude).toMatchObject({ latitude: null, longitude: null });
  });

  it('rejects placeholder coordinates outside the UK', () => {
    const record = toRestaurantRecord(
      makeEstablishment({ geocode: { latitude: '0', longitude: '0' } }),
    );
    expect(record).toMatchObject({ latitude: null, longitude: null });
  });

  it('handles blank addresses and partial postcodes', () => {
    const record = toRestaurantRecord(
      makeEstablishment({
        AddressLine1: '',
        AddressLine2: '  ',
        AddressLine3: null,
        AddressLine4: undefined,
        PostCode: 'w1h ',
      }),
    );
    expect(record).toMatchObject({ address: null, postcode: 'W1H' });
  });

  it('drops establishments with no usable name', () => {
    expect(toRestaurantRecord(makeEstablishment({ BusinessName: '   ' }))).toBeNull();
  });

  it('keeps non-numeric hygiene ratings as text', () => {
    const record = toRestaurantRecord(makeEstablishment({ RatingValue: 'AwaitingInspection' }));
    expect(record?.hygieneRating).toBe('AwaitingInspection');
  });

  it('uses the given local authority name when provided', () => {
    expect(toRestaurantRecord(makeEstablishment(), 'Camden')?.localAuthority).toBe('Camden');
  });
});
