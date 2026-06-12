
import { chromium } from 'playwright';
import axios from 'axios';
import crypto from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { SITES } from "./configs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function register(
    site,
    userData
){

    const config =
        SITES[site];

    if(!config){

        throw new Error(
            "Unknown site"
        );

    }

    const SITE_URL =
        config.siteUrl;

    const MERCHANT =
        config.merchant;

    const CAPTCHA_ID =
        config.captchaId;

// ================= CONFIG =================
const CAPSOLVER_API_KEY =
    process.env.CAPSOLVER_API_KEY;
const RSA_URL = `${SITE_URL}/wps/session/key/rsa`;        // ✅ changed from /wps
const REGISTER_URL = `${SITE_URL}/wps/member/register`;   // ✅ changed from /wps

const PROXY_SERVER =
    process.env.PROXY_SERVER || "http://proxy.soax.com:5000";

const PROXY_USERNAME =
    process.env.PROXY_USERNAME;

const PROXY_PASSWORD =
    process.env.PROXY_PASSWORD;
const PROXY_URL =
`http://${PROXY_USERNAME}:${PROXY_PASSWORD}@${PROXY_SERVER}`;

const proxyAgent = new HttpsProxyAgent(
    PROXY_URL,
    {
        keepAlive: true
    }
);
const axiosInstance = axios.create({
  httpsAgent: proxyAgent,
  httpAgent: proxyAgent,
  timeout: 90000,
  maxRedirects: 5,
  validateStatus: () => true
});
function randomUsername(){

    const chars =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    const length =
        Math.floor(Math.random() * 7) + 6;

    let result = "";

    for(let i = 0; i < length; i++){

        result += chars[
            Math.floor(
                Math.random() * chars.length
            )
        ];

    }

    return result;

}

async function retry(fn, retries = 3){

    let lastError;

    for(let i = 0; i < retries; i++){

        try{

            return await fn();

        }catch(err){

            lastError = err;

            console.log(
                `Retry ${i + 1}/${retries}:`,
                err.code || err.message
            );

            if(
                err.code !== "ECONNRESET" &&
                err.code !== "ETIMEDOUT" &&
                err.code !== "ECONNABORTED" &&
                err.code !== "EPIPE" &&
                err.code !== "ENOTFOUND"
            ){
                throw err;
            }

            await new Promise(
                r => setTimeout(r, 3000)
            );

        }

    }

    throw lastError;

}

function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

// ================= GET RSA =================
async function getRSAKey() {
  const url = `${RSA_URL}?_=${Date.now()}`;
  console.log('Fetching RSA key from:', url);
  const response = await axiosInstance.get(url, {
    headers: {
      'Accept': '*/*',
      'Referer': `${SITE_URL}/`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    }
  });
  const modulus = response.data?.trim?.() || response.data;
  if (!modulus || modulus.length < 100) throw new Error('Invalid RSA modulus');
  console.log('✅ RSA modulus obtained (length:', modulus.length, ')');
  return modulus;
}

// ================= CAPTCHA =================
async function solveGeetestV4() {
  console.log('Solving Geetest V4 via Capsolver...');
  const createPayload = {
    clientKey: CAPSOLVER_API_KEY,
    task: {
      type: 'GeeTestTaskProxyless',
      websiteURL: SITE_URL,
      captchaId: CAPTCHA_ID,
      version: 4,
    },
  };
  const createResp = await axiosInstance.post('https://api.capsolver.com/createTask', createPayload);
  if (createResp.data.errorId) throw new Error(`Create task error: ${JSON.stringify(createResp.data)}`);
  const taskId = createResp.data.taskId;
  console.log(`Captcha task ID: ${taskId}`);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pollResp = await axiosInstance.post('https://api.capsolver.com/getTaskResult', {
      clientKey: CAPSOLVER_API_KEY,
      taskId,
    });
    const data = pollResp.data;
    if (data.status === 'ready') {
      console.log('✅ Captcha solved');
      const sol = data.solution;
      return {
        lot_number: sol.lotNumber || sol.lot_number,
        pass_token: sol.passToken || sol.pass_token,
        gen_time: sol.genTime || sol.gen_time,
        captcha_output: sol.captchaOutput || sol.captcha_output,
      };
    }
    if (data.errorId) throw new Error(`Captcha error: ${JSON.stringify(data)}`);
    console.log(`Waiting for captcha... (${i + 1}/30)`);
  }
  throw new Error('Captcha timeout');
}

// ================= ENCRYPTION (in browser) =================
async function encryptPayload(page, payload, rsaKey) {
  return await page.evaluate(({ payload, rsaKey }) => {
    const randomString = (len) => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < len; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
      return result;
    };
    const aesKey = randomString(16);
    const desKey = aesKey.slice(0, 8);
    const desEncrypted = CryptoJS.DES.encrypt(
      JSON.stringify(payload),
      CryptoJS.enc.Utf8.parse(desKey),
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    ).toString();
    window.setMaxDigits(131);
    const rsaEncrypted = window.encryptedString(
      new window.RSAKeyPair('10001', '', rsaKey),
      aesKey.split('').reverse().join('')
    );
    return { des: desEncrypted, rsaEnc: rsaEncrypted };
  }, { payload, rsaKey });
}



// ================= MAIN =================
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      proxy: { server: PROXY_SERVER, username: PROXY_USERNAME, password: PROXY_PASSWORD },
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.addScriptTag({ path: path.join(__dirname, 'crypto-js.min.js') });
    await page.addScriptTag({ path: path.join(__dirname, 'vendor.encrypt.v2.dll.js') });

const rsaKey = await retry(
    () => getRSAKey()
);

const geetestSolution = await retry(
    () => solveGeetestV4()
);

const username = randomUsername();
const password =
    process.env.DEFAULT_PASSWORD;
const mobile = userData.mobile;

const deviceId = crypto.randomUUID();
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

    // Full payload from successful registration (including all fields)
    const payload = {
  username,
  password,
  confirmPassword: password,

  mobileNum: mobile,

  affiliateCode: config.affiliateCode,
  domain: config.domain,

  geetestValidateV4: {
    captcha_id: CAPTCHA_ID,
    ...geetestSolution
  },

  login: true,
  registerUrl: SITE_URL,
  registerMethod: 'WEB',
  loginDeviceId: deviceId
};

    console.log(
    `Registering: ${username} / ${mobile}`
);

    const { des, rsaEnc } = await encryptPayload(page, payload, rsaKey);

    const headers = {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Content-Type': 'application/json',
      'Host': new URL(SITE_URL).host,
      'Merchant': MERCHANT,
      'Language': 'EN',
      'Authorization': '',
      'Encryption': rsaEnc,
      'X-Digest': des,
      'X-RSA': rsaKey,
      'X-Real-UA': Buffer.from(userAgent).toString('base64'),
      'Origin': SITE_URL,
      'Referer': `${SITE_URL}/`,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent': userAgent,
      'Cookie': `SHELL_deviceId=${deviceId}`,
    };

    console.log('Sending encrypted PUT request to /wps/member/register ...');
    const response = await retry(() =>
    axiosInstance.put(
        REGISTER_URL,
        { value: des },
        { headers }
    )
);

    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));

if (response.data?.success) {
const token = response.data.value?.token;

console.log("Sending OTP...");

const otpResponse = await axiosInstance.post(
    `${SITE_URL}/wps/v2/verification/sms/send`,
    {
        mobileNum: mobile,
        operationType: 5,
        countryDialingCode: null
    },
    {
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",

            Authorization: token,

            Merchant: MERCHANT,
            Language: "EN",
            ModuleId: "VERIFICATION3",

            Origin: SITE_URL,
            Referer: `${SITE_URL}/member`,

            "X-Requested-With": "XMLHttpRequest",
            "X-Timestamp": Date.now().toString(),

            Cookie: `SHELL_deviceId=${deviceId}`
        }
    }
);

console.log(
    "OTP RESPONSE:",
    JSON.stringify(otpResponse.data, null, 2)
);
  console.log(`✅ SUCCESS: ${username}`);


return {
    success: true,
    mobile,
    token,
    username,
    password
};
}else {
      throw new Error(
  response.data?.msg ||
  response.data?.message ||
  'Registration failed'
);
    }
} catch (err) {

    console.error({
        code: err.code,
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
    });

    throw err;

} finally {
    if (browser) await browser.close();
  }
}

