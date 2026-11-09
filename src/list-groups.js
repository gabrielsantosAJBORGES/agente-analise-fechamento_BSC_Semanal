import { loadEnvFile } from './browser.js';
import { listZApiGroups } from './zapi.js';

async function main() {
  loadEnvFile();

  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (!instanceId || !token || instanceId.includes('SEU_INSTANCE_ID')) {
    console.error('❌ Configure primeiro ZAPI_INSTANCE_ID, ZAPI_TOKEN e ZAPI_CLIENT_TOKEN no seu arquivo .env!');
    process.exit(1);
  }

  const headers = { 'Content-Type': 'application/json' };
  if (clientToken && !clientToken.includes('SEU_CLIENT_TOKEN')) {
    headers['Client-Token'] = clientToken;
  }

  console.log('🔎 Buscando todos os grupos do seu WhatsApp na Z-API...\n');
  const groups = await listZApiGroups(instanceId, token, headers);

  if (groups.length === 0) {
    console.log('⚠️ Nenhum grupo retornado. Verifique se a instância está conectada e se o Client-Token está correto.');
    return;
  }

  console.log(`✅ Encontrados ${groups.length} grupos:\n`);
  console.log('ID DO GRUPO (colocar no Secret)        | NOME DO GRUPO');
  console.log('-------------------------------------------------------------------------');
  for (const g of groups) {
    console.log(`${(g.phone || '').padEnd(38)} | ${g.name || '(Sem nome)'}`);
  }
}

main().catch(err => {
  console.error('Erro ao listar grupos:', err);
  process.exit(1);
});
