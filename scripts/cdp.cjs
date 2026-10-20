// Validation only. Use NODE_PATH to locate the host's Playwright installation.
const { chromium } = require('playwright');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT || 9260}`);
  try {
  const pages = browser.contexts().flatMap(c => c.pages());
  const page = (await Promise.all(pages.map(async p => ({p, title: await p.title()})))).find(x => x.title.includes('CanvasPdfViewcard-Sandbox'))?.p;
  if (!page) throw new Error('Expected isolated Sandbox target not found');
  if (process.argv[2] === '--screenshot') await page.screenshot({path: process.argv[3]});
  else {
    const source = fs.readFileSync(process.argv[2], 'utf8');
    console.log(JSON.stringify(await page.evaluate(source), null, 2));
  }
  } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
