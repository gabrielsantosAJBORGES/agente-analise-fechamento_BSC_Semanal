import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPORT_ID = '5122833b-f83e-4786-b6fb-3cb9cd8f84e8';
export const PAGES = {
  principal: `https://datastudio.google.com/u/0/reporting/${REPORT_ID}/page/p_o4l5vj4n3d`,
  etaOrigem: `https://datastudio.google.com/u/0/reporting/${REPORT_ID}/page/p_imo7o7l02d`,
  etaDestino: `https://datastudio.google.com/u/0/reporting/${REPORT_ID}/page/p_rfbd66mqzd`,
  telemetria: `https://datastudio.google.com/u/0/reporting/${REPORT_ID}/page/p_eoy8m7p46d`,
  spotPendente: `https://datastudio.google.com/u/0/reporting/${REPORT_ID}/page/p_2t7eifk4xd`
};

export const USER_DATA_DIR = path.join(__dirname, '..', '.chrome-profile');
export const DATA_DIR = path.join(__dirname, '..', 'dados');
export const REPORTS_DIR = path.join(__dirname, '..', 'relatorios');
export const STORAGE_STATE_PATH = path.join(__dirname, '..', 'storageState.json');

for (const dir of [USER_DATA_DIR, DATA_DIR, REPORTS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

/**
 * Realiza o login automático na conta Google (usando GOOGLE_EMAIL e GOOGLE_PASSWORD)
 * caso a página peça autenticação ou os dados apareçam deslogados.
 */
export async function ensureGoogleAuthenticated(page, context) {
  loadEnvFile();
  const email = process.env.GOOGLE_EMAIL || 'gabriel.santos@ajborges.com';
  const password = process.env.GOOGLE_PASSWORD;

  await page.goto(PAGES.principal, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  // Verifica se caiu em tela de login ou se está deslogado ("Mais detalhes" em todos os cards e sem números)
  const needsLogin = await page.evaluate(() => {
    const url = window.location.href;
    if (url.includes('accounts.google.com')) return true;
    const txt = document.body.innerText || '';
    const hasNumbers = /\d+[,.]\d+%/.test(txt);
    const hasError = txt.includes('Erro de configuração do conjunto de dados');
    return !hasNumbers && hasError;
  }).catch(() => true);

  if (!needsLogin) {
    console.log('✅ Sessão Google já está ativa e autenticada com acesso aos dados!');
    return true;
  }

  if (!password || password === 'SUA_SENHA_DO_GOOGLE_AQUI') {
    console.warn('⚠️ Sessão desconectada e GOOGLE_PASSWORD não informada no .env / Secrets.');
    return false;
  }

  console.log(`🔐 Realizando login automático no Google com a conta: ${email}...`);
  const loginUrl = `https://accounts.google.com/ServiceLogin?hl=pt-BR&continue=${encodeURIComponent(PAGES.principal)}`;
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Se aparecer lista de contas ("Escolha uma conta"), clica em "Usar outra conta" ou na conta correspondente
  const emailInput = page.locator('input[type="email"]');
  if ((await emailInput.count()) === 0) {
    const targetAccount = page.locator(`[data-identifier="${email}"]`).first();
    if (await targetAccount.count()) {
      await targetAccount.click();
      await page.waitForTimeout(2500);
    } else {
      const useAnother = page.locator('text=/Usar outra conta|Use another account/i').first();
      if (await useAnother.count()) {
        await useAnother.click();
        await page.waitForTimeout(2500);
      }
    }
  }

  if (await emailInput.count()) {
    await emailInput.fill(email);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(4000);
  }

  const passInput = page.locator('input[type="password"]').first();
  await passInput.waitFor({ state: 'visible', timeout: 15000 });
  await passInput.fill(password);
  await page.keyboard.press('Enter');

  console.log('⏳ Aguardando redirecionamento para o Looker Studio após login...');
  await page.waitForTimeout(14000);

  // Salva o estado atualizado para as próximas execuções
  try {
    const state = await context.storageState({ path: STORAGE_STATE_PATH });
    const base64Str = Buffer.from(JSON.stringify(state), 'utf-8').toString('base64');
    fs.writeFileSync(path.join(__dirname, '..', 'session_base64.txt'), base64Str, 'utf-8');
    console.log('✅ Sessão autenticada e salva em storageState.json / session_base64.txt!');
  } catch (e) {}

  return true;
}

export async function launchBrowser(headless = true) {
  loadEnvFile();

  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  const base64State = process.env.GOOGLE_STORAGE_STATE_BASE64;

  if (isCI || base64State) {
    let storageState = undefined;
    if (base64State) {
      const jsonStr = Buffer.from(base64State, 'base64').toString('utf-8');
      fs.writeFileSync(STORAGE_STATE_PATH, jsonStr, 'utf-8');
      storageState = STORAGE_STATE_PATH;
    } else if (fs.existsSync(STORAGE_STATE_PATH)) {
      storageState = STORAGE_STATE_PATH;
    }

    const browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });

    const context = await browser.newContext({
      storageState,
      viewport: { width: 1920, height: 1200 },
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    });

    const origClose = context.close.bind(context);
    context.close = async () => {
      await origClose();
      await browser.close();
    };
    return context;
  }

  // Modo Local: usa perfil persistente no Chromium isolado do Playwright
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless,
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

  return context;
}
