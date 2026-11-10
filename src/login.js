import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { USER_DATA_DIR, STORAGE_STATE_PATH } from './browser.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGIN_URL = 'https://accounts.google.com/ServiceLogin?hl=pt-BR&continue=https%3A%2F%2Fdatastudio.google.com%2Fu%2F0%2Freporting%2F5122833b-f83e-4786-b6fb-3cb9cd8f84e8%2Fpage%2Fp_o4l5vj4n3d';

async function main() {
  console.log('====================================================');
  console.log('🔐 ABRINDO CHROME ISOLADO PARA LOGIN AUTOMÁTICO');
  console.log('====================================================');

  // Usa o Chromium do próprio Playwright para NUNCA ser absorvido pelo Chrome já aberto no Windows!
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--no-default-browser-check',
      '--no-first-run'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  console.log('⏳ Entre com gabriel.santos@ajborges.com na janela "Chrome for Testing" que acabou de abrir...');

  let ready = false;
  const start = Date.now();
  while (!ready && Date.now() - start < 5 * 60 * 1000) {
    await page.waitForTimeout(2500);
    const url = page.url();
    if (url.includes('accounts.google.com')) continue;

    const status = await page.evaluate(() => {
      const txt = document.body.innerText || '';
      const hasKpis = txt.includes('PLANNING') && txt.includes('Scheduling');
      const hasNumbers = /\d+[,.]\d+%/.test(txt);
      return { hasKpis, hasNumbers };
    }).catch(() => ({ hasKpis: false, hasNumbers: false }));

    if (status.hasKpis && status.hasNumbers) {
      console.log('✅ Login detectado e números da AJ BORGES carregados!');
      await page.waitForTimeout(4000);
      ready = true;
    }
  }

  if (!ready) {
    console.error('❌ O login não foi concluído a tempo.');
    await context.close();
    process.exit(1);
  }

  const state = await context.storageState({ path: STORAGE_STATE_PATH });
  const base64Str = Buffer.from(JSON.stringify(state), 'utf-8').toString('base64');
  fs.writeFileSync(path.join(__dirname, '..', 'session_base64.txt'), base64Str, 'utf-8');

  console.log('✅ Sessão persistente salva em .chrome-profile, storageState.json e session_base64.txt!');
  await context.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
