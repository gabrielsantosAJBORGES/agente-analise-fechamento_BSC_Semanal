import { loadEnvFile } from './browser.js';

/**
 * Envia a mensagem do relatório de fechamento via Z-API para um ou mais números/grupos de WhatsApp
 */
export async function sendZApiMessage(messageText) {
  loadEnvFile();

  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  const targetPhonesRaw = process.env.ZAPI_TARGET_PHONE;

  if (!instanceId || !token || !targetPhonesRaw || instanceId.includes('SEU_INSTANCE_ID')) {
    console.log('\nℹ️ [Z-API] Variáveis ZAPI_INSTANCE_ID, ZAPI_TOKEN ou ZAPI_TARGET_PHONE não configuradas.');
    console.log('   Preencha o arquivo .env (local) ou os GitHub Secrets (na nuvem) para habilitar o disparo automático no WhatsApp.');
    return false;
  }

  const phones = targetPhonesRaw.split(',').map(p => p.trim()).filter(Boolean);
  const endpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

  const headers = {
    'Content-Type': 'application/json'
  };
  if (clientToken && !clientToken.includes('SEU_CLIENT_TOKEN')) {
    headers['Client-Token'] = clientToken;
  }

  let allSuccess = true;

  for (const phone of phones) {
    console.log(`📲 [Z-API] Enviando relatório no WhatsApp para: ${phone}...`);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone,
          message: messageText
        })
      });

      const respData = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error(`❌ [Z-API] Falha ao enviar para ${phone} (HTTP ${response.status}):`, respData);
        allSuccess = false;
      } else {
        console.log(`✅ [Z-API] Mensagem entregue com sucesso para ${phone}! (zapiMessageId: ${respData.zapiMessageId || respData.messageId || 'OK'})`);
      }
    } catch (err) {
      console.error(`❌ [Z-API] Erro de conexão ao enviar para ${phone}:`, err.message);
      allSuccess = false;
    }
  }

  return allSuccess;
}
