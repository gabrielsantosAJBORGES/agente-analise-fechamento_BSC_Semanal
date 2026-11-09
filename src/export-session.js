import { launchBrowser, STORAGE_STATE_PATH } from './browser.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('====================================================');
  console.log('☁️ EXPORTANDO SESSÃO DO GOOGLE PARA O GITHUB ACTIONS');
  console.log('====================================================\n');

  const context = await launchBrowser(true);

  const state = await context.storageState({ path: STORAGE_STATE_PATH });
  await context.close();

  // Filtra apenas cookies relevantes do Google/Looker Studio para ficar leve no GitHub Secret
  const filteredCookies = (state.cookies || []).filter(c =>
    c.domain.includes('google.com') ||
    c.domain.includes('lookerstudio') ||
    c.domain.includes('datastudio')
  );

  const compactState = {
    cookies: filteredCookies,
    origins: []
  };

  const compactJson = JSON.stringify(compactState);
  const base64Str = Buffer.from(compactJson, 'utf-8').toString('base64');

  const base64File = path.join(__dirname, '..', 'session_base64.txt');
  fs.writeFileSync(base64File, base64Str, 'utf-8');

  console.log(`✅ Foram exportados ${filteredCookies.length} cookies autenticados do Google!`);
  console.log(`📁 O código Base64 para colocar no Secret GOOGLE_STORAGE_STATE_BASE64 do GitHub foi salvo em:\n   ${base64File}\n`);
}

main().catch(err => {
  console.error('Erro ao exportar sessão:', err);
  process.exit(1);
});
