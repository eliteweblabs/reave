import assert from 'node:assert/strict';
import { getFloorArea, lookupProperty } from '../dist/lib/propertyService.js';
import { isRealEstateDataConfigured } from '../dist/lib/config.js';

process.env.REAL_ESTATE_DATA_PROVIDER = 'mock';

assert.equal(isRealEstateDataConfigured(), true);

const lookup = await lookupProperty({
  address: '123 Main Street',
  city: 'Springfield',
  state: 'IL',
});

assert.equal(lookup.ok, true);
if (lookup.ok) {
  assert.equal(lookup.properties.length, 1);
  assert.equal(lookup.properties[0]?.yearBuilt, 1924);
}

const floor = await getFloorArea({
  address: '123 Main Street',
  city: 'Springfield',
  floorLabel: '2nd floor',
});

assert.equal(floor.ok, true);
if (floor.ok) {
  assert.equal(floor.sqft, 1420);
  assert.equal(floor.source, 'floor_areas');
}

console.log('smoke tests passed');
