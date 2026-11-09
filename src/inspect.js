import { launchBrowser, DATA_DIR } from './browser.js';
import path from 'path';
import fs from 'fs';

const REPORT_URL = 'https://lookerstudio.google.com/u/0/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/page/p_o4l5vj4n3d';

async function main() {
  const context = await launchBrowser(false);
  const page = context.pages()[0] || await context.newPage();
  await page.setViewportSize({ width: 1920, height: 1200 });

  await page.goto(REPORT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  // Clica no filtro de período
  const dateBtn = page.locator('.ng2-date-picker-button, .canvas-date-input').first();
  await dateBtn.click();
  await page.waitForTimeout(2000);

  await page.screenshot({ path: path.join(DATA_DIR, 'date_picker_open.png') });

  // Captura o HTML/texto do popup do date picker
  const pickerInfo = await page.evaluate(() => {
    const popup = document.querySelector('.mat-datepicker-content, .ng2-date-picker-popup, .cdk-overlay-container');
    return popup ? popup.innerText : 'Nenhum popup encontrado';
  });
  console.log('Date Picker Popup:', pickerInfo);

  // Fecha o popup
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Também vamos verificar os outros 2 controles de filtro no topo da página (ex: x: 1050, y: 173)
  const dimensionFilters = await page.locator('ng2-canvas-component.dimension-filter').all();
  console.log(`Encontrados ${dimensionFilters.length} filtros de dimensão.`);

  // E vamos ler a página "Report Spot Pendente" e "Premissas" completas
  await page.goto('https://lookerstudio.google.com/u/0/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/page/p_2t7eifk4xd', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  await page.screenshot({ path: path.join(DATA_DIR, 'report_spot_pendente.png'), fullPage: true });

  await context.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
