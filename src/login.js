import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { PAGES, DATA_DIR, USER_DATA_DIR, STORAGE_STATE_PATH, loadEnvFile } from './browser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function askInTerminal(questionText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(questionText, answer => {
      rl.close();
      resolve((answer || '').trim());
    });
  });
}

async function main() {
  loadEnvFile();

  const email = process.env.GOOGLE_EMAIL || 'gabriel.santos@ajborges.com';
  const password = process.env.GOOGLE_PASSWORD || 'Gabriel321!';

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check',
      '--no-first-run'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });

  const page = context.pages()[0] || await context.newPage();

  console.log(`🔐 Preenchendo login e senha automaticamente para ${email}...`);
  const loginUrl = `https://accounts.google.com/ServiceLogin?hl=pt-BR&continue=${encodeURIComponent(PAGES.principal)}`;
  await page.goto(loginUrl, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000);

  const emailInput = page.locator('input#identifierId, input[type="email"]').first();
  const accountItem = page.locator(`[data-identifier="${email}"]`).first();

  await Promise.race([
    emailInput.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
    accountItem.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  ]);

  if (await accountItem.isVisible().catch(() => false)) {
    await accountItem.click();
    await page.waitForTimeout(3000);
  } else if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(email);
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
  }

  const passInput = page.locator('input[name="Passwd"], input[type="password"]:not([aria-hidden="true"])').first();
  if (await passInput.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)) {
    await page.waitForTimeout(500);
    await passInput.fill(password);
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(5000);
  }

  const tryAnother = page.locator('button:has-text("Tentar de outro jeito"), span:has-text("Tentar de outro jeito")').first();
  if (await tryAnother.isVisible().catch(() => false)) {
    console.log('🔄 Clicando em "Tentar de outro jeito"...');
    await tryAnother.click();
    await page.waitForTimeout(4000);
  }

  const smsOption = page.locator('text=/Receber um código de verificação no número/i').first();
  if (await smsOption.isVisible().catch(() => false)) {
    console.log('📲 Enviando código SMS para o celular final 25...');
    await smsOption.click();
    await page.waitForTimeout(4000);
  }

  const rawCode = await askInTerminal('\n👉 Digite os 6 numeros do SMS recebido no celular final 25 (ex: 123456) e aperte ENTER: ');
  const digits = rawCode.replace(/^G-/i, '').replace(/\D/g, '');
  if (digits) {
    const codeInput = page.locator('input#idvPin, input[type="tel"], input[type="text"]').first();
    if (await codeInput.isVisible().catch(() => false)) {
      await codeInput.fill(digits);
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
    }
  }

  console.log('⏳ Aguardando carregamento dos números da AJ BORGES no Looker Studio...');
  await page.waitForURL(/datastudio\.google\.com|lookerstudio\.google\.com/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(12000);

  const state = await context.storageState({ path: STORAGE_STATE_PATH });
  const base64Str = Buffer.from(JSON.stringify(state), 'utf-8').toString('base64');
  fs.writeFileSync(path.join(__dirname, '..', 'session_base64.txt'), base64Str, 'utf-8');

  console.log('✅ Sessão definitiva salva em .chrome-profile, storageState.json e session_base64.txt!');
  await context.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
