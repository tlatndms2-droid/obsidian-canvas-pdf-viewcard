// Regression: PDF reading keys must never nudge the selected Canvas node.
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT||9260}`);
 let page, baseline;
 try {
  page=(await Promise.all(browser.contexts().flatMap(c=>c.pages()).map(async p=>({p,t:await p.title()})))).find(x=>x.t.includes('CanvasPdfViewcard-Sandbox'))?.p;
  if(!page)throw Error('Expected isolated Sandbox not found');
  baseline=await page.evaluate(()=>{
   const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas,n=c.nodes.get('pdf-a');
   const viewer=app.plugins.plugins['canvas-pdf-viewcard'].mounted.get(n).viewer;
   n.nodeEl.dataset.keyboardTest='pdf-a';c.selectOnly(n);c.zoomToSelection();
   return{data:n.getData(),state:{...viewer.state}};
  });
  await page.waitForTimeout(350);
  const card=page.locator('[data-keyboard-test="pdf-a"] .cpv-viewer');
  const read=()=>page.evaluate(()=>{
   const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas,n=c.nodes.get('pdf-a');
   return {x:n.x,y:n.y,cx:c.x,cy:c.y,zoom:c.zoom,page:Number(n.nodeEl.querySelector('.cpv-viewer').dataset.page)};
  });
  const initial=await read(),results=[];
  const stable=async(name,expected)=>{
   await page.waitForTimeout(60);const current=await read();
   for(const k of ['x','y','cx','cy','zoom'])assert.equal(current[k],initial[k],`${name}: ${k} moved`);
   if(expected!==undefined)assert.equal(current.page,expected,`${name}: page`);
   results.push({name,...current});console.log('PASS',name);
  };
  const number=card.getByRole('spinbutton',{name:'페이지 번호'});
  await number.fill('3');await number.press('Enter');
  await page.keyboard.press('ArrowRight');await stable('page input Enter retains PDF keyboard focus',4);
  await number.fill('3');await number.press('Enter');
  await card.getByRole('button',{name:'다음 페이지',exact:true}).click();
  const afterButton=(await read()).page;
  await page.keyboard.press('ArrowLeft');await stable('actual page-button click retains reading focus',afterButton-1);
  await number.fill('3');await number.press('Enter');
  await card.locator('.cpv-viewport').click({position:{x:40,y:40}});
  await page.keyboard.press('ArrowRight');await stable('PDF click then Right changes only page',4);
  await page.keyboard.press('ArrowLeft');await stable('Left changes only page',3);
  await page.keyboard.press('Shift+ArrowRight');await stable('Shift+Right leaves node fixed',4);
  await page.keyboard.press('Shift+ArrowLeft');await stable('Shift+Left leaves node fixed',3);
  for(const key of ['ArrowUp','ArrowDown','Shift+ArrowUp','Shift+ArrowDown','Control+ArrowRight']){
   await page.keyboard.press(key);await stable(`${key} leaves node and Canvas view fixed`);
  }
  await page.keyboard.press('PageDown');await stable('PageDown advances once',4);
  await page.keyboard.press('PageUp');await stable('PageUp goes back once',3);
  await card.getByRole('button',{name:'보기',exact:true}).focus();
  await page.keyboard.press('ArrowRight');await stable('toolbar focus Right advances once',4);
  await page.keyboard.press('ArrowLeft');await stable('toolbar focus Left goes back once',3);
  await number.focus();await page.keyboard.press('ArrowUp');await stable('page input Up does not nudge card');
  await number.fill('3');await number.press('Enter');
  await card.getByRole('button',{name:'크게 보기',exact:true}).click();
  const popup=page.locator('.cpv-modal .cpv-viewer');
  await popup.waitFor();await popup.locator('.cpv-viewport').click({position:{x:40,y:40}});
  await page.keyboard.press('ArrowRight');
  assert.equal(await popup.getAttribute('data-page'),'4');
  await stable('popup Right keeps card page and position',3);
  await page.keyboard.press('Shift+ArrowLeft');
  assert.equal(await popup.getAttribute('data-page'),'3');
  await stable('popup Shift+Left keeps card fixed',3);
  await page.keyboard.press('Escape');
  await page.locator('.cpv-modal').waitFor({state:'detached'});
  // Native wrapper focus is how Canvas receives its ordinary movement keys.
  await page.locator('[data-keyboard-test="pdf-a"] .canvas-node-label').click();
  await page.keyboard.press('ArrowRight');
  assert.ok((await read()).x>initial.x,'Canvas movement must resume outside PDF focus');
  console.log('PASS Canvas focus retains native arrow-key card movement');
  await page.evaluate(base=>{
   const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas,n=c.nodes.get('pdf-a');
   n.moveAndResize({x:base.data.x,y:base.data.y,width:base.data.width,height:base.data.height});c.requestSave();
  },baseline);
  await card.locator('.cpv-viewport').click({position:{x:40,y:40}});
  await page.keyboard.press('ArrowRight');await stable('returning to PDF restores keyboard protection',4);
  await page.screenshot({path:'validation/keyboard-fixed.png'});
  fs.writeFileSync(`validation/keyboard-${process.env.TEST_PHASE||'before-restart'}.json`,JSON.stringify({passed:true,version:await page.evaluate(()=>app.plugins.plugins['canvas-pdf-viewcard'].manifest.version),results},null,2));
 } finally {
  if(page&&baseline)await page.evaluate(base=>{
   document.querySelector('.cpv-modal .modal-header-button')?.click();
   const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas,n=c.nodes.get('pdf-a');
   n.moveAndResize({x:base.data.x,y:base.data.y,width:base.data.width,height:base.data.height});
   const v=app.plugins.plugins['canvas-pdf-viewcard'].mounted.get(n)?.viewer;
   if(v){v.state={...base.state};v.go(base.state.page);}
   c.requestSave();
  },baseline).catch(()=>{});
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
