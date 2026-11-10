import { launchBrowser, ensureGoogleAuthenticated, PAGES, DATA_DIR, REPORTS_DIR } from './browser.js';
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

export function getPeriodsToAnalyze(referenceDate = new Date()) {
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmt = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  const monthToDate = {
    isSummary: true,
    label: `Acumulado ${fmt(firstOfMonth)} a ${fmt(today)}`,
    shortLabel: `${fmt(firstOfMonth)} a ${fmt(today)}`,
    start: firstOfMonth,
    end: today
  };

  const dayOfWeek = (today.getDay() + 6) % 7; // Seg=0 ... Dom=6
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - dayOfWeek);

  const weeks = [];
  for (let i = 3; i >= 0; i--) {
    const start = new Date(currentMonday);
    start.setDate(currentMonday.getDate() - i * 7);

    const end = new Date(start);
    if (i === 0) {
      end.setTime(today.getTime());
    } else {
      end.setDate(start.getDate() + 6);
    }

    weeks.push({
      weekNum: 4 - i,
      label: `Semana ${fmt(start)} a ${fmt(end)}`,
      shortLabel: `${fmt(start)} a ${fmt(end)}`,
      start,
      end
    });
  }

  return { monthToDate, weeks };
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
    await pickDateInCalendar(page, calendars.nth(1), endDate);
    await pickDateInCalendar(page, calendars.nth(0), startDate);
    await pickDateInCalendar(page, calendars.nth(1), endDate);

    const applyBtn = page.locator('button:has-text("Aplicar")').first();
    if (await applyBtn.count()) {
      await applyBtn.click({ force: true });
      await page.waitForTimeout(9000);
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

    const gauge = document.querySelector('ng2-canvas-component.gauge-viz');
    if (gauge) {
      const gLines = (gauge.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
      const numLine = gLines.find(l => /^\d+[,.]?\d*$/.test(l));
      if (numLine) generalScore = numLine;
    }

    const untitledScores = [];

    document.querySelectorAll('ng2-canvas-component.kpi-metric').forEach((comp) => {
      const rect = comp.getBoundingClientRect();
      const text = (comp.innerText || '').trim();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return;

      const isBroken = text.includes('Mais detalhes') || text.includes('Erro de configuração');
      const hasNoData = text.includes('Não há dados') || text === '-';

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

/**
 * Extrai todos os indicadores, scorecards, gráficos e tabelas de uma subpágina específica
 * (ETA Origem p_imo7o7l02d, ETA Destino p_rfbd66mqzd, Telemetria p_eoy8m7p46d)
 */
async function extractSubPageDetails(page, url, pageTitle, startDate, endDate) {
  console.log(`🔎 Acessando página "${pageTitle}" (${url})...`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10000);

  if (startDate && endDate) {
    await selectDateRange(page, startDate, endDate);
  }

  return await page.evaluate((title) => {
    const clean = (s) => (s || '').trim().replace(/\s+/g, ' ');
    const cards = [];
    const tables = [];
    const charts = [];

    document.querySelectorAll('ng2-canvas-component').forEach((comp) => {
      const text = (comp.innerText || '').trim();
      if (!text || text.includes('Mais detalhes') || text.includes('Erro de configuração')) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return;

      if (comp.className.includes('kpi-metric') || comp.querySelector('scorecard, .scorecard')) {
        cards.push({
          label: lines[0],
          value: lines[1] || lines[0],
          extra: lines.slice(2).join(' | ')
        });
      } else if (comp.className.includes('table') || comp.querySelector('[role="grid"], [role="table"]')) {
        tables.push(lines.slice(0, 30));
      } else if (comp.className.includes('chart') || comp.className.includes('gauge')) {
        charts.push(lines.slice(0, 20));
      }
    });

    return { pageTitle: title, cards, tables, charts, rawText: document.body.innerText };
  }, pageTitle);
}

function formatSubPageSection(subPageData, emoji, title) {
  let section = `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  section += `*${emoji} DETALHAMENTO: ${title}*\n`;

  if (!subPageData || (subPageData.cards.length === 0 && subPageData.tables.length === 0 && subPageData.charts.length === 0)) {
    section += `_Sem dados detalhados disponíveis para o período selecionado._\n`;
    return section;
  }

  if (subPageData.cards.length > 0) {
    for (const c of subPageData.cards) {
      if (c.label === c.value) {
        section += `• *Indicador:* *${c.value}*\n`;
      } else {
        section += `• *${c.label}:* *${c.value}*${c.extra ? ` _(${c.extra})_` : ''}\n`;
      }
    }
  }

  if (subPageData.charts.length > 0) {
    for (const ch of subPageData.charts.slice(0, 3)) {
      const summary = ch.join(' | ');
      if (summary.length > 5) {
        section += `📈 _Gráfico:_ ${summary.slice(0, 180)}\n`;
      }
    }
  }

  if (subPageData.tables.length > 0) {
    for (const tb of subPageData.tables.slice(0, 2)) {
      section += `📋 _Resumo Tabela:_ ${tb.slice(0, 12).join(' | ')}\n`;
    }
  }

  return section;
}

function buildWhatsappReport(mtdResult, bscWeekly, subPages) {
  const nowStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  let msg = `*📊 FECHAMENTO SEMANAL BSC 3PL - AJ BORGES (SHOPEE)*\n`;
  msg += `🕒 _Extraído em: ${nowStr}_\n\n`;

  // 1. RESUMO DO PERÍODO SOLICITADO (ex: 01/11 a 10/11)
  msg += `*1️⃣ PÁGINA PRINCIPAL (BSC V3) — ACUMULADO (${mtdResult.period.shortLabel})*\n`;
  const mtdGen = parseNum(mtdResult.data.generalScore);
  if (mtdGen !== null) {
    msg += `🎯 *Nota Geral:* *${fmtScore(mtdGen)} pts*\n`;
  }
  const pillars = ['PLANNING', 'FIELD', 'MONITORING', 'SAFETY', 'GENERAL'];
  const mtdPillars = pillars
    .map(p => {
      const v = parseNum(mtdResult.data.pillarScores[p]);
      return v !== null ? `• *${p}:* *${fmtScore(v)}*` : null;
    })
    .filter(Boolean);
  if (mtdPillars.length > 0) {
    msg += `*Pontuação por Pilar (${mtdResult.period.shortLabel}):*\n${mtdPillars.join(' | ')}\n`;
  }

  msg += `*Indicadores no período (${mtdResult.period.shortLabel}):*\n`;
  for (const meta of BSC_PREMISSAS) {
    const val = parseNum(mtdResult.data.kpiMap[meta.indicador]?.value);
    if (val !== null) {
      const icon = val >= meta.target ? '✅' : val >= meta.min ? '⚠️' : '🚨';
      msg += `${icon} *${meta.indicador}* _(Meta ${meta.target}%)_: *${fmtPct(val)}*\n`;
    }
  }

  // 2. COMPARATIVO SEMANA A SEMANA
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `*2️⃣ COMPARATIVO SEMANAL — PÁGINA PRINCIPAL (Seg-Dom)*\n`;

  for (let i = 1; i < bscWeekly.length; i++) {
    const prev = bscWeekly[i - 1];
    const curr = bscWeekly[i];

    const currGen = parseNum(curr.data.generalScore);
    const prevGen = parseNum(prev.data.generalScore);

    msg += `\n📅 *${curr.week.label} vs ${prev.week.label}*\n`;
    if (currGen !== null || prevGen !== null) {
      msg += `🎯 *Nota Geral:* *${fmtScore(currGen)}* vs ${fmtScore(prevGen)} (${formatVariation(currGen, prevGen, false)})\n`;
    }

    const pillarLines = [];
    for (const p of pillars) {
      const cP = parseNum(curr.data.pillarScores[p]);
      const pP = parseNum(prev.data.pillarScores[p]);
      if (cP !== null || pP !== null) {
        pillarLines.push(`  • *${p}:* *${fmtScore(cP)}* vs ${fmtScore(pP)} (${formatVariation(cP, pP, false)})`);
      }
    }
    if (pillarLines.length > 0) {
      msg += `*Pilares:*\n${pillarLines.join('\n')}\n`;
    }

    for (const meta of BSC_PREMISSAS) {
      const cVal = parseNum(curr.data.kpiMap[meta.indicador]?.value);
      const pVal = parseNum(prev.data.kpiMap[meta.indicador]?.value);
      if (cVal === null && pVal === null) continue;

      const statusMeta = cVal !== null ? (cVal >= meta.target ? '✅' : cVal >= meta.min ? '⚠️' : '🚨') : '⚪';
      msg += `${statusMeta} *${meta.indicador}*: *${fmtPct(cVal)}* vs ${fmtPct(pVal)} (${formatVariation(cVal, pVal, true)})\n`;
    }
  }

  // 3. AS 3 PÁGINAS DE DETALHAMENTO SOLICITADAS
  msg += formatSubPageSection(subPages.etaOrigem, '3️⃣ 🚚', 'ETA ORIGEM (p_imo7o7l02d)');
  msg += formatSubPageSection(subPages.etaDestino, '4️⃣ 📍', 'ETA DESTINO (p_rfbd66mqzd)');
  msg += formatSubPageSection(subPages.telemetria, '5️⃣ 📡', 'TELEMETRIA (p_eoy8m7p46d)');

  return msg;
}

async function main() {
  console.log('====================================================');
  console.log('🚀 EXECUTANDO AGENTE DE FECHAMENTO SEMANAL (4 PÁGINAS)');
  console.log('====================================================\n');

  const { monthToDate, weeks } = getPeriodsToAnalyze(new Date());
  const context = await launchBrowser(true);
  const page = context.pages()[0] || await context.newPage();
  await page.setViewportSize({ width: 1920, height: 1200 });

  // Garante que está logado na conta Google (usando sessão ou GOOGLE_EMAIL + GOOGLE_PASSWORD)
  await ensureGoogleAuthenticated(page, context);

  // 1. Extrai o resumo de 01/11 a 10/11 na página Principal (p_o4l5vj4n3d)
  console.log(`📅 [Principal] Filtrando -> ${monthToDate.label}...`);
  await selectDateRange(page, monthToDate.start, monthToDate.end);
  const mtdData = await extractBscPage(page);
  console.log(`   Período lido: "${mtdData.selectedPeriodText}" | Nota Geral: ${mtdData.generalScore}`);

  // 2. Extrai cada semana para o comparativo semanal na página Principal
  const bscWeekly = [];
  for (const w of weeks) {
    console.log(`📅 [Principal] Filtrando -> ${w.label}...`);
    await selectDateRange(page, w.start, w.end);
    const data = await extractBscPage(page);
    console.log(`   Período lido: "${data.selectedPeriodText}" | Nota Geral: ${data.generalScore}`);
    bscWeekly.push({ week: w, data });
  }

  // 3. Extrai as 3 páginas adicionais solicitadas (ETA Origem, ETA Destino e Telemetria) no período acumulado
  const etaOrigem = await extractSubPageDetails(page, PAGES.etaOrigem, 'ETA Origem', monthToDate.start, monthToDate.end);
  const etaDestino = await extractSubPageDetails(page, PAGES.etaDestino, 'ETA Destino', monthToDate.start, monthToDate.end);
  const telemetria = await extractSubPageDetails(page, PAGES.telemetria, 'Telemetria', monthToDate.start, monthToDate.end);

  await context.close();

  const subPages = { etaOrigem, etaDestino, telemetria };
  const whatsappReport = buildWhatsappReport({ period: monthToDate, data: mtdData }, bscWeekly, subPages);
  const msgPath = path.join(REPORTS_DIR, 'mensagem_whatsapp_slack.txt');
  fs.writeFileSync(msgPath, whatsappReport, 'utf-8');
  fs.writeFileSync(path.join(DATA_DIR, 'ultimos_dados_extraidos.json'), JSON.stringify({ monthToDate: mtdData, bscWeekly, subPages }, null, 2), 'utf-8');

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
