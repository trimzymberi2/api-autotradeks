import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminPromotionsController, promotionRevision, validPromotionRequest } from '../src/controllers/adminPromotionsController.js';

const response=()=>({code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
const before=[{rent_car_id:1,position:1},{rent_car_id:2,position:2}];
const body=(carIds)=>({carIds,revision:promotionRevision(before)});

test('invalid IDs, duplicates, oversized lists and missing revision cannot change promotions',async()=>{
  const controller=createAdminPromotionsController({connect(){throw Error('must not connect');}});
  for(const payload of [body([1,1]),body([-1]),body(['1']),body([1.5]),body(Array(201).fill(1)),{carIds:[1]}]){
    assert.equal(validPromotionRequest(payload),false);
    const res=response();await controller.savePromotions({body:payload},res);assert.equal(res.code,400);
  }
});
function setup({current=before,existing=[{id:2},{id:3}],failInsert=false}={}){
  const calls=[];let released=false;let invalidated=0;
  const client={query:async(sql,params)=>{
    calls.push({sql,params});
    if(sql.startsWith('SELECT rent_car_id'))return {rows:current};
    if(sql.startsWith('SELECT id FROM rent_cars'))return {rows:existing};
    if(failInsert&&sql.startsWith('INSERT INTO'))throw Error('test failure');
    return {rows:[]};
  },release(){released=true;}};
  return {controller:createAdminPromotionsController({connect:async()=>client},()=>{invalidated++;}),calls,released:()=>released,invalidated:()=>invalidated};
}
test('saving writes positions in submitted order, commits and clears public caches',async()=>{
  const t=setup();const res=response();await t.controller.savePromotions({body:body([2,3])},res);
  assert.equal(res.code,200);
  assert.deepEqual(t.calls.find(call=>call.sql.startsWith('INSERT INTO')).params,[[2,3]]);
  assert.match(t.calls.find(call=>call.sql.startsWith('INSERT INTO')).sql,/WITH ORDINALITY/);
  assert.equal(t.calls.at(-1).sql,'COMMIT');assert.equal(t.invalidated(),1);assert.equal(t.released(),true);
  assert.equal(res.body.revision,promotionRevision([{rent_car_id:2,position:1},{rent_car_id:3,position:2}]));
  assert.equal(t.calls.some(call=>/^DELETE FROM rent_cars\b/.test(call.sql)),false);
});
test('stale admin lists return 409 without modifying the active selection',async()=>{
  const t=setup({current:[{rent_car_id:3,position:1}]});const res=response();
  await t.controller.savePromotions({body:body([2,3])},res);
  assert.equal(res.code,409);assert.equal(t.calls.at(-1).sql,'ROLLBACK');
  assert.equal(t.calls.some(call=>call.sql.startsWith('DELETE')),false);assert.equal(t.invalidated(),0);
});
test('missing or deleted cars reject the update before removing existing promotions',async()=>{
  const t=setup({existing:[{id:2}]});const res=response();await t.controller.savePromotions({body:body([2,3])},res);
  assert.equal(res.code,400);assert.equal(t.calls.at(-1).sql,'ROLLBACK');
  assert.equal(t.calls.some(call=>call.sql.startsWith('DELETE')),false);
});
test('an empty list explicitly removes all promotions without deleting rental cars',async()=>{
  const t=setup({existing:[]});const res=response();await t.controller.savePromotions({body:body([])},res);
  assert.equal(res.code,200);assert.equal(t.calls.at(-1).sql,'COMMIT');
  assert.equal(t.calls.some(call=>call.sql.startsWith('INSERT')),false);assert.equal(t.invalidated(),1);
});
test('failure while saving rolls back, preserves caches and releases the connection',async()=>{
  const t=setup({failInsert:true});const res=response();
  const original=console.error;console.error=()=>{};
  try {await t.controller.savePromotions({body:body([2,3])},res);}finally{console.error=original;}
  assert.equal(res.code,503);assert.equal(t.calls.at(-1).sql,'ROLLBACK');assert.equal(t.invalidated(),0);assert.equal(t.released(),true);
});
test('promotion search binds untrusted search text and paginates',async()=>{
  const calls=[];const q="' OR 1=1 --";
  const controller=createAdminPromotionsController({query:async(sql,params)=>{calls.push({sql,params});return sql.startsWith('SELECT COUNT')?{rows:[{total:25}]}:{rows:[{id:4}]};}});
  const res=response();await controller.searchCars({query:{q,page:'2'}},res);
  assert.equal(res.code,200);assert.equal(res.body.totalPages,3);assert.equal(calls[1].params[3],12);
  assert.equal(calls.every(call=>!call.sql.includes(q)),true);
});
test('active promotions return the revision matching their current order',async()=>{
  const controller=createAdminPromotionsController({query:async()=>({rows:before.map(row=>({...row,id:row.rent_car_id}))})});
  const res=response();await controller.getPromotions({},res);assert.equal(res.body.revision,promotionRevision(before));
});
