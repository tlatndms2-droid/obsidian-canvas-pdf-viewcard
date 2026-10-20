const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const out = 'validation';
(async()=>{
 const browser=await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT||9260}`);
 try {
  const page=(await Promise.all(browser.contexts().flatMap(c=>c.pages()).map(async p=>({p,title:await p.title()})))).find(x=>x.title.includes('CanvasPdfViewcard-Sandbox'))?.p;
  if(!page)throw Error('Sandbox missing');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&m.text().includes('Canvas PDF Viewcard'))errors.push(m.text());});
  const checks=[];
  const check=(name)=>{checks.push(name);console.log('PASS',name);};
  await page.evaluate(()=>{
   app.workspace.leftSplit.collapse();
   const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas;
   for(const [id,n] of c.nodes)n.nodeEl.dataset.testId=id;
   c.selectOnly(c.nodes.get('pdf-a'));c.zoomToSelection();
  });
  const card=page.locator('[data-test-id="pdf-a"] .cpv-viewer');
  await card.locator('canvas').first().waitFor();
  assert.equal(await card.getAttribute('data-page'),'3');
  assert.equal(await page.locator('[data-test-id="pdf-b"] .cpv-viewer').getAttribute('data-page'),'7');
  check('existing page links and independent duplicate cards');
  await page.screenshot({path:`${out}/card-light.png`});
  const fit=await card.evaluate(el=>{
   const v=el.querySelector('.cpv-viewport'),p=el.querySelector('.cpv-page');
   return {w:v.clientWidth,h:v.clientHeight,pw:p.offsetWidth,ph:p.offsetHeight};
  });
  assert.ok(fit.pw<=fit.w&&fit.ph<=fit.h);check('whole page fits card dimensions');
  for(const [label,layout] of [['연속 보기','continuous'],['두 페이지','spread'],['두 페이지 연속','spread-continuous'],['한 페이지','single']]){
   await card.getByRole('button',{name:'보기',exact:true}).click();
   await page.locator('.menu-item').filter({hasText:new RegExp(`^${label}$`)}).click();
   assert.equal(await card.getAttribute('data-layout'),layout);
   await card.locator('canvas').first().waitFor();
  }
  check('all four card layouts selected through menu');
  await card.getByRole('button',{name:'보기',exact:true}).click();
  await page.locator('.menu-item').filter({hasText:'너비 맞춤'}).click();
  assert.equal(await card.getAttribute('data-fit'),'width');
  await card.getByRole('button',{name:'보기',exact:true}).click();
  await page.locator('.menu-item').filter({hasText:'페이지 전체 맞춤'}).click();
  check('card width fit and page fit');
  await card.getByRole('button',{name:'다음 페이지',exact:true}).click();
  assert.equal(await card.getAttribute('data-page'),'4');
  await card.getByRole('button',{name:'이전 페이지',exact:true}).click();
  const input=card.getByRole('spinbutton',{name:'페이지 번호'});
  await input.fill('3');await input.press('Enter');
  assert.equal(await card.getAttribute('data-page'),'3');
  assert.equal(await page.locator('.cpv-modal').count(),0);
  check('page input and arrows do not open popup');
  await card.locator('canvas').first().dblclick();
  const popup=page.locator('.cpv-modal .cpv-viewer');
  await popup.waitFor();await popup.locator('canvas').first().waitFor();
  assert.equal(await popup.getAttribute('data-page'),'3');
  assert.equal(await popup.getAttribute('data-layout'),'continuous');
  assert.equal(await popup.getAttribute('data-fit'),'width');
  check('double click opens popup at card page with default continuous width fit');
  const popupInput=popup.getByRole('spinbutton',{name:'페이지 번호'});
  await popupInput.fill('10');await popupInput.press('Enter');
  assert.equal(await popup.getAttribute('data-page'),'10');
  await popup.getByRole('button',{name:'크기 맞춤',exact:true}).click();
  await page.locator('.menu-item').filter({hasText:'페이지 전체 맞춤'}).click();
  for(const [label,layout] of [['한 페이지','single'],['두 페이지','spread'],['두 페이지 연속','spread-continuous'],['연속 보기','continuous']]){
   await popup.getByRole('button',{name:'페이지 배치',exact:true}).click();
   await page.locator('.menu-item').filter({hasText:new RegExp(`^${label}$`)}).click();
   assert.equal(await popup.getAttribute('data-layout'),layout);
  }
  check('all four popup layouts and fit menu');
  await popup.getByRole('button',{name:'확대',exact:true}).click();
  assert.equal(await popup.getAttribute('data-fit'),'custom');
  await popup.getByRole('button',{name:'축소',exact:true}).click();
  await popup.getByRole('button',{name:'크기 맞춤',exact:true}).click();
  await page.locator('.menu-item').filter({hasText:'페이지 전체 맞춤'}).click();
  await popup.getByRole('button',{name:'페이지 배치',exact:true}).click();
  await page.screenshot({path:`${out}/popup-menu-light.png`});
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('.cpv-modal').waitFor({state:'detached'});
  assert.equal(await card.getAttribute('data-page'),'3');
  check('popup navigation and zoom leave card on page 3');
  await card.getByRole('button',{name:'크게 보기',exact:true}).click();
  await popup.waitFor();
  assert.equal(await popup.getAttribute('data-page'),'3');
  assert.equal(await popup.getAttribute('data-fit'),'page');
  check('popup remembers view preferences and starts at card page');
  await page.evaluate(()=>{app.vault.setConfig('theme','obsidian');app.setTheme();});
  await page.locator('body.theme-dark').waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.cpv-modal .cpv-page')].some(el=>el.dataset.page==='3'&&el.querySelector('canvas')&&el.classList.contains('cpv-page-ready')));
  await page.waitForTimeout(250);
  assert.ok(await popup.locator('.cpv-page[data-page="3"] canvas').evaluate(c=>{
    const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let dark=0;for(let i=0;i<p.length;i+=4)if(p[i]<200&&p[i+3]>0)dark++;
    return dark>1000;
  }),'reopened popup must contain actual rendered PDF pixels');
  await page.screenshot({path:`${out}/popup-dark.png`});
  await page.locator('.cpv-modal .modal-close-button, .cpv-modal .modal-header-button:has(svg.lucide-x)').click();
  await page.evaluate(()=>{app.vault.setConfig('theme','moonstone');app.setTheme();});
  await page.locator('body.theme-light').waitFor();
  check('close button and both app themes');
  await page.evaluate(()=>{
   const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas,n=c.nodes.get('pdf-a');
   n.resize({width:320,height:380});c.requestSave();
  });
  await page.waitForTimeout(300);
  const smallFit=await card.evaluate(el=>{const v=el.querySelector('.cpv-viewport'),p=el.querySelector('.cpv-page');return p.offsetWidth<=v.clientWidth&&p.offsetHeight<=v.clientHeight;});
  assert.ok(smallFit);check('card resizing automatically refits page');
  await page.evaluate(()=>{
   const c=app.workspace.getLeavesOfType('canvas')[0].view.canvas,n=c.nodes.get('pdf-a');
   n.resize({width:520,height:660});c.requestSave();
  });
  await page.waitForTimeout(350);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(`${out}/ui-results.json`,JSON.stringify({checks,errors},null,2));
 } finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
