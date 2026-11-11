import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { PAGES, DATA_DIR, USER_DATA_DIR, STORAGE_STATE_PATH, loadEnvFile } from './browser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CODE_FILE = path.join(DATA_DIR, 'codigo_google.txt');
const STATUS_FILE = path.join(DATA_DIR, 'status_login.txt');

async function main() {
  loadEnvFile();
  if (fs.existsSync(CODE_FILE)) fs.unlinkSync(CODE_FILE);
  fs.writeFileSync(STATUS_FILE, 'INICIANDO', 'utf-8');

  const email = process.env.GOOGLE_EMAIL || 'gabriel.santos@ajborges.com';
  const password = process.env.GOOGLE_PASSWORD || 'Gabriel321!';

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    viewport: { width: 1920, height: 1200 },
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

  console.log(`🔐 Preenchendo login e senha para ${email}...`);
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
    console.log('📲 Disparando SMS para o celular final 25...');
    await smsOption.click();
    await page.waitForTimeout(4000);
  }

  await page.screenshot({ path: path.join(DATA_DIR, 'aguardando_sms.png') }).catch(() => {});
  fs.writeFileSync(STATUS_FILE, 'AGUARDANDO_SMS', 'utf-8');
  console.log('✅ SMS enviado! Aguardando código em dados/codigo_google.txt...');

  const start = Date.now();
  while (Date.now() - start < 15 * 60 * 1000) {
    await page.waitForTimeout(1000);
    if (fs.existsSync(CODE_FILE)) {
      const raw = fs.readFileSync(CODE_FILE, 'utf-8').trim();
      fs.unlinkSync(CODE_FILE);
      const digits = raw.replace(/^G-/i, '').replace(/\D/g, '');
      if (digits) {
        console.log(`🔑 Preenchendo código SMS: ${digits}...`);
        fs.writeFileSync(STATUS_FILE, `PREENCHENDO_${digits}`, 'utf-8');
        const codeInput = page.locator('input#idvPin, input[type="tel"], input[type="text"]').first();
        await codeInput.fill(digits);
        await page.waitForTimeout(500);
        const nextBtn = page.locator('button:has-text("Avançar"), button:has-text("Next")').first();
        if (await nextBtn.isVisible().catch(() => false)) {
          await nextBtn.click();
        } else {
          await page.keyboard.press('Enter');
        }
        await page.waitForURL(/datastudio\.google\.com|lookerstudio\.google\.com/, { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(12000);
        await page.screenshot({ path: path.join(DATA_DIR, 'bsc_autenticado.png') }).catch(() => {});

        const state = await context.storageState({ path: STORAGE_STATE_PATH });
        const base64Str = Buffer.from(JSON.stringify(state), 'utf-8').toString('base64');
        fs.writeFileSync(path.join(__dirname, '..', 'session_base64.txt'), base64Str, 'utf-8');
        fs.writeFileSync(STATUS_FILE, 'AUTENTICADO_COM_SUCESSO', 'utf-8');
        console.log('🎉 SESSÃO SALVA COM SUCESSO!');
        await context.close();
        process.exit(0);
      }
    }
  }

  fs.writeFileSync(STATUS_FILE, 'TIMEOUT', 'utf-8');
  await context.close();
  process.exit(1);
}

main().catch(err => {
  fs.writeFileSync(STATUS_FILE, 'ERRO: ' + err.message, 'utf-8');
  console.error(err);
  process.exit(1);
});
