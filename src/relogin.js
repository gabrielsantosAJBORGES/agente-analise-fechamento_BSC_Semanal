import { launchBrowser, loadEnvFile, PAGES } from './browser.js';
import fs from 'fs';

async function relogin() {
  loadEnvFile();
  const password = process.env.GOOGLE_PASSWORD;
  const context = await launchBrowser(true);
  const page = context.pages()[0] || await context.newPage();

  console.log('Navegando para o Google ServiceLogin...');
  await page.goto('https://accounts.google.com/ServiceLogin?continue=' + encodeURIComponent(PAGES.principal));
  await page.waitForTimeout(4000);
  console.log('URL 1:', page.url());

  const avBtn = page.locator('button:has-text("Avançar"), #identifierNext button, button:has-text("Next")').first();
  if (await avBtn.isVisible().catch(() => false)) {
    console.log('Clicando em Avançar...');
    await avBtn.click();
    await page.waitForTimeout(4000);
  }

  console.log('URL 2:', page.url());
  const passInput = page.locator('input[name="Passwd"], input[type="password"]:not([aria-hidden="true"])').first();
  if (await passInput.isVisible().catch(() => false)) {
    console.log('Preenchendo senha...');
    await passInput.fill(password);
    await page.waitForTimeout(1000);
    const passNext = page.locator('#passwordNext button, button:has-text("Avançar"), button:has-text("Next")').first();
    await passNext.click();
    await page.waitForTimeout(10000);
  }

  console.log('URL 3:', page.url());
  console.log('Título:', await page.title());
  const txt = await page.evaluate(() => document.body.innerText);
  console.log('Texto:', txt.slice(0, 300));

  await page.screenshot({ path: 'dados/login_reconfirm_result.png' });

  if (page.url().includes('datastudio.google.com') || page.url().includes('lookerstudio.google.com')) {
    const state = await context.storageState();
    fs.writeFileSync('storageState.json', JSON.stringify(state, null, 2));
    const base64 = Buffer.from(JSON.stringify(state), 'utf-8').toString('base64');
    fs.writeFileSync('session_base64.txt', base64, 'utf-8');
    console.log('✅ SUCESSO: Sessão renovada com sucesso!');
  } else {
    console.log('⚠️ Requer confirmação adicional (2FA/SMS/Prompt)');
  }

  await context.close();
}

relogin().catch(console.error);
