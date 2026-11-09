import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPORT_URL = 'https://lookerstudio.google.com/u/0/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/page/p_5k1isy2qwd';
export const USER_DATA_DIR = path.join(__dirname, '..', '.chrome-profile');
export const DATA_DIR = path.join(__dirname, '..', 'dados');
export const REPORTS_DIR = path.join(__dirname, '..', 'relatorios');
export const STORAGE_STATE_PATH = path.join(__dirname, '..', 'storageState.json');

for (const dir of [USER_DATA_DIR, DATA_DIR, REPORTS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Carrega variáveis de um arquivo .env local caso exista (sem depender de pacotes externos)
 */
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
 * Abre o navegador:
 * - Na nuvem (GitHub Actions / CI ou com GOOGLE_STORAGE_STATE_BASE64): usa Chromium headless + storageState
 * - Localmente no Windows: usa o perfil persistente `.chrome-profile` no Chrome local
 */
export async function launchBrowser(headless = false) {
  loadEnvFile();

  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  const base64State = process.env.GOOGLE_STORAGE_STATE_BASE64;
  const hasStorageStateFile = fs.existsSync(STORAGE_STATE_PATH);

  if (isCI || base64State || hasStorageStateFile) {
    let storageState = undefined;

    if (base64State) {
      const jsonStr = Buffer.from(base64State, 'base64').toString('utf-8');
      fs.writeFileSync(STORAGE_STATE_PATH, jsonStr, 'utf-8');
      storageState = STORAGE_STATE_PATH;
    } else if (hasStorageStateFile) {
      storageState = STORAGE_STATE_PATH;
    }

    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    const executablePath = isCI ? undefined : chromePaths.find(p => fs.existsSync(p));

    const browser = await chromium.launch({
      executablePath,
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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    });

    // Anexa método close que fecha o browser inteiro
    const origClose = context.close.bind(context);
    context.close = async () => {
      await origClose();
      await browser.close();
    };

    return context;
  }

  // Modo Local (Windows Chrome com perfil persistente)
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];

  const executablePath = chromePaths.find(p => fs.existsSync(p));

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    executablePath,
    headless,
    viewport: { width: 1920, height: 1200 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--no-default-browser-check',
      '--no-first-run'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });

  return context;
}
