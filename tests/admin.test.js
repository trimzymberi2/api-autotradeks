import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import pool from '../src/config/db.js';
import adminRoutes from '../src/routes/adminRoutes.js';
import { createAdminController } from '../src/controllers/adminController.js';
import { isAdminUser } from '../src/utils/adminAccess.js';
import { requireAdmin } from '../src/middleware/adminMiddleware.js';

const originalAdmins = process.env.ADMIN_USER_IDS;
const originalSecret = process.env.JWT_SECRET;
afterEach(() => {
  mock.restoreAll();
  if (originalAdmins === undefined) delete process.env.ADMIN_USER_IDS; else process.env.ADMIN_USER_IDS = originalAdmins;
  if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
});
function response() { return {code:200,headers:{},set(key,value){this.headers[key]=value;return this;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}}; }

test('admin access is disabled by default and matches exact IDs', () => {
  delete process.env.ADMIN_USER_IDS;
  assert.equal(isAdminUser(30), false);
  process.env.ADMIN_USER_IDS = '30, 41, invalid';
  assert.equal(isAdminUser(30), true);
  assert.equal(isAdminUser('41'), true);
  assert.equal(isAdminUser(3), false);
});
test('admin middleware ignores user-supplied role claims and returns no-store', () => {
  process.env.ADMIN_USER_IDS = '30';
  const res = response(); let called=false;
  requireAdmin({user:{id:31,role:'admin'}},res,()=>{called=true;});
  assert.equal(res.code,403); assert.equal(called,false); assert.equal(res.headers['Cache-Control'],'no-store');
});
test('all admin endpoints reject anonymous, ordinary, and forged-role tokens before reading reporting data', async () => {
  process.env.ADMIN_USER_IDS='30'; process.env.JWT_SECRET='unit-test-secret-only';
  mock.method(pool,'query', async (sql,values) => {
    assert.equal(sql,'SELECT id FROM users WHERE id=$1');
    return {rows:[{id:values[0]}]};
  });
  const app=express(); app.use('/api/admin',adminRoutes);
  const server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  try {
    const base='http://127.0.0.1:'+server.address().port;
    for (const endpoint of ['/overview','/users','/users/30']) {
      const anonymous=await fetch(base+'/api/admin'+endpoint); assert.equal(anonymous.status,401);
      const token=jwt.sign({id:31,role:'admin'},process.env.JWT_SECRET);
      const ordinary=await fetch(base+'/api/admin'+endpoint,{headers:{Authorization:'Bearer '+token}});
      assert.equal(ordinary.status,403);
    }
  } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});
test('authorized middleware allows only the configured database user', () => {
  process.env.ADMIN_USER_IDS='30'; let allowed=false;
  requireAdmin({user:{id:30}},response(),()=>{allowed=true;}); assert.equal(allowed,true);
});
test('user search binds untrusted text, caps page size, and converts numeric counts', async () => {
  const queries=[];
  const controller=createAdminController({query:async(sql,values)=>{
    queries.push({sql,values});
    return sql.startsWith('SELECT COUNT') ? {rows:[{total:1}]} : {rows:[{id:7,name:'Owner',car_count:2,total_views:'12',week_views:'4',today_views:'1'}]};
  }});
  const res=response(); const search="' OR 1=1 --";
  await controller.users({query:{q:search,limit:'999',page:'2'}},res);
  assert.equal(res.code,200); assert.equal(res.body.limit,50); assert.equal(res.body.users[0].total_views,12);
  assert.equal(queries.every(query=>!query.sql.includes(search)),true);
  assert.deepEqual(queries[1].values,[search,'%'+search+'%',50,50]);
});
test('invalid and missing user IDs return appropriate errors', async () => {
  let calls=0;
  const controller=createAdminController({query:async()=>{calls++;return {rows:[]};}});
  const invalid=response(); await controller.userDetails({params:{id:'1 OR 1=1'},query:{}},invalid);
  assert.equal(invalid.code,400); assert.equal(calls,0);
  const missing=response(); await controller.userDetails({params:{id:'999'},query:{}},missing);
  assert.equal(missing.code,404); assert.equal(calls,1);
});
test('detail summaries cover all cars independently of paginated car results and expose no passwords', async () => {
  const controller=createAdminController({query:async(sql)=>{
    if(sql.startsWith('SELECT id, name'))return {rows:[{id:30,name:'Owner',email:'owner@example.test',phone:'+38344123456'}]};
    if(sql.includes('COUNT(*)::int AS car_count'))return {rows:[{car_count:25,total_views:'120',today_views:'2',week_views:'9'}]};
    return {rows:[{id:1,title:'Golf',total_views:'4',today_views:'1',week_views:'2'}]};
  }});
  const res=response(); await controller.userDetails({params:{id:'30'},query:{limit:20}},res);
  assert.equal(res.body.totalPages,2); assert.equal(res.body.totals.total_views,120);
  assert.equal(res.body.cars[0].total_views,4); assert.equal('password' in res.body.user,false);
});
