import test from "node:test";
import assert from "node:assert/strict";
import { createRentCarViewsController } from "../src/controllers/rentCarViewsController.js";
const visitorId = "11111111-1111-4111-8111-111111111111";
function request(overrides = {}) {
  return { params: {id: "7"}, body: {visitorId}, get: () => "", ...overrides };
}
function response() {
  return { code: 200, headers: {}, set(key,value){this.headers[key]=value;return this;},
    status(code){this.code=code;return this;}, json(body){this.body=body;return this;},
    sendStatus(code){this.code=code;return this;} };
}
test("rejects invalid car and visitor IDs without accessing database", async () => {
  const controller = createRentCarViewsController({query: () => {throw Error("must not query");}});
  for (const req of [request({params:{id:"-1"}}), request({params:{id:"9999999999"}}), request({body:{visitorId:"bad"}})]) {
    const res = response(); await controller.recordView(req,res); assert.equal(res.code,400);
  }
});
test("obvious crawlers do not count", async () => {
  const controller = createRentCarViewsController({query: () => {throw Error("must not query");}});
  const res=response(); await controller.recordView(request({get: key => key === "user-agent" ? "Googlebot" : ""}),res);
  assert.equal(res.code,204);
});
test("tracking stores a hash, uses verified identity, and returns no private data", async () => {
  let params;
  const controller=createRentCarViewsController({query:async (_sql,p) => {params=p;}},() => ({id:42}));
  const res=response(); await controller.recordView(request({get:key => key === "authorization" ? "Bearer valid" : ""}),res);
  assert.equal(res.code,204); assert.equal(params[2],"42"); assert.match(params[1],/^[a-f0-9]{64}$/);
  assert.notEqual(params[1],visitorId); assert.equal(res.headers["Cache-Control"],"no-store");
});
test("expired credentials do not break anonymous listing tracking", async () => {
  let params;
  const controller=createRentCarViewsController({query:async (_sql,p) => {params=p;}},() => {throw Error("expired");});
  const res=response(); await controller.recordView(request({get:key => key === "authorization" ? "Bearer expired" : ""}),res);
  assert.equal(res.code,204); assert.equal(params[2],null);
});
test("statistics query is scoped to authenticated owner and normalizes database counts", async () => {
  let params;
  const controller=createRentCarViewsController({query:async (_sql,p) => {params=p;return {rows:[{rent_car_id:7,total_views:"12",today_views:"2",week_views:"5"}]};}});
  const res=response(); await controller.getOwnerViewStats({user:{id:42}},res);
  assert.deepEqual(params,[42]); assert.deepEqual(res.body.stats,[{rent_car_id:7,total_views:12,today_views:2,week_views:5}]);
  assert.equal(res.headers["Cache-Control"],"no-store");
});
