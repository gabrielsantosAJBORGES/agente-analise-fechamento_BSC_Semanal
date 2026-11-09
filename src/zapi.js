import { loadEnvFile } from './browser.js';

/**
 * Envia a mensagem do relatório de fechamento via Z-API para um ou mais GRUPOS (ou números) de WhatsApp.
 * Na Z-API, o parâmetro `phone` aceita tanto o ID do Grupo (ex: "120363012345678901-group")
 * quanto o nome do grupo se configurado via ZAPI_GROUP_NAME (busca automática do ID do grupo na Z-API).
 */
export async function sendZApiMessage(messageText) {
  loadEnvFile();

  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  const targetGroupsRaw = process.env.ZAPI_GROUP_ID || process.env.ZAPI_TARGET_PHONE;
  const targetGroupName = process.env.ZAPI_GROUP_NAME || 'Operação sem Falhas';

  if (!instanceId || !token || instanceId.includes('SEU_INSTANCE_ID')) {
    console.log('\nℹ️ [Z-API] Variáveis ZAPI_INSTANCE_ID ou ZAPI_TOKEN não configuradas.');
    console.log('   Configure no .env ou nos Secrets do GitHub para disparar no Grupo do WhatsApp.');
    return false;
  }

  const headers = { 'Content-Type': 'application/json' };
  if (clientToken && !clientToken.includes('SEU_CLIENT_TOKEN')) {
    headers['Client-Token'] = clientToken;
  }

  let targets = [];
  if (targetGroupsRaw && !targetGroupsRaw.includes('5511999999999')) {
    targets = targetGroupsRaw.split(',').map(t => t.trim()).filter(Boolean);
  }

  // Se o usuário informou o NOME do grupo (ZAPI_GROUP_NAME) em vez do ID, buscamos o ID automaticamente na Z-API!
  if (targets.length === 0 && targetGroupName) {
    console.log(`🔎 [Z-API] Buscando ID do grupo pelo nome: "${targetGroupName}"...`);
    const foundId = await findGroupIdByName(instanceId, token, headers, targetGroupName);
    if (foundId) {
      targets.push(foundId);
    }
  }

  if (targets.length === 0) {
    console.log('\n⚠️ [Z-API] Nenhum ID de grupo configurado em ZAPI_GROUP_ID (ou ZAPI_TARGET_PHONE).');
    console.log('   Rode "npm run list-groups" para ver a lista de grupos do seu WhatsApp e seus respectivos IDs!');
    return false;
  }

  const endpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
  let allSuccess = true;

  for (const groupOrPhone of targets) {
    console.log(`📲 [Z-API] Enviando relatório para o grupo/destino: ${groupOrPhone}...`);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: groupOrPhone,
          message: messageText
        })
      });

      const respData = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error(`❌ [Z-API] Falha ao enviar para ${groupOrPhone} (HTTP ${response.status}):`, respData);
        allSuccess = false;
      } else {
        console.log(`✅ [Z-API] Relatório entregue com sucesso no grupo ${groupOrPhone}! (ID: ${respData.zapiMessageId || respData.messageId || 'OK'})`);
      }
    } catch (err) {
      console.error(`❌ [Z-API] Erro de conexão ao enviar para ${groupOrPhone}:`, err.message);
      allSuccess = false;
    }
  }

  return allSuccess;
}

/**
 * Busca na Z-API todos os grupos do WhatsApp conectado
 */
export async function listZApiGroups(instanceId, token, headers) {
  const groups = [];
  for (let page = 1; page <= 5; page++) {
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/groups?page=${page}&pageSize=100`;
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) break;
    const data = await res.json().catch(() => []);
    if (!Array.isArray(data) || data.length === 0) break;
    const onlyGroups = data.filter(item => item.isGroup || (item.phone && item.phone.includes('-group')));
    groups.push(...onlyGroups);
    if (data.length < 100) break;
  }
  return groups;
}

async function findGroupIdByName(instanceId, token, headers, groupName) {
  const groups = await listZApiGroups(instanceId, token, headers);
  const normalize = (str) => (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const search = normalize(groupName);
  const match = groups.find(g => normalize(g.name).includes(search));
  if (match) {
    console.log(`✅ [Z-API] Grupo encontrado: "${match.name}" -> ID: ${match.phone}`);
    return match.phone;
  }
  console.error(`❌ [Z-API] Nenhum grupo encontrado contendo o nome "${groupName}".`);
  return null;
}
