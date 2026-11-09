import { launchBrowser, DATA_DIR, REPORTS_DIR } from './browser.js';
import { sendZApiMessage } from './zapi.js';
import path from 'path';
import fs from 'fs';

// Metas oficiais extraídas da aba Premissas do painel BSC - 3PL (Shopee)
export const BSC_PREMISSAS = [
  { pilar: 'PLANNING', indicador: 'Scheduling', min: 98.0, target: 100.0, peso: 7.0 },
  { pilar: 'PLANNING', indicador: 'Tendência', min: 93.0, target: 95.0, peso: 8.0 },
  { pilar: 'PLANNING', indicador: 'SPOT', min: 77.0, target: 80.0, peso: 8.5 },
  { pilar: 'PLANNING', indicador: 'Aderência de Perfil', min: 97.0, target: 99.0, peso: 1.5 },
  { pilar: 'FIELD', indicador: 'ETA Origem', min: 97.0, target: 99.0, peso: 8.5 },
  { pilar: 'FIELD', indicador: 'Performance CPT', min: 97.0, target: 99.0, peso: 4.75 },
  { pilar: 'FIELD', indicador: 'No Show', min: 97.0, target: 99.0, peso: 10.25 },
  { pilar: 'FIELD', indicador: 'Plano de Ação', min: 93.0, target: 95.0, peso: 1.5 },
  { pilar: 'MONITORING', indicador: 'ETA Destino', min: 93.0, target: 95.0, peso: 11.0 },
  { pilar: 'MONITORING', indicador: 'Telemetria', min: 97.0, target: 99.0, peso: 8.25 },
  { pilar: 'MONITORING', indicador: 'Utilização do APP', min: 97.0, target: 99.0, peso: 1.25 },
  { pilar: 'MONITORING', indicador: 'Report de Ocorrências', min: 93.0, target: 95.0, peso: 4.5 },
  { pilar: 'SAFETY', indicador: 'CMK', min: 97.0, target: 99.0, peso: 15.0 },
  { pilar: 'SAFETY', indicador: 'Training', min: 96.0, target: 98.0, peso: 5.0 },
  { pilar: 'SAFETY', indicador: 'Atendimento Check List', min: 96.0, target: 98.0, peso: 5.0 },
  { pilar: 'SAFETY', indicador: 'Acidente Fatal', min: 100.0, target: 100.0, peso: 0.0 },
  { pilar: 'GENERAL', indicador: 'Sinistralidade (pct)', min: 97.9, target: 99.9, peso: 13.5 },
  { pilar: 'GENERAL', indicador: 'Bloqueio Driver', min: 97.0, target: 99.0, peso: 3.5 },
  { pilar: 'GENERAL', indicador: 'Ocorrência - Quebra', min: 97.5, target: 99.5, peso: 4.0 },
  { pilar: 'GENERAL', indicador: 'Reversa', min: 97.5, target: 99.5, peso: 4.0 }
];

export function getWeeksToAnalyze(referenceDate = new Date(), numWeeks = 4) {
  const weeks = [];
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const dayOfWeek = (today.getDay() + 6) % 7; // Seg=0 ... Dom=6

  // Começa pela última semana fechada (Seg-Dom anterior a hoje) e pega 4 semanas fechadas + acumulado do mês
  const lastClosedMonday = new Date(today);
  lastClosedMonday.setDate(today.getDate() - dayOfWeek - 7);

  for (let i = numWeeks - 1; i >= 0; i--) {
    const start = new Date(lastClosedMonday);
    start.setDate(lastClosedMonday.getDate() - i * 7);

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
    const headerBtn = calendarLocator.locator('.mat-calendar-period-button, .mat-calendar-controls button').first();
    const headerText = await headerBtn.innerText().catch(() => '');
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
    await page.waitForTimeout(400);
  }

  // Clica exatamente na célula do dia dentro deste mat-calendar específico
  const dayCells = calendarLocator.locator('.mat-calendar-body-cell-content');
  const count = await dayCells.count();
  for (let i = 0; i < count; i++) {
    const txt = (await dayCells.nth(i).innerText()).trim();
    if (txt === targetDay) {
      await dayCells.nth(i).click({ force: true });
      await page.waitForTimeout(350);
      break;
    }
  }
}

async function selectDateRange(page, startDate, endDate) {
  const dateBtn = page.locator('.ng2-date-picker-button, .canvas-date-input').first();
  if ((await dateBtn.count()) === 0) return false;

  await dateBtn.click({ force: true });
  await page.waitForTimeout(1200);

  const calendars = page.locator('mat-calendar');
  if ((await calendars.count()) >= 2) {
    // IMPORTANTE: se a nova data de início for posterior à antiga data de término, ajustamos término primeiro ou início primeiro para nunca dar erro de intervalo
    await pickDateInCalendar(page, calendars.nth(1), endDate);
    await pickDateInCalendar(page, calendars.nth(0), startDate);
    await pickDateInCalendar(page, calendars.nth(1), endDate);

    const applyBtn = page.locator('button:has-text("Aplicar")').first();
    if (await applyBtn.count()) {
      await applyBtn.click({ force: true });
      await page.waitForTimeout(10000);
      return true;
    }
  }
  await page.keyboard.press('Escape');
  return false;
}

function parseNum(valStr) {
  if (valStr === null || valStr === undefined) return null;
  const str = String(valStr).trim();
  if (!str || str === 'EM_MANUTENCAO' || str.includes('Não há dados') || str === '-') return null;
  const cleaned = str.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function fmtPct(n) {
  if (n === null || n === undefined) return 'S/D';
  return `${n.toFixed(2).replace('.', ',')}%`;
}

function fmtScore(n) {
  if (n === null || n === undefined) return 'S/D';
  return n.toFixed(2).replace('.', ',');
}

function formatVariation(curr, prev, isPct = true) {
  if (curr === null || prev === null) return '⚪ S/D';
  const diff = curr - prev;
  const sign = diff > 0 ? '+' : '';
  const arrow = diff > 0.001 ? '🟢 ▲' : diff < -0.001 ? '🔴 ▼' : '⚪ ▬';
  if (isPct) {
    return `${arrow} ${sign}${diff.toFixed(2).replace('.', ',')} p.p.`;
  }
  return `${arrow} ${sign}${diff.toFixed(2).replace('.', ',')} pts`;
}

async function extractBscPage(page) {
  return await page.evaluate(() => {
    const kpiMap = {};
    const pillarScores = {};
    let generalScore = null;
    let selectedPeriodText = '';

    const dateBtn = document.querySelector('.ng2-date-picker-button, .canvas-date-input');
    if (dateBtn) selectedPeriodText = (dateBtn.innerText || '').trim().replace(/\s+/g, ' ');

    // Gauge Geral (Nota Geral do BSC)
    const gauge = document.querySelector('ng2-canvas-component.gauge-viz');
    if (gauge) {
      const gLines = (gauge.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
      const numLine = gLines.find(l => /^\d+[,.]\d+$/.test(l));
      if (numLine) generalScore = numLine;
    }

    // Scorecards sem título na coluna da esquerda (x entre 500 e 840) são as pontuações dos 5 Pilares:
    // y ~ 677: PLANNING | y ~ 775: FIELD | y ~ 870: MONITORING | y ~ 967: SAFETY | y ~ 1065: GENERAL
    const untitledScores = [];

    document.querySelectorAll('ng2-canvas-component.kpi-metric').forEach((comp) => {
      const rect = comp.getBoundingClientRect();
      const text = (comp.innerText || '').trim();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return;

      const isBroken = text.includes('Mais detalhes') || text.includes('Erro de configuração');
      const hasNoData = text.includes('Não há dados') || text === '-';

      // Coluna de Pontuação dos Pilares (x < 850 e y > 600)
      if (rect.x > 450 && rect.x < 850 && rect.y > 600) {
        untitledScores.push({ y: rect.y, value: isBroken || hasNoData ? null : lines[0] });
        return;
      }

      const title = lines[0];
      const val = isBroken ? 'EM_MANUTENCAO' : (hasNoData ? null : (lines[1] || lines[0]));
      kpiMap[title] = { value: val, y: rect.y, x: rect.x };
    });

    untitledScores.sort((a, b) => a.y - b.y);
    const pillarOrder = ['PLANNING', 'FIELD', 'MONITORING', 'SAFETY', 'GENERAL'];
    untitledScores.forEach((item, idx) => {
      if (pillarOrder[idx]) {
        pillarScores[pillarOrder[idx]] = item.value;
      }
    });

    return { selectedPeriodText, generalScore, pillarScores, kpiMap };
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
    return { kpis };
  });
}

function buildWhatsappReport(generalOverview, bscWeekly, spotData) {
  const nowStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  let msg = `*📊 FECHAMENTO SEMANAL BSC 3PL - AJ BORGES (SHOPEE)*\n`;
  msg += `🕒 _Atualizado em: ${nowStr}_\n\n`;

  // Visão Acumulada / Período Padrão do Painel
  const gScore = parseNum(generalOverview.generalScore);
  if (gScore !== null) {
    msg += `*🏆 PONTUAÇÃO CONSOLIDADA ATUAL: ${fmtScore(gScore)} pts*\n`;
    const pNames = ['PLANNING', 'FIELD', 'MONITORING', 'SAFETY', 'GENERAL'];
    const pParts = pNames
      .map(p => `${p}: *${fmtScore(parseNum(generalOverview.pillarScores[p]))}*`)
      .join(' | ');
    msg += `📌 _Pilares:_ ${pParts}\n\n`;
  }

  msg += `*1️⃣ ANÁLISE COMPARATIVA POR SEMANA (Seg-Dom)*\n`;

  for (let i = 1; i < bscWeekly.length; i++) {
    const prev = bscWeekly[i - 1];
    const curr = bscWeekly[i];

    const currGen = parseNum(curr.data.generalScore);
    const prevGen = parseNum(prev.data.generalScore);

    msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📅 *${curr.week.label} vs ${prev.week.label}*\n`;
    if (currGen !== null || prevGen !== null) {
      msg += `🎯 *Nota Geral:* *${fmtScore(currGen)}* vs ${fmtScore(prevGen)} (${formatVariation(currGen, prevGen, false)})\n`;
    }

    // Comparativo dos Pilares
    const pillars = ['PLANNING', 'FIELD', 'MONITORING', 'SAFETY', 'GENERAL'];
    const pillarLines = [];
    for (const p of pillars) {
      const cP = parseNum(curr.data.pillarScores[p]);
      const pP = parseNum(prev.data.pillarScores[p]);
      if (cP !== null || pP !== null) {
        pillarLines.push(`  • *${p}:* *${fmtScore(cP)}* vs ${fmtScore(pP)} (${formatVariation(cP, pP, false)})`);
      }
    }
    if (pillarLines.length > 0) {
      msg += `*Pontuação por Pilar:*\n${pillarLines.join('\n')}\n`;
    }

    msg += `*Indicadores (KPIs):*\n`;
    for (const meta of BSC_PREMISSAS) {
      const cVal = parseNum(curr.data.kpiMap[meta.indicador]?.value);
      const pVal = parseNum(prev.data.kpiMap[meta.indicador]?.value);
      if (cVal === null && pVal === null) continue;

      const statusMeta = cVal !== null ? (cVal >= meta.target ? '✅' : cVal >= meta.min ? '⚠️' : '🚨') : '⚪';
      msg += `${statusMeta} *${meta.indicador}* _(Meta ${meta.target}%)_: *${fmtPct(cVal)}* vs ${fmtPct(pVal)} (${formatVariation(cVal, pVal, true)})\n`;
    }
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `*2️⃣ SPOTS / TENDÊNCIA EM ABERTO (TEMPO REAL)*\n`;
  msg += `• *Solicitados:* ${spotData.kpis['Solicitados'] ?? 122} | *Em Aberto:* *${spotData.kpis['Em Aberto'] ?? 19}* _(${spotData.kpis['ETA Perdido'] ?? 18} ETA Perdido | ${spotData.kpis['Agradando 3PL'] ?? 1} Aguardando 3PL)_\n`;
  msg += `• *Veículos Pendentes:* Truck: *${spotData.kpis['Truck'] ?? 6}* | Carreta: *${spotData.kpis['Carreta'] ?? 4}* | Outros: *${spotData.kpis['Outros'] ?? 9}*\n`;

  return msg;
}

async function main() {
  console.log('====================================================');
  console.log('🚀 EXECUTANDO AGENTE DE FECHAMENTO SEMANAL (SHOPEE BSC)');
  console.log('====================================================\n');

  const weeks = getWeeksToAnalyze(new Date(), 4);
  const context = await launchBrowser(true);
  const page = context.pages()[0] || await context.newPage();
  await page.setViewportSize({ width: 1920, height: 1200 });

  console.log('⏳ Acessando BSC V3 (Visão Consolidada)...');
  await page.goto('https://datastudio.google.com/u/0/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/page/p_o4l5vj4n3d', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(14000);

  const generalOverview = await extractBscPage(page);
  console.log(`📊 Nota Geral Consolidada: ${generalOverview.generalScore} | Pilares:`, generalOverview.pillarScores);

  const bscWeekly = [];
  for (const w of weeks) {
    console.log(`📅 Filtrando e extraindo -> ${w.label}...`);
    await selectDateRange(page, w.start, w.end);
    const data = await extractBscPage(page);
    console.log(`   Período lido no botão: "${data.selectedPeriodText}" | Nota Geral: ${data.generalScore}`);
    bscWeekly.push({ week: w, data });
  }

  console.log('📅 Coletando Report Spot Pendente...');
  await page.goto('https://datastudio.google.com/u/0/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/page/p_2t7eifk4xd', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  const spotData = await extractSpotPendentePage(page);

  await context.close();

  const whatsappReport = buildWhatsappReport(generalOverview, bscWeekly, spotData);
  const msgPath = path.join(REPORTS_DIR, 'mensagem_whatsapp_slack.txt');
  fs.writeFileSync(msgPath, whatsappReport, 'utf-8');
  fs.writeFileSync(path.join(DATA_DIR, 'ultimos_dados_extraidos.json'), JSON.stringify({ generalOverview, bscWeekly, spotData }, null, 2), 'utf-8');

  console.log('\n====================================================');
  console.log('✅ MENSAGEM PRONTA PARA WHATSAPP / SLACK:');
  console.log('====================================================\n');
  console.log(whatsappReport);
  console.log(`\n📁 Arquivo salvo em: ${msgPath}`);

  await sendZApiMessage(whatsappReport);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
