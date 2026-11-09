import { launchBrowser, REPORT_URL, DATA_DIR } from './browser.js';
import path from 'path';
import fs from 'fs';

async function main() {
  console.log('====================================================');
  console.log('🔐 INICIANDO NAVEGADOR PARA LOGIN E INSPEÇÃO INICIAL');
  console.log('====================================================');
  console.log('1. Uma janela do Chrome será aberta no seu relatório do Looker Studio.');
  console.log('2. Caso peça login, entre normalmente com seu e-mail e senha do Google.');
  console.log('3. Assim que o painel carregar os números na tela, aguarde alguns segundos.');
  console.log('   O agente irá detectar o painel carregado automaticamente e mapear todos os indicadores!\n');

  const context = await launchBrowser(false);
  const page = context.pages()[0] || await context.newPage();

  await page.goto(REPORT_URL, { waitUntil: 'domcontentloaded' });

  console.log('⏳ Aguardando você fazer login e o relatório do Looker Studio carregar...');

  // Aguarda até que a URL não seja accounts.google.com e que elementos do Looker Studio apareçam na página
  let loaded = false;
  const maxWaitMs = 5 * 60 * 1000; // 5 minutos para login tranquilo
  const startTime = Date.now();

  while (!loaded && (Date.now() - startTime) < maxWaitMs) {
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    if (currentUrl.includes('accounts.google.com')) {
      continue;
    }

    // Verifica se componentes do Looker Studio já renderizaram
    const hasComponents = await page.evaluate(() => {
      const selectors = [
        'ng2-reporting-plate',
        '.canvas-container',
        'lsembed-report',
        'ng2-canvas-component',
        '[class*="scorecard"]',
        '[class*="table"]',
        'lego-report'
      ];
      return selectors.some(sel => document.querySelectorAll(sel).length > 0);
    }).catch(() => false);

    if (hasComponents) {
      console.log('✅ Painel detectado! Aguardando 8 segundos extras para todos os gráficos e números carregarem...');
      await page.waitForTimeout(8000);
      loaded = true;
    }
  }

  if (!loaded) {
    console.error('❌ Tempo esgotado aguardando o carregamento do painel.');
    await context.close();
    process.exit(1);
  }

  // Tira print da página carregada e mapeia a estrutura DOM dos componentes e filtros
  const screenshotPath = path.join(DATA_DIR, 'painel_inicial.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 Screenshot salva em: ${screenshotPath}`);

  const inspectionData = await page.evaluate(() => {
    const cleanText = (el) => (el.innerText || '').trim().replace(/\s+/g, ' ');

    // Busca filtros de data
    const datePickers = Array.from(document.querySelectorAll(
      'ng2-date-picker, [class*="date-picker"], [class*="datePicker"], [aria-label*="date" i], [aria-label*="data" i], .md-datepicker-button, button, [role="button"]'
    )).map(el => ({
      tag: el.tagName.toLowerCase(),
      className: el.className,
      text: cleanText(el),
      ariaLabel: el.getAttribute('aria-label'),
      rect: el.getBoundingClientRect()
    })).filter(item => item.text.length > 0 && item.text.length < 120);

    // Busca todos os componentes visuais do canvas do Looker Studio
    const components = Array.from(document.querySelectorAll(
      'ng2-canvas-component, .canvas-component, lego-table, scorecard, [class*="scorecard"], [class*="chart"], [role="grid"], [role="table"]'
    )).map((el, idx) => ({
      index: idx,
      tag: el.tagName.toLowerCase(),
      className: el.className,
      text: (el.innerText || '').trim(),
      rect: el.getBoundingClientRect()
    })).filter(c => c.text.length > 0);

    // Páginas de navegação se houver
    const navItems = Array.from(document.querySelectorAll(
      '[class*="page-nav"], [class*="navigation"], [role="tab"], [role="menuitem"]'
    )).map(el => cleanText(el)).filter(Boolean);

    return {
      title: document.title,
      url: window.location.href,
      fullBodyText: document.body.innerText,
      datePickers,
      components,
      navItems
    };
  });

  const inspectionFile = path.join(DATA_DIR, 'inspecao_painel.json');
  fs.writeFileSync(inspectionFile, JSON.stringify(inspectionData, null, 2), 'utf-8');
  console.log(`📄 Dados estruturados do painel salvos em: ${inspectionFile}`);
  console.log('✅ Sessão salva com sucesso! Fechando navegador...');

  await context.close();
}

main().catch(err => {
  console.error('Erro durante login/inspeção:', err);
  process.exit(1);
});
