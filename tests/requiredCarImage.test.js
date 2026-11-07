import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../src/config/db.js';
import cloudinary from '../src/config/cloudinary.js';
import { createRentCar } from '../src/controllers/rentCarController.js';

afterEach(() => mock.restoreAll());
const response = () => ({code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
const request = (files) => ({body:{title:'Golf',pickup_locations:'["Prishtine"]'},user:{id:42},files});

test('missing or empty uploads return 400 without creating a database connection', async () => {
  mock.method(pool,'connect',()=>{throw Error('must not connect');});
  for (const files of [undefined, []]) {
    const res=response(); await createRentCar(request(files),res);
    assert.equal(res.code,400); assert.match(res.body.message,/foto/);
  }
});

function database() {
  const calls=[]; let released=false;
  const client={query:async(sql,params)=>{
    calls.push({sql,params});
    return {rows:sql.includes('INSERT INTO rent_cars')?[{id:7}]:[]};
  },release(){released=true;}};
  mock.method(pool,'connect',async()=>client);
  return {calls,client,released:()=>released};
}

test('a listing with one image commits both the car and its image', async () => {
  const db=database();
  mock.method(cloudinary.uploader,'upload',async()=>({secure_url:'https://example.test/car.webp'}));
  const res=response(); await createRentCar(request([{path:'test.webp'}]),res);
  assert.equal(res.code,200);
  assert.ok(db.calls.some(call=>call.sql.includes('INSERT INTO rent_car_images')&&call.params[1]==='https://example.test/car.webp'));
  assert.equal(db.calls.at(-1).sql,'COMMIT'); assert.equal(db.released(),true);
});

test('failed upload rolls the car back rather than saving an imageless listing', async () => {
  const db=database();
  mock.method(cloudinary.uploader,'upload',async()=>{throw Error('test upload failure');});
  mock.method(console,'error',()=>{});
  const res=response(); await createRentCar(request([{path:'test.webp'}]),res);
  assert.equal(res.code,500); assert.equal(db.calls.at(-1).sql,'ROLLBACK');
  assert.equal(db.calls.some(call=>call.sql==='COMMIT'),false); assert.equal(db.released(),true);
});

test('failed image row insert also rolls back the new car', async () => {
  const db=database(); const query=db.client.query;
  db.client.query=async(sql,params)=>{if(sql.includes('INSERT INTO rent_car_images')) throw Error('test insert failure'); return query(sql,params);};
  mock.method(cloudinary.uploader,'upload',async()=>({secure_url:'https://example.test/car.webp'}));
  mock.method(console,'error',()=>{});
  const res=response(); await createRentCar(request([{path:'test.webp'}]),res);
  assert.equal(res.code,500); assert.equal(db.calls.at(-1).sql,'ROLLBACK'); assert.equal(db.released(),true);
});
