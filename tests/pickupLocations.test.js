import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../src/config/db.js';
import { resolvePickupLocations } from '../src/utils/pickupLocations.js';
import { createRentCar, updateRentCar, getRentCars } from '../src/controllers/rentCarController.js';
import { clearRentCarCache } from '../src/utils/cache.js';

afterEach(() => { mock.restoreAll(); clearRentCarCache(); });
const airport = 'Aeroporti Ndërkombëtar i Prishtines';
function response() {
  return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, set() { return this; } };
}

test('accepts JSON multipart locations, trims and deduplicates without losing order', () => {
  assert.deepEqual(resolvePickupLocations({pickup_locations: JSON.stringify([' Prishtine ', airport, 'Prishtine'])}), ['Prishtine', airport]);
});
test('legacy clients retain all pickup locations when editing an unchanged city or other fields', () => {
  const existing = {city: 'Prishtine', pickup_locations: ['Prishtine', airport]};
  assert.deepEqual(resolvePickupLocations({price_per_day: 30}, existing), existing.pickup_locations);
  assert.deepEqual(resolvePickupLocations({city: 'Prishtine'}, existing), existing.pickup_locations);
  assert.deepEqual(resolvePickupLocations({city: 'Peje'}, existing), ['Peje']);
  assert.deepEqual(resolvePickupLocations({}, {city: 'Prizren'}), ['Prizren']);
});
test('rejects empty, malformed, excessive, and non-string locations', () => {
  for (const pickup_locations of [[], null, 'not JSON', '"Prishtine"', [' '], [42], ['a'.repeat(101)], Array(31).fill('Prishtine')]) {
    assert.throws(() => resolvePickupLocations({pickup_locations}), error => error.status === 400);
  }
});
test('create sends the locations as a PostgreSQL array and syncs the legacy city', async () => {
  let captured;
  mock.method(pool, 'query', async (sql, params) => {
    captured = {sql, params};
    return {rows: [{id: 7, city: params[12], pickup_locations: params[23]}]};
  });
  const res = response();
  await createRentCar({body: {title: 'Golf', pickup_locations: JSON.stringify(['Prishtine', airport])}, user: {id: 42}}, res);
  assert.equal(res.code, 200);
  assert.equal(captured.params.length, 24);
  assert.equal(captured.params[12], 'Prishtine');
  assert.deepEqual(res.body.pickup_locations, ['Prishtine', airport]);
});
test('invalid create is rejected before writing a listing', async () => {
  mock.method(pool, 'query', () => { throw Error('must not query'); });
  const res = response();
  await createRentCar({body: {pickup_locations: '[]'}, user: {id: 42}}, res);
  assert.equal(res.code, 400);
});
test('editing locations persists the new array and first location within the existing transaction', async () => {
  let updatedParams;
  let released = false;
  const client = {
    query: async (sql, params) => {
      if (sql.startsWith('SELECT *')) return {rows: [{id: 7, user_id: 42, city: 'Prishtine', pickup_locations: ['Prishtine']}]};
      if (sql.startsWith('UPDATE')) { updatedParams = params; return {rows: [{id: 7, city: params[12], pickup_locations: params[23]}]}; }
      return {rows: []};
    },
    release: () => { released = true; },
  };
  mock.method(pool, 'connect', async () => client);
  const res = response();
  await updateRentCar({params: {id: '7'}, body: {pickup_locations: [airport, 'Prizren']}, user: {id: 42}}, res);
  assert.equal(res.code, 200);
  assert.equal(updatedParams[12], airport);
  assert.deepEqual(updatedParams[23], [airport, 'Prizren']);
  assert.equal(released, true);
});
test('city search applies pickup-location membership to both counts and results using bound parameters', async () => {
  const calls = [];
  mock.method(pool, 'query', async (sql, params) => {
    calls.push({sql, params: [...params]});
    if (sql.startsWith('SELECT COUNT')) return {rows: [{count: '1'}]};
    if (sql.includes('SELECT image_url')) return {rows: []};
    return {rows: [{id: 7, city: 'Prishtine', pickup_locations: ['Prishtine', airport]}]};
  });
  const res = response();
  await getRentCars({query: {city: airport}}, res);
  assert.equal(res.body.totalRentCars, 1);
  for (const call of calls.slice(0, 2)) {
    assert.match(call.sql, /pickup_locations @> ARRAY\[\$1\]::text\[\]/);
    assert.equal(call.params[0], airport);
    assert.equal(call.sql.includes(airport), false);
  }
});
