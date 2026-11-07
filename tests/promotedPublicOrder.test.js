import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../src/config/db.js';
import { getPromotedRentCars } from '../src/controllers/rentCarController.js';
import { setCache, createCacheKey, clearRentCarCache } from '../src/utils/cache.js';

test('homepage reads the current active promotion order instead of a stale process cache', async () => {
  let version=0;
  setCache(createCacheKey('rent-cars:promoted'),[{id:99}]);
  const query=mock.method(pool,'query',async(sql)=>{
    if(sql.includes('FROM promoted_rent_cars')) {
      assert.match(sql,/is_active = true/);assert.match(sql,/ORDER BY promoted_rent_cars.position ASC/);
      version++;
      return {rows:(version===1?[2,1]:[1,2]).map(id=>({id,user_name:'Owner',user_phone:'+38344123456'}))};
    }
    return {rows:[]};
  });
  function response(){return {headers:{},set(key,value){this.headers[key]=value;return this;},json(value){this.body=value;},status(){return this;}};}
  try {
    const first=response();await getPromotedRentCars({},first);
    const second=response();await getPromotedRentCars({},second);
    assert.deepEqual(first.body.map(car=>car.id),[2,1]);assert.deepEqual(second.body.map(car=>car.id),[1,2]);
    assert.equal(second.headers['Cache-Control'],'no-store');assert.equal(version,2);
  } finally {query.mock.restore();clearRentCarCache();}
});
