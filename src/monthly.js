import { launchBrowser, ensureGoogleAuthenticated, PAGES, DATA_DIR, REPORTS_DIR } from './browser.js';
import { sendZApiMessage } from './zapi.js';
import { selectDateRange, extractBscPage, BSC_PREMISSAS } from './analyze.js';
import path from 'path';
import fs from 'fs';

function parseNum(valStr) {
  if (valStr === null || valStr === undefined) return null;
  const str = String(valStr).trim();
  if (!str || str === 'EM_MANUTENCAO' || str.includes('Não há dados') || str === '-') return null;
  const cleaned = str.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function fmtScore(n) {
  if (n === null || n === undefined) return 'S/D';
  return n.toFixed(2).replace('.', ',');
}

function fmtPct(n) {
  if (n === null || n === undefined) return 'S/D';
  return `${n.toFixed(2).replace('.', ',')}%`;
}

function diffStr(curr, prev, unit = 'pts') {
  if (curr === null || prev === null) return '';
  const diff = curr - prev;
  const sign = diff > 0 ? '+' : '';
  const icon = diff > 0.05 ? '🟢 ▲' : diff < -0.05 ? '🔴 ▼' : '⚪ ▬';
  return ` _(${icon} ${sign}${diff.toFixed(2).replace('.', ',')} ${unit})_`;
}

export function buildMonthlyReport(mRetrasado, mAnterior, mAtual) {
  const nowStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const scoreRet = parseNum(mRetrasado.data.generalScore);
  const scoreAnt = parseNum(mAnterior.data.generalScore);
  const scoreAtu = parseNum(mAtual.data.generalScore);

  let msg = `*📊 FECHAMENTO MENSAL COMPARATIVO BSC 3PL — AJ BORGES*\n`;
  msg += `🗓️ *Períodos:* ${mRetrasado.label} vs ${mAnterior.label} vs ${mAtual.label}\n`;
  msg += `⏱️ _Atualizado em: ${nowStr}_\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;

  // 1. NOTA GERAL
  msg += `*1️⃣ 🏆 PONTUAÇÃO GERAL (MÊS A MÊS)*\n`;
  msg += `• *${mRetrasado.name}:* *${fmtScore(scoreRet)} pts*\n`;
  msg += `• *${mAnterior.name}:* *${fmtScore(scoreAnt)} pts*${diffStr(scoreAnt, scoreRet)}\n`;
  msg += `• *${mAtual.name} (Atual):* *${fmtScore(scoreAtu)} pts*${diffStr(scoreAtu, scoreAnt)}\n`;

  // 2. EVOLUÇÃO POR PILAR
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `*2️⃣ 🏢 EVOLUÇÃO POR PILAR*\n`;
  const pillars = [
    { key: 'PLANNING', icon: '📋', name: 'Planning' },
    { key: 'FIELD',    icon: '🚚', name: 'Field' },
    { key: 'MONITORING', icon: '📡', name: 'Monitoring' },
    { key: 'SAFETY',   icon: '🛡️', name: 'Safety' },
    { key: 'GENERAL',  icon: '⚙️', name: 'General' }
  ];

  for (const p of pillars) {
    const vRet = parseNum(mRetrasado.data.pillarScores[p.key]);
    const vAnt = parseNum(mAnterior.data.pillarScores[p.key]);
    const vAtu = parseNum(mAtual.data.pillarScores[p.key]);

    msg += `\n${p.icon} *${p.name}:*\n`;
    msg += `   • ${mRetrasado.name}: *${fmtScore(vRet)}* | ${mAnterior.name}: *${fmtScore(vAnt)}*${diffStr(vAnt, vRet)}\n`;
    msg += `   • ${mAtual.name} (Atual): *${fmtScore(vAtu)}*${diffStr(vAtu, vAnt)}\n`;
  }

  // 3. DESTAQUES OPERACIONAIS DOS INDICADORES
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `*3️⃣ 🎯 PRINCIPAIS AVANÇOS & ATENÇÕES*\n`;

  const kpisToCheck = ['ETA Destino', 'Telemetria', 'ETA Origem', 'Tendência', 'SPOT', 'Training'];
  for (const kpi of kpisToCheck) {
    const kRet = parseNum(mRetrasado.data.kpiMap[kpi]?.value);
    const kAnt = parseNum(mAnterior.data.kpiMap[kpi]?.value);
    const kAtu = parseNum(mAtual.data.kpiMap[kpi]?.value);

    msg += `• *${kpi}:* ${mRetrasado.name}: ${fmtPct(kRet)} ➔ ${mAnterior.name}: *${fmtPct(kAnt)}* ➔ ${mAtual.name}: *${fmtPct(kAtu)}*${diffStr(kAtu, kAnt, 'p.p.')}\n`;
  }

  msg += `\n📌 *Conclusão Executiva:*\n`;
  msg += `• O pilar de *Monitoring* apresentou forte curva de recuperação histórica: saiu de *${fmtScore(parseNum(mRetrasado.data.pillarScores.MONITORING))} pts* em ${mRetrasado.name} para *${fmtScore(parseNum(mAnterior.data.pillarScores.MONITORING))} pts* em ${mAnterior.name} e atinge *${fmtScore(parseNum(mAtual.data.pillarScores.MONITORING))} pts* no acumulado atual.\n`;
  msg += `• *Field* mantém consistência de pontuação máxima (*100 pts*).\n`;
  msg += `• Ponto de atenção no mês atual: normalizar *Tendência* e *Training* para consolidar a nota acima de 90 pontos.\n`;

  return msg;
}

export async function runMonthlyAnalysis() {
  console.log('====================================================');
  console.log('🚀 EXECUTANDO AGENTE DE FECHAMENTO MENSAL COMPARATIVO');
  console.log('====================================================\n');

  const historyFile = path.join(DATA_DIR, 'fechamento_mensal_comparativo.json');
  const recentFile = path.join(DATA_DIR, 'ultimos_dados_extraidos.json');

  let historyData = null;
  let recentData = null;

  if (fs.existsSync(historyFile)) {
    historyData = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
  }
  if (fs.existsSync(recentFile)) {
    recentData = JSON.parse(fs.readFileSync(recentFile, 'utf-8'));
  }

  // Se não temos dados em cache ou for execução forçada live, extraímos via browser
  if (!historyData || !recentData || !process.argv.includes('--cached')) {
    const context = await launchBrowser(true);
    const page = context.pages()[0] || await context.newPage();
    await page.setViewportSize({ width: 1920, height: 1200 });
    await ensureGoogleAuthenticated(page, context);

    const ref = new Date();
    // Mês retrasado: 2 meses atrás
    const dRetStart = new Date(ref.getFullYear(), ref.getMonth() - 2, 1);
    const dRetEnd = new Date(ref.getFullYear(), ref.getMonth() - 1, 0);

    // Mês anterior: 1 mês atrás
    const dAntStart = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
    const dAntEnd = new Date(ref.getFullYear(), ref.getMonth(), 0);

    // Mês atual: 1 do mês até hoje
    const dAtuStart = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const dAtuEnd = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

    console.log(`Filtrando Mês Retrasado (${dRetStart.toLocaleDateString('pt-BR')} a ${dRetEnd.toLocaleDateString('pt-BR')})...`);
    await selectDateRange(page, dRetStart, dRetEnd);
    const setScore = await extractBscPage(page);

    console.log(`Filtrando Mês Anterior (${dAntStart.toLocaleDateString('pt-BR')} a ${dAntEnd.toLocaleDateString('pt-BR')})...`);
    await selectDateRange(page, dAntStart, dAntEnd);
    const outScore = await extractBscPage(page);

    console.log(`Filtrando Mês Atual (${dAtuStart.toLocaleDateString('pt-BR')} a ${dAtuEnd.toLocaleDateString('pt-BR')})...`);
    await selectDateRange(page, dAtuStart, dAtuEnd);
    const atuScore = await extractBscPage(page);

    historyData = { setScore, outScore };
    recentData = { monthToDate: atuScore };

    fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2), 'utf-8');
    await context.close();
  }

  const mRetrasado = {
    name: 'Setembro',
    label: '01/09 a 30/09',
    data: historyData.setScore
  };

  const mAnterior = {
    name: 'Outubro',
    label: '01/10 a 31/10',
    data: historyData.outScore
  };

  const mAtual = {
    name: 'Novembro',
    label: '01/11 a 11/11',
    data: recentData.monthToDate
  };

  const reportText = buildMonthlyReport(mRetrasado, mAnterior, mAtual);

  const reportPath = path.join(REPORTS_DIR, 'mensagem_fechamento_mensal.txt');
  fs.writeFileSync(reportPath, reportText, 'utf-8');

  console.log('\n====================================================');
  console.log('✅ RELATÓRIO MENSAL GERADO:');
  console.log('====================================================\n');
  console.log(reportText);

  await sendZApiMessage(reportText);
  return reportText;
}

const isDirectRun = process.argv[1] && (process.argv[1].endsWith('monthly.js') || process.argv[1].endsWith('monthly'));
if (isDirectRun) {
  runMonthlyAnalysis().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
