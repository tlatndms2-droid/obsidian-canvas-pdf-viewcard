import { test } from "node:test";
import assert from "node:assert/strict";
import { cardInitial, cardKey, clampPage, defaultPopup, fitScale, normalizeState, pageFromSubpath, pageRows } from "../src/model";
test("existing page links initialize independently; changed file/page links invalidate saved page",()=>{
  const saved={...normalizeState({page:8}),file:"a.pdf",subpath:"#page=3"};
  assert.equal(cardInitial(saved,"a.pdf","#page=3").page,8);
  assert.equal(cardInitial(saved,"a.pdf","#page=5").page,5);
  assert.equal(cardInitial(saved,"b.pdf","").page,1);
  assert.notEqual(cardKey("a.canvas","id"),cardKey("b.canvas","id"));
  assert.equal(pageFromSubpath("#page=3&zoom=100"),3);
});
test("spread handles odd final page and preserves explicit page in its spread",()=>{
  assert.deepEqual(pageRows(5,normalizeState({layout:"spread",page:4})),[[3,4]]);
  assert.deepEqual(pageRows(5,normalizeState({layout:"spread-continuous"})),[[1,2],[3,4],[5]]);
});
test("page fit keeps both dimensions inside viewport, width fit fills usable width",()=>{
  const pages=[{width:595,height:842},{width:595,height:842}];
  const scale=fitScale(500,400,pages,"page");
  assert.ok(1190*scale+12<=476);
  assert.ok(842*scale<=376);
  assert.equal(fitScale(500,400,[pages[0]],"width"),476/595);
});
test("invalid persisted values and input are clamped",()=>{
  assert.equal(clampPage(NaN,12),1);assert.equal(clampPage(400,12),12);
  assert.equal(normalizeState({zoom:Infinity}).zoom,null);
  assert.equal(normalizeState({zoom:10}).zoom,4);
});
test("popup navigation does not mutate card state",()=>{
  const card=normalizeState({page:3});
  const popup={...defaultPopup,page:card.page};
  popup.page=10;assert.equal(card.page,3);
  assert.equal(popup.layout,"continuous");assert.equal(popup.fit,"width");
});
