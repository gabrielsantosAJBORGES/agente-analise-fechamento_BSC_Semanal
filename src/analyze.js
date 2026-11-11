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
  const fmt = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  // A análise semanal é SEMPRE estritamente de Segunda a Domingo.
  // Quando roda na quarta-feira (ou hoje), a última semana completa fechada terminou no domingo anterior.
  const dayOfWeek = today.getDay(); // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sab
  const daysSinceLastSunday = dayOfWeek === 0 ? 7 : dayOfWeek;
  const lastClosedSunday = new Date(today);
  lastClosedSunday.setDate(today.getDate() - daysSinceLastSunday);

  const weeks = [];
  // Gera as 4 semanas fechadas consecutivas (todas de Segunda a Domingo):
  for (let i = 3; i >= 0; i--) {
    const end = new Date(lastClosedSunday);
    end.setDate(lastClosedSunday.getDate() - i * 7);

    const start = new Date(end);
    start.setDate(end.getDate() - 6);

    weeks.push({
      weekNum: 4 - i,
      label: `Semana ${fmt(start)} a ${fmt(end)}`,
      shortLabel: `${fmt(start)} a ${fmt(end)}`,
      start,
      end
    });
  }

  // A semana foco para análise detalhada e raio-x é a última semana completa fechada
  const targetClosedWeek = weeks[weeks.length - 1];

  return { targetClosedWeek, weeks };
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

export async function selectDateRange(page, startDate, endDate) {
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

export async function extractBscPage(page) {
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
      if (rect.x > 1950 || rect.x < 0) return; // Ignora rascunhos fora do canvas (ex: x=2111)
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
export async function extractSubPageDetails(page, url, pageTitle, startDate, endDate) {
  console.log(`🔎 Acessando página "${pageTitle}" (${url})...`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const t = document.body?.innerText || '';
    return t.includes('AJ BORGES') || /\d+[,.]\d+%/.test(t);
  }, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(5000);

  if (startDate && endDate) {
    await selectDateRange(page, startDate, endDate);
    await page.waitForTimeout(4000);
  }

  return await page.evaluate((title) => {
    const cards = [];
    const tables = [];
    const charts = [];

    document.querySelectorAll('ng2-canvas-component').forEach((comp) => {
      const rect = comp.getBoundingClientRect();
      if (rect.x > 1950 || rect.x < 0) return;
      const text = (comp.innerText || '').trim();
      if (!text || text.includes('Mais detalhes') || text.includes('Erro de configuração')) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return;

      if (comp.className.includes('kpi-metric') || comp.querySelector('scorecard, .scorecard')) {
        cards.push({
          x: rect.x,
          y: rect.y,
          label: lines[0],
          value: lines[1] || lines[0],
          extra: lines.slice(2).join(' | ')
        });
      } else if (comp.className.includes('table') || comp.querySelector('[role="grid"], [role="table"]')) {
        tables.push(lines.slice(0, 80));
      } else if (comp.className.includes('chart') || comp.className.includes('gauge')) {
        charts.push(lines.slice(0, 40));
      }
    });

    cards.sort((a, b) => a.x - b.x);
    return { pageTitle: title, cards, tables, charts, rawText: document.body.innerText };
  }, pageTitle);
}

function formatSubPageSection(subPageData, emoji, title) {
  let section = `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  section += `*${emoji} DETALHAMENTO: ${title}*\n`;

  if (!subPageData) {
    section += `_Sem dados detalhados disponíveis._\n`;
    return section;
  }

  const rawLines = (subPageData.rawText || '').split('\n').map(s => s.trim()).filter(Boolean);

  // Tratamento executivo para ETA ORIGEM (p_imo7o7l02d)
  const idxAj = rawLines.indexOf('AJ BORGES');
  if (title.includes('ETA ORIGEM') && idxAj !== -1 && rawLines.includes('PF Gross')) {
    const viagens = rawLines[idxAj + 1] || '-';
    const viagensDelay = rawLines[idxAj + 2] || '-';
    const pacotes = rawLines[idxAj + 3] || '-';
    const pacotesDelay = rawLines[idxAj + 4] || '-';
    const pfGross = rawLines[idxAj + 5] || '-';
    const pfNet = rawLines[idxAj + 6] || '-';
    const delayTotal = rawLines[idxAj + 7] || '-';
    const delaySpx = rawLines[idxAj + 8] || '-';
    const delay3pl = rawLines[idxAj + 9] || '-';
    const atrasoMedio = rawLines[idxAj + 10] || '-';

    section += `• *Viagens Totais:* *${viagens}* _(${viagensDelay} com Delay)_\n`;
    section += `• *Pacotes Transportados:* *${pacotes}* _(${pacotesDelay} com Delay)_\n`;
    section += `• *PF Gross:* *${pfGross}* | *PF Net:* *${pfNet}*\n`;
    section += `• *Delay Total:* *${delayTotal}* _(SPX: ${delaySpx} | 3PL: ${delay3pl})_\n`;
    section += `• *Atraso Médio:* *${atrasoMedio}*\n`;

    const occTable = subPageData.tables.find(t => t[0] === 'Responsabilidade' && t[1] === 'Ocorrência');
    if (occTable) {
      section += `\n⚠️ *Motivos de Delay na Origem:*\n`;
      let i = 7;
      while (i + 6 < occTable.length) {
        if (occTable[i] === 'Total geral') break;
        section += `  • *[${occTable[i]}] ${occTable[i + 1]}:* ${occTable[i + 4]} viagem(ns) / ${occTable[i + 2]} pcts _(Atraso: ${occTable[i + 6]})_\n`;
        i += 7;
      }
    }
    return section;
  }

  // Tratamento executivo para ETA DESTINO (p_rfbd66mqzd)
  const destSumTable = subPageData.tables.find(t => t.includes('PF Gross New') && t.includes('AJ BORGES'));
  if (title.includes('ETA DESTINO') && destSumTable) {
    const ajIdx = destSumTable.indexOf('AJ BORGES');
    const viagens = destSumTable[ajIdx + 1] || '-';
    const pacotes = destSumTable[ajIdx + 2] || '-';
    const pacotesDelay = destSumTable[ajIdx + 3] || '-';
    const pfGrossNew = destSumTable[ajIdx + 4] || '-';
    const pfNetNew = destSumTable[ajIdx + 5] || '-';
    const pfGrossOld = destSumTable[ajIdx + 6] || '-';
    const pfNetOld = destSumTable[ajIdx + 7] || '-';
    const earlyTotal = destSumTable[ajIdx + 8] || '-';
    const earlySpx = destSumTable[ajIdx + 9] || '-';
    const early3pl = destSumTable[ajIdx + 10] || '-';
    const onTime = destSumTable[ajIdx + 11] || '-';
    const delayPct = destSumTable[ajIdx + 12] || '-';
    const delaySpx = destSumTable[ajIdx + 13] || '-';
    const delay3pl = destSumTable[ajIdx + 14] || '-';
    const viagensDelayTotal = destSumTable[ajIdx + 15] || '-';
    const viagensDelay3pl = destSumTable[ajIdx + 16] || '-';
    const mediaEarly = destSumTable[ajIdx + 17] || '-';
    const mediaDelay = destSumTable[ajIdx + 18] || '-';

    section += `• *Viagens Totais:* *${viagens}* _(${viagensDelayTotal} em Delay total | ${viagensDelay3pl} Delay 3PL)_\n`;
    section += `• *Pacotes Transportados:* *${pacotes}* _(${pacotesDelay} em Delay)_\n`;
    section += `• *PF Net (Novo / Antigo):* *${pfNetNew}* / *${pfNetOld}*\n`;
    section += `• *PF Gross (Novo / Antigo):* *${pfGrossNew}* / *${pfGrossOld}*\n`;
    section += `• *On Time:* *${onTime}* | *Early:* *${earlyTotal}* _(SPX: ${earlySpx} | 3PL: ${early3pl})_\n`;
    section += `• *Delay (%):* *${delayPct}* _(SPX: ${delaySpx} | 3PL: ${delay3pl})_\n`;
    section += `• *Tempo Médio:* Antecipação *${mediaEarly}* | Atraso *${mediaDelay}*\n`;

    const occDelayTable = subPageData.tables.find(t => t[0] === 'Responsabilidade' && t[1] === 'Ocorrência' && t[6] === 'Atraso');
    if (occDelayTable) {
      section += `\n🚨 *Principais Causas de Delay no Destino:*\n`;
      let i = 7;
      let count = 0;
      while (i + 6 < occDelayTable.length && count < 6) {
        const resp = occDelayTable[i];
        if (resp === 'Total geral') break;
        const ocorr = occDelayTable[i + 1];
        const pcts = occDelayTable[i + 2];
        const pctPcts = occDelayTable[i + 3];
        const vgs = occDelayTable[i + 4];
        const atr = occDelayTable[i + 6];
        section += `  • *[${resp}] ${ocorr}:* ${vgs} viagens / ${pcts} pcts _(${pctPcts} | Atraso: ${atr})_\n`;
        i += 7;
        count++;
      }
    }

    const operTable = subPageData.tables.find(t => t[0] === 'Operação' && t.includes('PF Net New'));
    if (operTable) {
      section += `\n📦 *Performance por Tipo de Operação (PF Net New):*\n`;
      let i = 7;
      while (i + 6 < operTable.length) {
        const op = operTable[i];
        const pcts = operTable[i + 1];
        const pctsDelay = operTable[i + 2];
        const pfNet = operTable[i + 4];
        section += `  • *${op}:* *${pfNet}* _(${pcts} pcts | ${pctsDelay} delay)_\n`;
        i += 7;
      }
    }

    return section;
  }

  // Tratamento executivo para TELEMETRIA
  if (title.includes('TELEMETRIA')) {
    if (subPageData.cards.length >= 3) {
      section += `• *KPI Geral Telemetria:* *${subPageData.cards[0].value}*\n`;
      section += `• *Espelhamento Antes do ETA:* *${subPageData.cards[1].value}*\n`;
      section += `• *Tempo Espelhado:* *${subPageData.cards[2].value}*\n`;
    }

    // KPI por Perfil (TRUCK vs CARRETA)
    const perfilChart = subPageData.charts.find(c => c.includes('TRUCK') && c.includes('CARRETA'));
    if (perfilChart) {
      const pcts = perfilChart.filter(x => /^\d+[,.]\d+%$/.test(x));
      if (pcts.length >= 2) {
        section += `• *KPI por Perfil:* 🚛 *Truck:* *${pcts[0]}* | 🚚 *Carreta:* *${pcts[1]}*\n`;
      }
    }

    // Total Geral e Top Ofensores por Placa
    const placaTable = subPageData.tables.find(t => t[0] === 'Placa' && t.includes('Viagens'));
    if (placaTable) {
      const totIdx = rawLines.indexOf('Total geral');
      if (totIdx !== -1) {
        const totViagens = rawLines[totIdx + 1] || '-';
        const totNok = rawLines[totIdx + 2] || '-';
        const naoEsp = rawLines[totIdx + 4] || '-';
        const tempoInsuf = rawLines[totIdx + 5] || '-';
        section += `• *Resumo de Viagens:* *${totViagens}* viagens | *${totNok} NOK* _(${naoEsp} Não Esp. Antes do ETA | ${tempoInsuf} Tempo Insuficiente)_\n`;
      }

      section += `\n🚨 *Top Ofensores por Placa:*\n`;
      // Cada linha tem 7 colunas após o cabeçalho de 7 itens
      let startIdx = 7;
      let count = 0;
      while (startIdx + 6 < placaTable.length && count < 5) {
        const placa = placaTable[startIdx];
        if (placa === 'Total geral') break;
        const vTotal = placaTable[startIdx + 1];
        const vNok = placaTable[startIdx + 2];
        const imp = placaTable[startIdx + 3];
        const mediaEsp = placaTable[startIdx + 6];
        section += `  • *${placa}:* ${vNok}/${vTotal} NOK _(Impacto: ${imp} | Média Esp.: ${mediaEsp})_\n`;
        startIdx += 7;
        count++;
      }
    }

    // Top Ofensores por Rota
    const rotaTable = subPageData.tables.find(t => t[0] === 'Origem' && t[1] === 'Destino');
    if (rotaTable) {
      section += `\n🛣️ *Top Ofensores por Rota:*\n`;
      let startIdx = 5;
      let count = 0;
      while (startIdx + 4 < rotaTable.length && count < 5) {
        const orig = rotaTable[startIdx];
        if (orig === 'Total geral') break;
        const dest = rotaTable[startIdx + 1];
        const vTotal = rotaTable[startIdx + 2];
        const vNok = rotaTable[startIdx + 3];
        const imp = rotaTable[startIdx + 4];
        section += `  • *${orig} ➔ ${dest}:* ${vNok}/${vTotal} NOK _(Impacto: ${imp})_\n`;
        startIdx += 5;
        count++;
      }
    }

    // Mapeamento de Erros
    const erroTable = subPageData.tables.find(t => t[0] === 'Erro' && t.includes('Viagens'));
    if (erroTable) {
      section += `\n⚠️ *Mapeamento de Erros:*\n`;
      let startIdx = erroTable.indexOf('▼') !== -1 ? erroTable.indexOf('▼') + 1 : 3;
      while (startIdx + 2 < erroTable.length) {
        const errName = erroTable[startIdx];
        const qtd = erroTable[startIdx + 1];
        const pct = erroTable[startIdx + 2];
        section += `  • *${errName}:* ${qtd} viagens _(${pct})_\n`;
        startIdx += 3;
      }
    }

    return section;
  }

  // Fallback genérico para subpáginas (ex: ETA Destino)
  if (subPageData.cards.length > 0) {
    for (const c of subPageData.cards) {
      if (c.label === c.value) {
        section += `• *Indicador:* *${c.value}*\n`;
      } else {
        section += `• *${c.label}:* *${c.value}*${c.extra ? ` _(${c.extra})_` : ''}\n`;
      }
    }
  }

  if (subPageData.tables.length > 0) {
    for (const tb of subPageData.tables.slice(0, 2)) {
      section += `📋 _Tabela:_ ${tb.slice(0, 18).join(' | ')}\n`;
    }
  } else if (subPageData.charts.length > 0) {
    for (const ch of subPageData.charts.slice(0, 2)) {
      section += `📈 _Gráfico:_ ${ch.slice(0, 15).join(' | ')}\n`;
    }
  } else {
    section += `_Consulte o indicador consolidado na Página Principal acima._\n`;
  }

  return section;
}

function pillarStatusIcon(score) {
  if (score === null || score === undefined) return '⚪';
  if (score >= 90) return '🟢';
  if (score >= 75) return '🟡';
  return '🔴';
}

function zonaLabel(score) {
  if (score === null) return '';
  if (score > 99) return '🏆 Zona de Referência';
  if (score > 90) return '🟢 Zona de Estabilidade';
  if (score > 80) return '🟡 Zona de Evolução';
  if (score > 70) return '🟠 Zona de Atenção';
  return '🔴 Zona Crítica';
}

function formatCleanSubPages(subPages, weekLabel = 'SEMANA FECHADA') {
  let out = `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  out += `*4️⃣ 🔍 RAIO-X OPERACIONAL (${weekLabel.toUpperCase()})*\n`;

  // 1. ETA ORIGEM
  const orig = subPages.etaOrigem;
  if (orig && orig.rawText) {
    const lines = orig.rawText.split('\n').map(s => s.trim()).filter(Boolean);
    const idxAj = lines.indexOf('AJ BORGES');
    if (idxAj !== -1 && lines.includes('PF Gross')) {
      const viagens = lines[idxAj + 1] || '-';
      const vDelay = lines[idxAj + 2] || '0';
      const pfNet = lines[idxAj + 6] || '-';
      const atraso = lines[idxAj + 10] || '-';
      out += `\n🚚 *ETA ORIGEM — Nota: ${pfNet}*\n`;
      out += `   • *Volume:* ${viagens} viagens | *Atrasos:* ${vDelay} viagem (${atraso})\n`;
      const occTable = orig.tables.find(t => t[0] === 'Responsabilidade' && t[1] === 'Ocorrência');
      if (occTable && occTable.length > 8) {
        out += `   • *Motivo:* ${occTable[8]} (${occTable[9]} pcts)\n`;
      }
    }
  }

  // 2. ETA DESTINO
  const dest = subPages.etaDestino;
  if (dest) {
    const sumTb = dest.tables.find(t => t.includes('PF Gross New') && t.includes('AJ BORGES'));
    if (sumTb) {
      const aj = sumTb.indexOf('AJ BORGES');
      const viagens = sumTb[aj + 1] || '-';
      const pfNetNew = sumTb[aj + 5] || '-';
      const pfNetOld = sumTb[aj + 7] || '-';
      const vDelayTotal = sumTb[aj + 15] || '-';
      const vDelay3pl = sumTb[aj + 16] || '-';
      const mediaDelay = sumTb[aj + 18] || '-';

      out += `\n📍 *ETA DESTINO — Nota: ${pfNetNew}* _(Modelo Antigo: ${pfNetOld})_\n`;
      out += `   • *Volume:* ${viagens} viagens | *Atrasos 3PL:* ${vDelay3pl} viagens _(Total c/ SPX: ${vDelayTotal} | Média: ${mediaDelay})_\n`;

      const occDelay = dest.tables.find(t => t[0] === 'Responsabilidade' && t[1] === 'Ocorrência' && t[6] === 'Atraso');
      if (occDelay) {
        out += `   • *Principais Causas de Atraso:*\n`;
        let i = 7;
        let c = 0;
        while (i + 6 < occDelay.length && c < 4) {
          if (occDelay[i] === 'Total geral') break;
          out += `      ${c + 1}. _${occDelay[i + 1]}:_ *${occDelay[i + 4]} viagens* (${occDelay[i + 2]} pcts)\n`;
          i += 7;
          c++;
        }
      }
    }
  }

  // 3. TELEMETRIA
  const tel = subPages.telemetria;
  if (tel) {
    const vals = tel.cards.map(c => c.value);
    const kpiGeral = vals.find(v => v === '94,65%') || tel.cards[0]?.value || '-';
    const espAntes = vals.find(v => v === '97,11%') || tel.cards[1]?.value || '-';
    const tempoEsp = tel.cards[2]?.value || '-';

    out += `\n📡 *TELEMETRIA — Nota: ${kpiGeral}*\n`;
    out += `   • *Antes do ETA:* ${espAntes} | *Tempo Espelhado:* ${tempoEsp}\n`;

    const perfilChart = tel.charts.find(c => c.includes('TRUCK') && c.includes('CARRETA'));
    if (perfilChart) {
      const pcts = perfilChart.filter(x => /^\d+[,.]\d+%$/.test(x));
      if (pcts.length >= 2) {
        out += `   • *Por Perfil:* 🚛 Truck *${pcts[0]}* | 🚚 Carreta *${pcts[1]}*\n`;
      }
    }

    const rawLines = (tel.rawText || '').split('\n').map(s => s.trim()).filter(Boolean);
    const totIdx = rawLines.indexOf('Total geral');
    if (totIdx !== -1) {
      out += `   • *Falhas:* *${rawLines[totIdx + 2]} viagens NOK* de ${rawLines[totIdx + 1]} _(${rawLines[totIdx + 4]} sem espelhar antes do ETA | ${rawLines[totIdx + 5]} tempo insuf.)_\n`;
    }

    const placaTable = tel.tables.find(t => t[0] === 'Placa' && t.includes('Viagens'));
    if (placaTable) {
      const placasList = [];
      let idx = 7;
      while (idx + 6 < placaTable.length && placasList.length < 4) {
        if (placaTable[idx] === 'Total geral') break;
        placasList.push(`*${placaTable[idx]}* (${placaTable[idx + 2]}/${placaTable[idx + 1]} falhas)`);
        idx += 7;
      }
      if (placasList.length > 0) {
        out += `   • *Placas Críticas:* ${placasList.join(', ')}\n`;
      }
    }

    const rotaTable = tel.tables.find(t => t[0] === 'Origem' && t[1] === 'Destino');
    if (rotaTable) {
      const rotasList = [];
      let idx = 5;
      while (idx + 4 < rotaTable.length && rotasList.length < 3) {
        if (rotaTable[idx] === 'Total geral') break;
        rotasList.push(`*${rotaTable[idx]}➔${rotaTable[idx + 1]}* (${rotaTable[idx + 3]} falhas)`);
        idx += 5;
      }
      if (rotasList.length > 0) {
        out += `   • *Rotas Críticas:* ${rotasList.join(', ')}\n`;
      }
    }
  }

  return out;
}

export function buildWhatsappReport(targetResult, bscWeekly, subPages) {
  const nowStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const weekGen = parseNum(targetResult.data.generalScore);
  const weekShort = targetResult.week.shortLabel;

  let msg = `*📊 RESUMO EXECUTIVO SEMANAL BSC 3PL — AJ BORGES*\n`;
  msg += `🗓️ *Semana Fechada Analisada:* ${weekShort} _(Segunda a Domingo)_\n`;
  msg += `⏱️ _Atualizado em: ${nowStr}_\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;

  // BLOCO 1: NOTA GERAL E PILARES (DA SEMANA FECHADA)
  msg += `*1️⃣ 🎯 PONTUAÇÃO DA SEMANA (${weekShort})*\n`;
  msg += `🏆 *NOTA GERAL:* *${fmtScore(weekGen)} pts* _(${zonaLabel(weekGen)})_\n\n`;

  const pillarMeta = [
    { key: 'PLANNING', icon: '📋', name: 'Planning' },
    { key: 'FIELD',    icon: '🚚', name: 'Field' },
    { key: 'MONITORING', icon: '📡', name: 'Monitoring' },
    { key: 'SAFETY',   icon: '🛡️', name: 'Safety' },
    { key: 'GENERAL',  icon: '⚙️', name: 'General' }
  ];

  for (const p of pillarMeta) {
    const val = parseNum(targetResult.data.pillarScores[p.key]);
    msg += `${pillarStatusIcon(val)} *${p.name}:* *${fmtScore(val)} pts*\n`;
  }

  // BLOCO 2: APENAS OS OFENSORES FORA DA META DA SEMANA FECHADA
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `*2️⃣ 🚨 INDICADORES FORA DA META (${weekShort})*\n`;

  const offTarget = [];
  let onTargetCount = 0;

  for (const meta of BSC_PREMISSAS) {
    const val = parseNum(targetResult.data.kpiMap[meta.indicador]?.value);
    if (val === null) continue;
    if (val >= meta.target) {
      onTargetCount++;
    } else {
      const gap = (val - meta.target).toFixed(2).replace('.', ',');
      const icon = val >= meta.min ? '⚠️' : '🚨';
      offTarget.push({ icon, nome: meta.indicador, val: fmtPct(val), target: meta.target, gap });
    }
  }

  if (offTarget.length === 0) {
    msg += `✅ *Todos os ${onTargetCount} indicadores estão 100% dentro da meta!*\n`;
  } else {
    for (const item of offTarget) {
      msg += `${item.icon} *${item.nome}:* *${item.val}* _(Meta: ${item.target}% | Falta: ${item.gap} p.p.)_\n`;
    }
    msg += `\n✅ _Os demais *${onTargetCount} indicadores* estão dentro da meta (99%~100%)._\n`;
  }

  // BLOCO 3: EVOLUÇÃO SEMANA A SEMANA (SEGUNDA A DOMINGO)
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `*3️⃣ 📈 EVOLUÇÃO SEMANA A SEMANA (SEGUNDA A DOMINGO)*\n`;

  for (let i = 0; i < bscWeekly.length; i++) {
    const curr = bscWeekly[i];
    const currGen = parseNum(curr.data.generalScore);
    const prevGen = i > 0 ? parseNum(bscWeekly[i - 1].data.generalScore) : null;
    const deltaStr = prevGen !== null && currGen !== null
      ? ` _(${currGen >= prevGen ? '🟢 ▲ +' : '🔴 ▼ '}${(currGen - prevGen).toFixed(1).replace('.', ',')} pts)_`
      : '';
    const tagFoco = i === bscWeekly.length - 1 ? ' *(Última Fechada)*' : '';
    msg += `• *${curr.week.shortLabel}:* *${fmtScore(currGen)} pts*${deltaStr}${tagFoco}\n`;
  }

  // Destaca o que subiu e o que caiu comparando a última semana fechada com a penúltima
  if (bscWeekly.length >= 2) {
    const closedCurr = bscWeekly[bscWeekly.length - 1];
    const closedPrev = bscWeekly[bscWeekly.length - 2];
    const subiu = [];
    const caiu = [];

    for (const meta of BSC_PREMISSAS) {
      const cV = parseNum(closedCurr.data.kpiMap[meta.indicador]?.value);
      const pV = parseNum(closedPrev.data.kpiMap[meta.indicador]?.value);
      if (cV === null || pV === null) continue;
      const diff = cV - pV;
      if (diff >= 0.2) subiu.push(`*${meta.indicador}* (${fmtPct(pV)} ➔ *${fmtPct(cV)}*)`);
      else if (diff <= -0.2) caiu.push(`*${meta.indicador}* (${fmtPct(pV)} ➔ *${fmtPct(cV)}*)`);
    }

    msg += `\n📌 *Destaques da semana fechada (${closedCurr.week.shortLabel} vs ${closedPrev.week.shortLabel}):*\n`;
    if (subiu.length > 0) msg += `🟢 *Subiram:* ${subiu.join(' | ')}\n`;
    if (caiu.length > 0) msg += `🔴 *Caíram:* ${caiu.join(' | ')}\n`;
  }

  // BLOCO 4: RAIO-X DAS 3 SUBPÁGINAS
  msg += formatCleanSubPages(subPages, weekShort);

  return msg;
}

async function main() {
  console.log('====================================================');
  console.log('🚀 EXECUTANDO AGENTE DE FECHAMENTO SEMANAL (SEGUNDA A DOMINGO)');
  console.log('====================================================\n');

  const { targetClosedWeek, weeks } = getPeriodsToAnalyze(new Date());
  const cachedWeeklyPath = path.join(DATA_DIR, 'ultimos_dados_extraidos.json');
  const cachedSubpagesPath = path.join(DATA_DIR, 'subpages_semana_fechada.json');

  if (process.argv.includes('--cached') && fs.existsSync(cachedWeeklyPath)) {
    const cached = JSON.parse(fs.readFileSync(cachedWeeklyPath, 'utf-8'));
    // Encontra a semana fechada alvo (02/11 a 08/11)
    const targetWeekData = cached.bscWeekly.find(w => w.week.shortLabel === targetClosedWeek.shortLabel) || cached.bscWeekly[cached.bscWeekly.length - 2] || cached.bscWeekly[cached.bscWeekly.length - 1];
    // Mantém as semanas fechadas de segunda a domingo (ignora parcial se houver)
    const cleanWeekly = cached.bscWeekly.filter(w => !w.week.label.includes('11/11'));
    const subPages = fs.existsSync(cachedSubpagesPath) ? JSON.parse(fs.readFileSync(cachedSubpagesPath, 'utf-8')) : cached.subPages;

    const whatsappReport = buildWhatsappReport(targetWeekData, cleanWeekly, subPages);
    const msgPath = path.join(REPORTS_DIR, 'mensagem_whatsapp_slack.txt');
    fs.writeFileSync(msgPath, whatsappReport, 'utf-8');
    console.log(whatsappReport);
    await sendZApiMessage(whatsappReport);
    return;
  }

  const context = await launchBrowser(true);
  const page = context.pages()[0] || await context.newPage();
  await page.setViewportSize({ width: 1920, height: 1200 });

  await ensureGoogleAuthenticated(page, context);

  // 1. Extrai as 4 semanas fechadas (todas de segunda a domingo)
  const bscWeekly = [];
  for (const w of weeks) {
    console.log(`📅 [Principal] Filtrando -> ${w.label}...`);
    await selectDateRange(page, w.start, w.end);
    const data = await extractBscPage(page);
    console.log(`   Período lido: "${data.selectedPeriodText}" | Nota Geral: ${data.generalScore}`);
    bscWeekly.push({ week: w, data });
  }

  const targetWeekData = bscWeekly[bscWeekly.length - 1];

  // 2. Extrai as 3 páginas adicionais na última semana fechada (segunda a domingo)
  console.log(`🔎 Extraindo subpáginas para a semana fechada ${targetClosedWeek.label}...`);
  const etaOrigem = await extractSubPageDetails(page, PAGES.etaOrigem, 'ETA Origem', targetClosedWeek.start, targetClosedWeek.end);
  const etaDestino = await extractSubPageDetails(page, PAGES.etaDestino, 'ETA Destino', targetClosedWeek.start, targetClosedWeek.end);
  const telemetria = await extractSubPageDetails(page, PAGES.telemetria, 'Telemetria', targetClosedWeek.start, targetClosedWeek.end);

  await context.close();

  const subPages = { etaOrigem, etaDestino, telemetria };
  const whatsappReport = buildWhatsappReport(targetWeekData, bscWeekly, subPages);
  const msgPath = path.join(REPORTS_DIR, 'mensagem_whatsapp_slack.txt');
  fs.writeFileSync(msgPath, whatsappReport, 'utf-8');
  fs.writeFileSync(cachedWeeklyPath, JSON.stringify({ targetClosedWeek: targetWeekData, bscWeekly, subPages }, null, 2), 'utf-8');
  fs.writeFileSync(cachedSubpagesPath, JSON.stringify(subPages, null, 2), 'utf-8');

  console.log('\n====================================================');
  console.log('✅ MENSAGEM SEMANAL PRONTA (SEGUNDA A DOMINGO):');
  console.log('====================================================\n');
  console.log(whatsappReport);

  await sendZApiMessage(whatsappReport);
}

const isDirectRun = process.argv[1] && (process.argv[1].endsWith('analyze.js') || process.argv[1].endsWith('analyze'));
if (isDirectRun) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
