const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT||9260}`);
 try{
  const page=(await Promise.all(browser.contexts().flatMap(c=>c.pages()).map(async p=>({p,t:await p.title()})))).find(x=>x.t.includes('CanvasPdfViewcard-Sandbox')).p;
  const checks=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&m.text().includes('Canvas PDF Viewcard'))errors.push(m.text());});
  const check=name=>{checks.push(name);console.log('PASS',name);};
  if(!process.argv.includes('--after-native')) {
  await page.evaluate(()=>{
    for(const leaf of app.workspace.getLeavesOfType('pdf'))leaf.detach();
    app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('canvas')[0],{focus:true});
    const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas;
    for(const [id,n]of c.nodes)n.nodeEl.dataset.testId=id;
    c.selectOnly(c.nodes.get('pdf-a'));c.zoomToSelection();
  });
  const card=page.locator('[data-test-id="pdf-a"] .cpv-viewer');
  await card.getByRole('button',{name:'보기',exact:true}).click();
  await page.locator('.menu-item').filter({hasText:/^연속 보기$/}).click();
  await card.getByRole('button',{name:'보기',exact:true}).click();
  await page.locator('.menu-item').filter({hasText:'너비 맞춤'}).click();
  const before=await page.evaluate(()=>{const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas;return{x:c.x,y:c.y,zoom:c.zoom}});
  const box=await card.locator('.cpv-viewport').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.wheel(0,650);await page.waitForTimeout(400);
  assert.ok(await card.locator('.cpv-viewport').evaluate(v=>v.scrollTop)>0);
  assert.deepEqual(await page.evaluate(()=>{const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas;return{x:c.x,y:c.y,zoom:c.zoom}}),before);
  check('selected PDF wheel scrolls document without panning Canvas');
  await page.mouse.move(120,120);await page.mouse.wheel(0,200);await page.waitForTimeout(300);
  const after=await page.evaluate(()=>{const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas;return{x:c.x,y:c.y,zoom:c.zoom}});
  assert.notDeepEqual(after,before);check('wheel outside card still navigates Canvas');
  await page.evaluate(()=>{const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas;c.zoomToSelection();});
  await card.getByRole('button',{name:'보기',exact:true}).click();
  await page.locator('.menu-item').filter({hasText:/^한 페이지$/}).click();
  await card.getByRole('button',{name:'보기',exact:true}).click();
  await page.locator('.menu-item').filter({hasText:'페이지 전체 맞춤'}).click();
  await card.getByRole('spinbutton',{name:'페이지 번호'}).fill('3');await card.getByRole('spinbutton',{name:'페이지 번호'}).press('Enter');
  // Drag native node label; actual pointer interaction, then restore fixture geometry.
  const label=page.locator('[data-test-id="pdf-a"] .canvas-node-label');
  const pos=await label.boundingBox();
  await page.mouse.move(pos.x+40,pos.y+10);await page.mouse.down();
  await page.mouse.move(pos.x+100,pos.y+40,{steps:10});await page.mouse.up();
  await page.waitForTimeout(250);
  const moved=await page.evaluate(()=>{const n=app.workspace.getLeavesOfType('canvas')[0].view.canvas.nodes.get('pdf-a');return{x:n.x,y:n.y}});
  assert.ok(moved.x!==0||moved.y!==0);check('native label drag moves the PDF card');
  await page.evaluate(()=>{
   const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas,n=c.nodes.get('pdf-a');n.moveAndResize({x:0,y:0,width:520,height:660});c.requestSave();c.zoomToSelection();
  });
  const rect=await page.locator('[data-test-id="pdf-a"]').boundingBox();
  await page.mouse.move(rect.x+rect.width-1,rect.y+rect.height-1);await page.mouse.down();
  await page.mouse.move(rect.x+rect.width-60,rect.y+rect.height-70,{steps:12});await page.mouse.up();
  await page.waitForTimeout(350);
  const resized=await page.evaluate(()=>{const n=app.workspace.getLeavesOfType('canvas')[0].view.canvas.nodes.get('pdf-a');return{w:n.width,h:n.height}});
  assert.ok(resized.w!==520||resized.h!==660);check('native corner drag resizes PDF card');
  await page.evaluate(()=>{
   const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas,n=c.nodes.get('pdf-a');n.moveAndResize({x:0,y:0,width:520,height:660});c.requestSave();
   const created=c.createFileNode({pos:{x:1200,y:0},size:{width:520,height:660},file:app.vault.getAbstractFileByPath('Portrait.pdf'),subpath:'#page=5',focus:true});
   window.__cpvNewId=created.id;c.zoomToSelection();
  });
  await page.waitForFunction(()=>app.workspace.getLeavesOfType('canvas')[0].view.canvas.nodes.get(window.__cpvNewId)?.nodeEl.querySelector('.cpv-viewer[data-page="5"]'));
  check('new PDF card receives viewer automatically with page link');
  await page.evaluate(()=>{const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas;c.removeNode(c.nodes.get(window.__cpvNewId));c.requestSave();c.selectOnly(c.nodes.get('pdf-c'));c.zoomToSelection();});
  await page.waitForTimeout(400);
  const landscape=await page.locator('[data-test-id="pdf-c"] .cpv-page').evaluate(p=>({w:p.offsetWidth,h:p.offsetHeight}));
  assert.ok(landscape.w>landscape.h);
  await page.screenshot({path:'validation/landscape.png'});
  check('landscape PDF retains correct orientation and fit');
  await page.evaluate(async()=>{const f=app.vault.getAbstractFileByPath('Portrait.pdf');await app.workspace.getLeaf('tab').openFile(f);});
  }
  await page.locator('.workspace-leaf.mod-active .pdf-toolbar').first().waitFor();
  assert.equal(await page.locator('.workspace-leaf.mod-active .cpv-viewer').count(),0);
  check('ordinary PDF tab still uses native viewer');
  await page.evaluate(()=>{const leaves=app.workspace.getLeavesOfType('pdf');for(const l of leaves)l.detach();const l=app.workspace.getLeavesOfType('canvas')[0];app.workspace.setActiveLeaf(l,{focus:true});l.view.canvas.selectOnly(l.view.canvas.nodes.get('pdf-a'));l.view.canvas.zoomToSelection();});
  // Error fixture is separate from real documents.
  await page.evaluate(async()=>{
   await app.vault.create('Invalid-test.pdf','invalid PDF fixture');
   const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas;
   const n=c.createFileNode({pos:{x:1200,y:0},file:app.vault.getAbstractFileByPath('Invalid-test.pdf'),focus:true});
   window.__cpvInvalidId=n.id;c.zoomToSelection();
  });
  await page.getByRole('button',{name:'다시 시도',exact:true}).waitFor();
  await page.getByRole('button',{name:'다시 시도',exact:true}).click();
  await page.getByRole('button',{name:'다시 시도',exact:true}).waitFor();
  check('invalid PDF shows error and working retry without breaking Canvas');
  await page.evaluate(async()=>{
   const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas;
   c.removeNode(c.nodes.get(window.__cpvInvalidId));c.requestSave();
   await app.vault.delete(app.vault.getAbstractFileByPath('Invalid-test.pdf'));
   c.selectOnly(c.nodes.get('pdf-a'));c.zoomToSelection();
  });
  await page.waitForTimeout(500);
  const data=await page.evaluate(()=>app.workspace.getLeavesOfType('canvas')[0].view.canvas.getData());
  assert.equal(data.edges.length,1);assert.equal(data.edges[0].fromNode,'note-a');assert.equal(data.edges[0].toNode,'pdf-a');
  assert.equal(data.nodes.find(n=>n.id==='pdf-a').subpath,'#page=3');
  check('original connection and PDF page link preserved');
  // Core native renderer may report the intentionally invalid PDF; only fail on our errors.
  assert.deepEqual(errors.filter(e=>e.includes('Canvas PDF Viewcard')),[]);
  fs.writeFileSync('validation/integration-results.json',JSON.stringify({checks,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
