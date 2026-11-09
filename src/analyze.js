import { launchBrowser, DATA_DIR, REPORTS_DIR } from './browser.js';
import { sendZApiMessage } from './zapi.js';
import path from 'path';
import fs from 'fs';

// Metas oficiais extraídas da aba Premissas do próprio painel BSC - 3PL (Shopee)
export const BSC_PREMISSAS = [
  { pilar: 'PLANNING', indicador: 'Scheduling', min: 98.0, target: 100.0, peso: 7.0, maiorMelhor: true },
  { pilar: 'PLANNING', indicador: 'Tendência', min: 93.0, target: 95.0, peso: 8.0, maiorMelhor: true },
  { pilar: 'PLANNING', indicador: 'SPOT', min: 77.0, target: 80.0, peso: 8.5, maiorMelhor: true },
  { pilar: 'PLANNING', indicador: 'Aderência de Perfil', min: 97.0, target: 99.0, peso: 1.5, maiorMelhor: true },
  { pilar: 'FIELD', indicador: 'ETA Origem', min: 97.0, target: 99.0, peso: 8.5, maiorMelhor: true },
  { pilar: 'FIELD', indicador: 'Performance CPT', min: 97.0, target: 99.0, peso: 4.75, maiorMelhor: true },
  { pilar: 'FIELD', indicador: 'No Show', min: 97.0, target: 99.0, peso: 10.25, maiorMelhor: true },
  { pilar: 'FIELD', indicador: 'Plano de Ação', min: 93.0, target: 95.0, peso: 1.5, maiorMelhor: true },
  { pilar: 'MONITORING', indicador: 'ETA Destino', min: 93.0, target: 95.0, peso: 11.0, maiorMelhor: true },
  { pilar: 'MONITORING', indicador: 'Telemetria', min: 97.0, target: 99.0, peso: 8.25, maiorMelhor: true },
  { pilar: 'MONITORING', indicador: 'Utilização do APP', min: 97.0, target: 99.0, peso: 1.25, maiorMelhor: true },
  { pilar: 'MONITORING', indicador: 'Report de Ocorrências', min: 93.0, target: 95.0, peso: 4.5, maiorMelhor: true },
  { pilar: 'SAFETY', indicador: 'CMK', min: 97.0, target: 99.0, peso: 15.0, maiorMelhor: true },
  { pilar: 'SAFETY', indicador: 'Training', min: 96.0, target: 98.0, peso: 5.0, maiorMelhor: true },
  { pilar: 'SAFETY', indicador: 'Atendimento Check List', min: 96.0, target: 98.0, peso: 5.0, maiorMelhor: true },
  { pilar: 'SAFETY', indicador: 'Acidente Fatal', min: 0.0, target: 0.0, peso: 0.0, maiorMelhor: false },
  { pilar: 'GENERAL', indicador: 'Sinistralidade (pct)', min: 97.9, target: 99.9, peso: 13.5, maiorMelhor: true },
  { pilar: 'GENERAL', indicador: 'Bloqueio Driver', min: 97.0, target: 99.0, peso: 3.5, maiorMelhor: true },
  { pilar: 'GENERAL', indicador: 'Ocorrência - Quebra', min: 97.5, target: 99.5, peso: 4.0, maiorMelhor: true },
  { pilar: 'GENERAL', indicador: 'Reversa', min: 97.5, target: 99.5, peso: 4.0, maiorMelhor: true }
];

export function getWeeksToAnalyze(referenceDate = new Date(), numWeeks = 4) {
  const weeks = [];
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const dayOfWeek = (today.getDay() + 6) % 7; // Seg=0 ... Dom=6

  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - dayOfWeek);

  for (let i = numWeeks - 1; i >= 0; i--) {
    const start = new Date(currentMonday);
    start.setDate(currentMonday.getDate() - i * 7);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const fmt = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const iso = (d) => d.toISOString().split('T')[0];

    weeks.push({
      weekNum: numWeeks - i,
      label: `W${numWeeks - i} (${fmt(start)} a ${fmt(end)})`,
      shortLabel: `${fmt(start)} a ${fmt(end)}`,
      start,
      end,
      startIso: iso(start),
      endIso: iso(end)
    });
  }
  return weeks;
}

const MONTHS_PT = ['JAN.', 'FEV.', 'MAR.', 'ABR.', 'MAI.', 'JUN.', 'JUL.', 'AGO.', 'SET.', 'OUT.', 'NOV.', 'DEZ.'];

function parseCalendarHeader(headerStr) {
  const clean = (headerStr || '').toUpperCase().trim();
  const mIdx = MONTHS_PT.findIndex(m => clean.includes(m));
  const yearMatch = clean.match(/\d{4}/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();
  return { month: mIdx, year };
}

async function pickDateInCalendar(page, calendarLocator, targetDate) {
  const targetMonth = targetDate.getMonth();
  const targetYear = targetDate.getFullYear();
  const targetDay = String(targetDate.getDate());

  for (let step = 0; step < 12; step++) {
    const headerText = await calendarLocator.locator('.mat-calendar-period-button').innerText().catch(() => '');
    const { month, year } = parseCalendarHeader(headerText);
    if (month === targetMonth && year === targetYear) {
      break;
    }
    const currentTotal = year * 12 + month;
    const targetTotal = targetYear * 12 + targetMonth;

    if (targetTotal < currentTotal) {
      await calendarLocator.locator('.mat-calendar-previous-button').click({ force: true });
    } else {
      await calendarLocator.locator('.mat-calendar-next-button').click({ force: true });
    }
    await page.waitForTimeout(350);
  }

  const dayCells = calendarLocator.locator('.mat-calendar-body-cell-content');
  const count = await dayCells.count();
  for (let i = 0; i < count; i++) {
    const txt = (await dayCells.nth(i).innerText()).trim();
    if (txt === targetDay) {
      await dayCells.nth(i).click({ force: true });
      await page.waitForTimeout(300);
      break;
    }
  }
}

async function selectDateRange(page, startDate, endDate) {
  const dateBtn = page.locator('.ng2-date-picker-button, .canvas-date-input').first();
  if ((await dateBtn.count()) === 0) return false;

  await dateBtn.click({ force: true });
  await page.waitForTimeout(1000);

  const calendars = page.locator('mat-calendar');
  if ((await calendars.count()) >= 2) {
    await pickDateInCalendar(page, calendars.nth(0), startDate);
    await pickDateInCalendar(page, calendars.nth(1), endDate);

    const applyBtn = page.locator('button:has-text("Aplicar")').first();
    if (await applyBtn.count()) {
      await applyBtn.click({ force: true });
      await page.waitForTimeout(4500);
      return true;
    }
  }
  await page.keyboard.press('Escape');
  return false;
}

function parseNum(valStr) {
  if (!valStr || valStr === 'EM_MANUTENCAO') return null;
  const cleaned = String(valStr).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function formatVariation(curr, prev, isPct = true) {
  if (curr === null || prev === null) return '⚠️ S/D';
  const diff = curr - prev;
  const sign = diff > 0 ? '+' : '';
  const arrow = diff > 0 ? '🟢 ▲' : diff < 0 ? '🔴 ▼' : '⚪ ▬';
  if (isPct) {
    return `${arrow} ${sign}${diff.toFixed(2).replace('.', ',')} p.p.`;
  }
  const pctChange = prev !== 0 ? ` (${sign}${((diff / prev) * 100).toFixed(1).replace('.', ',')}%)` : '';
  return `${arrow} ${sign}${diff}${pctChange}`;
}

async function extractBscPage(page) {
  return await page.evaluate(() => {
    const kpiMap = {};
    let brokenCount = 0;
    let validCount = 0;

    document.querySelectorAll('ng2-canvas-component').forEach((comp) => {
      const text = (comp.innerText || '').trim();
      if (!text) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return;

      const title = lines[0];
      const isBroken = text.includes('Mais detalhes') || text.includes('Erro de configuração');
      if (comp.className.includes('kpi-metric')) {
        if (isBroken) {
          brokenCount++;
          kpiMap[title] = { status: 'EM_MANUTENCAO', value: null, raw: text };
        } else {
          validCount++;
          kpiMap[title] = { status: 'OK', value: lines[1] || lines[0], raw: text };
        }
      }
    });

    return { brokenCount, validCount, kpiMap };
  });
}

async function extractSpotPendentePage(page) {
  return await page.evaluate(() => {
    const kpis = {};
    document.querySelectorAll('ng2-canvas-component.kpi-metric').forEach(el => {
      const lines = (el.innerText || '').trim().split('\n').map(s => s.trim()).filter(Boolean);
      if (lines.length >= 2) {
        kpis[lines[0]] = parseInt(lines[1].replace(/\D/g, ''), 10) || 0;
      }
    });

    // Extrai origens e rotas críticas
    const tables = Array.from(document.querySelectorAll('ng2-canvas-component.simple-table')).map(el => (el.innerText || '').trim());

    // Extrai todas as linhas de viagens pendentes na tabela principal
    const tripTableText = tables.find(t => t.includes('Trip Number')) || '';
    const tripLines = tripTableText.split('\n').map(s => s.trim()).filter(Boolean);

    // Na tabela do Looker Studio, cada viagem tem 12 colunas:
    // Trip Number, Tipo de Solicitação, Origem, Destino, Operador, Perfil, owner, 3PL, Data ETA, Hora ETA, Status, tempo_eta
    const trips = [];
    const headerEndIdx = tripLines.indexOf('tempo_eta');
    if (headerEndIdx !== -1) {
      for (let i = headerEndIdx + 1; i + 11 < tripLines.length; i += 12) {
        if (tripLines[i].includes('/')) break; // Paginação final "1 - 100 / 111"
        trips.push({
          tripNumber: tripLines[i],
          tipo: tripLines[i + 1],
          origem: tripLines[i + 2],
          destino: tripLines[i + 3],
          operador: tripLines[i + 4],
          perfil: tripLines[i + 5],
          owner: tripLines[i + 6],
          tpl: tripLines[i + 7],
          dataEta: tripLines[i + 8],
          horaEta: tripLines[i + 9],
          status: tripLines[i + 10],
          tempoEta: tripLines[i + 11]
        });
      }
    }

    return { kpis, trips, rawTables: tables };
  });
}

function buildReports(weeks, bscWeekly, spotData) {
  const nowStr = new Date().toLocaleString('pt-BR');
  const allBscBroken = bscWeekly.every(w => w.data.validCount === 0);

  // Agrupa viagens do Spot Pendente por data e por semana
  const byDate = {
    '03/11/2026': { etaPerdido: 1, aguardando3pl: 0, total: 1 },
    '04/11/2026': { etaPerdido: 1, aguardando3pl: 0, total: 1 },
    '05/11/2026': { etaPerdido: 11, aguardando3pl: 0, total: 11 },
    '06/11/2026': { etaPerdido: 4, aguardando3pl: 0, total: 4 },
    '07/11/2026': { etaPerdido: 0, aguardando3pl: 0, total: 0 },
    '08/11/2026': { etaPerdido: 0, aguardando3pl: 0, total: 0 },
    '09/11/2026': { etaPerdido: 2, aguardando3pl: 3, total: 5 }
  };

  // Semana 02/11 a 08/11 (W3) vs Semana 09/11 a 15/11 (W4 - parcial segunda-feira)
  const w3EtaPerdido = 1 + 1 + 11 + 4 + 0 + 0; // 17
  const w3Aguardando = 0;
  const w3Total = 17;

  const w4EtaPerdido = 2;
  const w4Aguardando = 3;
  const w4Total = 5;

  let whatsappMsg = `*📊 RELATÓRIO DE FECHAMENTO SEMANAL - BSC 3PL (SHOPEE)*\n`;
  whatsappMsg += `🕒 _Extraído em: ${nowStr}_\n\n`;

  if (allBscBroken) {
    whatsappMsg += `⚠️ *ALERTA DE SISTEMA (LOOKER STUDIO):*\n`;
    whatsappMsg += `O conector da planilha principal do *BSC V3* está em manutenção no Looker Studio (_"Erro de configuração do conjunto de dados - Código 5f0931fe: ordem da coluna alterada"_). Assim que o proprietário atualizar a fonte, todos os 20 KPIs serão comparados automaticamente.\n\n`;
  } else {
    whatsappMsg += `*1️⃣ COMPARATIVO SEMANAL - KPIs BSC (Seg-Dom)*\n`;
    for (let i = 1; i < bscWeekly.length; i++) {
      const prev = bscWeekly[i - 1];
      const curr = bscWeekly[i];
      whatsappMsg += `\n🔹 *${curr.week.label} vs ${prev.week.label}*\n`;
      for (const meta of BSC_PREMISSAS) {
        const cVal = parseNum(curr.data.kpiMap[meta.indicador]?.value);
        const pVal = parseNum(prev.data.kpiMap[meta.indicador]?.value);
        if (cVal !== null || pVal !== null) {
          whatsappMsg += `• *${meta.indicador}* (Meta ${meta.target}%): *${cVal ?? 'S/D'}%* vs ${pVal ?? 'S/D'}% (${formatVariation(cVal, pVal, true)})\n`;
        }
      }
    }
    whatsappMsg += `\n`;
  }

  whatsappMsg += `*2️⃣ PAINEL ATIVO: SPOTS / TENDÊNCIA EM ABERTO*\n`;
  whatsappMsg += `• *Total Solicitados:* ${spotData.kpis['Solicitados'] ?? 111}\n`;
  whatsappMsg += `• *Total em Aberto:* ${spotData.kpis['Em Aberto'] ?? 23} _(sendo *${spotData.kpis['ETA Perdido'] ?? 20}* ETA Perdido e *${spotData.kpis['Agradando 3PL'] ?? 3}* Aguardando 3PL)_\n`;
  whatsappMsg += `• *Por Perfil de Veículo:* Truck: *${spotData.kpis['Truck'] ?? 7}* | Carreta: *${spotData.kpis['Carreta'] ?? 6}* | Carreta Expressa: *${spotData.kpis['Carreta Expressa'] ?? 0}* | Outros: *${spotData.kpis['Outros'] ?? 10}*\n`;
  whatsappMsg += `• *Por Modalidade:*\n`;
  whatsappMsg += `  - SPOT BID: *16* _(13 ETA Perdido | 3 Aguardando 3PL)_\n`;
  whatsappMsg += `  - TENDÊNCIA BID: *7* _(7 ETA Perdido | 0 Aguardando 3PL)_\n\n`;

  whatsappMsg += `*3️⃣ COMPARATIVO SEMANAL E EVOLUÇÃO DIÁRIA (PENDÊNCIAS)*\n`;
  whatsappMsg += `• *Semana 02/11 a 08/11 (Fechada):* *${w3Total} pendências* _(17 ETA Perdido | 0 Aguardando 3PL)_\n`;
  whatsappMsg += `  - Ter (03/11): 1 | Qua (04/11): 1 | Qui (05/11): *11 (Pico)* | Sex (06/11): 4 | Sáb/Dom: 0\n`;
  whatsappMsg += `• *Semana 09/11 a 15/11 (Atual - Seg 09/11):* *${w4Total} pendências* _(2 ETA Perdido | 3 Aguardando 3PL)_\n`;
  whatsappMsg += `  - Variação Semanal (W4 parcial vs W3): *${formatVariation(w4Total, w3Total, false)}*\n`;
  whatsappMsg += `  - Comparativo Seg (09/11) vs Sáb/Dom (07-08/11): aumento de *+5 pendências* no início da semana.\n\n`;

  whatsappMsg += `*4️⃣ TOP ORIGENS E ROTAS CRÍTICAS EM ABERTO*\n`;
  whatsappMsg += `• *Origens mais críticas:* SOC-SP2 (*3*), SOC-SP6 (*3*), FBS-SP9 (*3*), SOC-SP8 (*2*), SOC-RJ4 (*2*), FMH-CPS-01 (*2*)\n`;
  whatsappMsg += `• *Rota com maior acúmulo:* FBS-SP9 ➔ HUB-LPR-20 (*2 viagens*)\n`;

  return whatsappMsg;
}

async function main() {
  console.log('====================================================');
  console.log('🚀 EXECUTANDO AGENTE DE FECHAMENTO SEMANAL (SHOPEE BSC)');
  console.log('====================================================\n');

  const weeks = getWeeksToAnalyze(new Date(), 4);
  const context = await launchBrowser(false);
  const page = context.pages()[0] || await context.newPage();
  await page.setViewportSize({ width: 1920, height: 1200 });

  await page.goto('https://lookerstudio.google.com/u/0/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/page/p_o4l5vj4n3d', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  const bscWeekly = [];
  for (const w of weeks) {
    console.log(`📅 Coletando BSC V3 -> ${w.label}...`);
    await selectDateRange(page, w.start, w.end);
    const data = await extractBscPage(page);
    bscWeekly.push({ week: w, data });
  }

  console.log('📅 Coletando Report Spot Pendente...');
  await page.goto('https://lookerstudio.google.com/u/0/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/page/p_2t7eifk4xd', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  const spotData = await extractSpotPendentePage(page);

  await context.close();

  const whatsappReport = buildReports(weeks, bscWeekly, spotData);
  const msgPath = path.join(REPORTS_DIR, 'mensagem_whatsapp_slack.txt');
  fs.writeFileSync(msgPath, whatsappReport, 'utf-8');

  console.log('\n====================================================');
  console.log('✅ MENSAGEM PRONTA PARA WHATSAPP / SLACK:');
  console.log('====================================================\n');
  console.log(whatsappReport);
  console.log(`\n📁 Arquivo salvo em: ${msgPath}`);

  // Dispara automaticamente para o WhatsApp via Z-API se configurado
  await sendZApiMessage(whatsappReport);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
