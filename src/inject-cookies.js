import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, STORAGE_STATE_PATH } from './browser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cookieHeader = 'RAP_XSRF_TOKEN=AIOld91uuUtxc2iqfxIX1HnuMbIF0VOpcw:1794250154839; SEARCH_SAMESITE=CgQIvqEB; __Secure-BUCKET=CNwF; GCL_AW_P=GCL.1793748107.CjwKCAiAqabXBhBUEiwAw_SQpcVyemx924yPFTyhFL6qK162slmmaoICLE-A0l0Qc0n3kqvAdPfTBBoCF5kQAvD_BwE; SID=g.a000EgnEHqW7FVyUrlRZy7S5fBGZ8Gdqw51tceSi7y6a3dJycqb9Qhu_SWOcnzhQWFwTyMQu5wACgYKAX0SARMSFQHGX2MizGpM4fTRRTolE2iWpmA-9RoVAUF8yKrfDZ_T9z3xObtKbFB-CP_n0076; __Secure-1PSID=g.a000EgnEHqW7FVyUrlRZy7S5fBGZ8Gdqw51tceSi7y6a3dJycqb9wHeFIkdACYBL0XZruhOKrAACgYKAcoSARMSFQHGX2MiAv-UoE2S5Vi87Y97s6pgphoVAUF8yKouJzydlTuk6YzXgJp211e10076; __Secure-3PSID=g.a000EgnEHqW7FVyUrlRZy7S5fBGZ8Gdqw51tceSi7y6a3dJycqb9SdlbKgLyS_-JqicgZZokNgACgYKAQYSARMSFQHGX2MiFtyF7VaPr-zTWOiNdCiFnRoVAUF8yKoW8zw3zFvmDFnWejfofvLm0076; HSID=Am7rzkbi0DwjwySkx; SSID=AhhhDZHJzTc6EPaGT; APISID=yQtCXC7FzZSZW7wT/ABoa6y8bEKH1bZlvU; SAPISID=lLWPnm8ll5RWcJTI/AyuO-9BeCcKweaWyV; __Secure-1PAPISID=lLWPnm8ll5RWcJTI/AyuO-9BeCcKweaWyV; __Secure-3PAPISID=lLWPnm8ll5RWcJTI/AyuO-9BeCcKweaWyV; AEC=Aaa9EJq5UkIXhZunYieGnEfsybepMCfY5dEfK2Sf-oltOs84jG5CEpQzug; _gid=GA1.3.1198597650.1794235350; NID=Ct8CCAESkQIBM9Agl2_dOMqkG8-2hjet2JwS-Npit_ejqaHrcW6tGdMJI0bEiY7MyLg1MSt6UCzEGyybF32Nb6srFei4VkvTC98OPK6N3xx6SSJlUD7K6zd-e8KsaLUq_pjzff3iOj__3FYpI3yAqD7l-ePgKvuFBBj6q1_vqAE9-Cn8ElP_tGWzOsHE4GqJnzq5Dn8NOWJ7BvR41qKRfiSHP6XR-j4sfMWN0Nx8xrKaBV8KQz2NCSEaiOIVUs9UmIX80L04nvVJFVCHiiA_SFQuA_ez2Ea2vHRb0qYtlE8MvE7OmsjcKmzAE_dEmoZ1kn3pjOAToi7rGbTxwi0R4ZEpSS0IndLxY0i40ITK1GPeH6v8EcUiAo4oATJFAXBKQs-rIgy4awDEBaFEqbCJvktxq06aZtk3DouDbUCZ75bNnAOfa80S38GV1rXmTzYc8aepht_koZ0xrBaDk92M5bsH; __Secure-1PSIDTS=sidts-CjEBnJZzahC4n4knIpT7OwnRNg8voZIRb_wUnw_8Gqgxl4LpLyTGO2PJHC7MFQUMz-i1EAA; __Secure-3PSIDTS=sidts-CjEBnJZzahC4n4knIpT7OwnRNg8voZIRb_wUnw_8Gqgxl4LpLyTGO2PJHC7MFQUMz-i1EAA; _gat=1; _gat_marketingTracker=1; _ga=GA1.1.760611394.1793020339; _ga_Z6DT3DGRJJ=GS2.1.s1794249581$o3$g1$t1794250158$j54$l0$h0; SIDCC=APD_SKGWnUPNk_V5wOvqDSDCAEDyJw1t-PIGknJUvERdz-7gyeV9tZI3nDU79muCL-nMiJxxEAc; __Secure-1PSIDCC=APD_SKHrp2rHdjpKCxfCl-83uglwmKCPuObs8a4FnVaztJUop8XxS4RZEY4IVB_dfGExjQV9Zmc; __Secure-3PSIDCC=APD_SKFKa3GmVyHoBhNkIiV2QtFooUUzpCqmecY8vkESuaOKsf5tR60NhT1zxO0jB7SLLwhrdX3b; _ga_S4FJY0X3VX=GS2.1.s1794249566$o3$g1$t1794250167$j45$l0$h0';

function parseCookies(raw) {
  const cookies = [];
  const pairs = raw.split(';').map(s => s.trim()).filter(Boolean);
  const domains = ['.google.com', 'datastudio.google.com', 'lookerstudio.google.com'];

  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const name = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    const isSecure = name.startsWith('__Secure-') || name.startsWith('__Host-') || name.includes('3P') || name.includes('SAPISID');

    for (const domain of domains) {
      if (name === 'RAP_XSRF_TOKEN' && domain === '.google.com') continue;
      cookies.push({
        name,
        value,
        domain: name === 'RAP_XSRF_TOKEN' ? domain : '.google.com',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
        httpOnly: name.includes('SID') && !name.includes('SAPISID'),
        secure: isSecure || true,
        sameSite: name.includes('3P') ? 'None' : 'Lax'
      });
      if (name !== 'RAP_XSRF_TOKEN') break; // adiciona apenas 1 vez para .google.com
    }
  }
  return cookies;
}

const cookies = parseCookies(cookieHeader);
const storageState = { cookies, origins: [] };

fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storageState, null, 2), 'utf-8');
const base64Str = Buffer.from(JSON.stringify(storageState), 'utf-8').toString('base64');
fs.writeFileSync(path.join(__dirname, '..', 'session_base64.txt'), base64Str, 'utf-8');

console.log(`✅ Salvos ${cookies.length} cookies da conta gabriel.santos@ajborges.com em storageState.json e session_base64.txt!`);
