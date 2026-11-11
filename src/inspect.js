import { launchBrowser, DATA_DIR } from './browser.js';
import path from 'path';
import fs from 'fs';

async function main() {
  const context = await launchBrowser(true);
  const page = context.pages()[0] || await context.newPage();
  await page.setViewportSize({ width: 1920, height: 1200 });

  await page.goto('https://datastudio.google.com/u/0/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/page/p_o4l5vj4n3d', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10000);

  await page.screenshot({ path: path.join(DATA_DIR, 'check_cookies_today.png') });
  console.log('URL final:', page.url());
  const txt = await page.evaluate(() => document.body.innerText);
  console.log('Primeiras linhas:', txt.slice(0, 500));
  await context.close();
}

main();
