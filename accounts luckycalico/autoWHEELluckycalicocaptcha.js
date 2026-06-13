import axios from "axios";
import WebSocket  from "ws";
import protobuf from "protobufjs";
import fs from "fs/promises";
import { HttpsProxyAgent } from "https-proxy-agent";
import crypto from "crypto";
import { chromium } from "playwright";
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// ============================
// 🔍 AUTO SESSION DETECT
// ============================


const CSV_FILE = "accvoucher.csv";


function getRandomProxy() {
    const port = 10000 + Math.floor(Math.random() * 1000);

    return {
        server: `http://gw.dataimpulse.com:${port}`,
        username: "d8cf593e56ac787bd39f__cr.ph",
        password: "857378f267049d37"
    };
}

async function logProxyIP(workerId, proxyAgent) {
    try {

        const res = await axios.get(
            "https://api.ipify.org?format=json",
            {
                httpsAgent: proxyAgent,
                timeout: 10000
            }
        );

        console.log(
            `[W${workerId}] 🌍 USING IP: ${res.data.ip}`
        );

    } catch (err) {

        console.log(
            `[W${workerId}] ❌ Failed to get proxy IP`
        );

        console.log(err.message);
    }
}

async function saveAccount(username) {
    try {
        await fs.appendFile("account.txt", username + "\n");
    } catch (err) {
        console.error("❌ Failed to save account:", err.message);
    }
}

async function saveFailed(username, reason) {
    try {
        await fs.appendFile("failedacc.txt", `${username},${reason}\n`);
        console.log(`❌ Saved FAILED → ${username} (${reason})`);
    } catch (err) {
        console.error("❌ Failed to write failedacc:", err.message);
    }
}

let LOCK = false;

async function getNextAccount() {
    while (LOCK) await new Promise(r => setTimeout(r, 50));
    LOCK = true;

    try {
        const data = await fs.readFile(CSV_FILE, "utf8");

        const lines = data.split("\n").filter(l => l.trim());
        if (lines.length === 0) return null;

        const first = lines[0];
        const remaining = lines.slice(1).join("\n");

        await fs.writeFile(CSV_FILE, remaining, "utf8");

        const username = first.trim();
		return { username };

    } finally {
        LOCK = false;
    }
}

async function solveCaptcha() {
    const API_KEY = "252676a27bfa74e49c515441709f4dad";

    // 1. CREATE TASK (send captcha)
    const create = await axios.get("https://api.solvecaptcha.com/in.php", {
        params: {
            key: API_KEY,
            method: "geetest_v4",
            pageurl: "https://www.luckycalico.ph/m/login",
            captcha_id: "10578edd4000cf44530a193e12f275de",
            json: 1
        }
    });

    if (create.data.status !== 1) {
        console.log("❌ CAPTCHA CREATE FAILED:", create.data);
        throw new Error(JSON.stringify(create.data));
    }

    const taskId = create.data.request; // this is NOT numeric sometimes, keep as string

    // 2. POLL RESULT
    while (true) {
        await new Promise(r => setTimeout(r, 5000)); // 5s is safer here

        const res = await axios.get("https://api.solvecaptcha.com/res.php", {
            params: {
                key: API_KEY,
                action: "get",
                id: taskId,
                json: 1
            }
        });

        if (res.data.status === 1) {
            console.log("✅ CAPTCHA SOLVED");

            // response is usually a JSON string → parse it
            let solution;
            try {
                solution = typeof res.data.request === "string"
                    ? JSON.parse(res.data.request)
                    : res.data.request;
            } catch (e) {
                throw new Error("❌ Failed to parse captcha solution");
            }

            return {
                captcha_id: solution.captcha_id,
                lot_number: solution.lot_number,
                pass_token: solution.pass_token,
                gen_time: solution.gen_time,
                captcha_output: solution.captcha_output
            };
        }

        if (res.data.request !== "CAPCHA_NOT_READY") {
            console.log("❌ CAPTCHA FAILED:", res.data);
            throw new Error(JSON.stringify(res.data));
        }

        console.log("⏳ WAITING CAPTCHA...");
    }
}

function getHeaders(token) {
    return {
        "Accept": "application/json, text/plain, */*",
        "Authorization": token,
        "Content-Type": "application/json;charset=utf-8",
        "Language": "EN",
        "Merchant": "luckycaf3",
        "Referer": "https://www.luckycalico.ph/m/receivingCenter",
        "User-Agent": "Mozilla/5.0",
        "X-Timestamp": Date.now(),
    };
}

async function loginAccount(username, page, session, proxyAgent) {

    const rsaKey = await session.get(
        `https://www.luckycalico.ph/wps/session/key/rsa?_=${Date.now()}`
    ).then(r => r.data);

    const captcha = await solveCaptcha();

    const payload = {
        isSms: false,
        username,
        password: "022806",
        type: "username",
        loginDeviceId: crypto.randomUUID(),
        isOfficialAppLogin: false,
        geetestValidateV4: {
            captcha_id: "10578edd4000cf44530a193e12f275de",
            lot_number: captcha.lot_number,
            pass_token: captcha.pass_token,
            gen_time: captcha.gen_time,
            captcha_output: captcha.captcha_output
        }
    };

    const { des, rsaEnc } = await page.evaluate(({ payload, rsaKey }) => {

        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

        const aes = Array.from({ length: 16 }, () =>
            chars[Math.floor(Math.random() * chars.length)]
        ).join('');

        const clean = JSON.parse(JSON.stringify(payload));

        const des = CryptoJS.DES.encrypt(
            JSON.stringify(clean),
            CryptoJS.enc.Utf8.parse(aes.slice(0, 8)),
            { mode: CryptoJS.mode.ECB }
        ).toString();

        window.setMaxDigits(131);

        const rsaEnc = window.encryptedString(
            new window.RSAKeyPair("10001", "", rsaKey),
            aes.split('').reverse().join('')
        );

        return { des, rsaEnc };

    }, { payload, rsaKey });

    const userAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0";

    const res = await session.post(
        `/wps/session/login`,
        { value: des },
        {
            headers: {
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/json",
                "Merchant": "luckycaf3",
                "Language": "EN",
                "Encryption": rsaEnc,
                "X-Digest": des,
                "X-RSA": rsaKey,
                "X-Real-UA": Buffer.from(userAgent).toString("base64"),
                "User-Agent": userAgent,
                "Origin": "https://www.luckycalico.ph",
                "Referer": "https://www.luckycalico.ph/m/login",
                "Cookie": `SHELL_deviceId=${payload.loginDeviceId}`
            },
            httpAgent: proxyAgent,
			httpsAgent: proxyAgent
        }
    );

    if (!res.data?.success) {
        const err = new Error("Login failed");

		err.response = {
			data: res.data,
			status: res.status,
			headers: res.headers
		};

		throw err;
    }

    return res.data.value.token;
}



async function getBalance(token, workerId, proxyAgent) {
    try {
        const res = await axios.get(
           "https://www.luckycalico.ph/wps/v2/wallets/balance?typeId=0",
            {
                headers: getHeaders(token),
                httpsAgent: proxyAgent,
                timeout: 10000
            }
        );

        if (res.data?.success) {
            const balance = res.data?.value?.sumBalance ?? 0;

            console.log(`[W${workerId}] 💰 BALANCE: ${balance}`);
            return balance;
        } else {
            console.log(`[W${workerId}] ❌ API returned failure`, res.data);
            return null;
        }

    } catch (err) {
        console.error(
            `[W${workerId}] ❌ Balance error`,
            err.response?.status,
            err.response?.data || err.message
        );
        return null;
    }
}


function extractSession(buffer) {
    try {
        const str = buffer.toString("utf8");

        // hanap string na mukhang player/session
        const matches = str.match(/[A-Za-z0-9]{8,20}/g);

        if (matches) {
            for (let m of matches) {
                // filter: usually may numbers + letters
                if (/[0-9]/.test(m) && /[A-Za-z]/.test(m)) {
                    return m;
                }
            }
        }
    } catch {}

    return null;
}


// ============================
// 🧠 PROTO SETUP (NO SESSION)
// ============================

const proto = `
syntax = "proto3";

message BetPayload {
  double multiplier = 1;
  string session = 2;
  int32 amount = 3;
  int32 p4 = 4;
  int32 p5 = 5;
  int32 p6 = 6;
}

message Envelope {
  int32 type = 1;
  BetPayload data = 2;
}

message BetResponse {
  string session = 1;
  string hash = 2;
  int64 timestamp = 3;
  double balance = 4;

  message Config {
    int32 mode = 1;
    int32 state = 2;
  }

  Config config = 5;
}

message EnvelopeRes {
  int32 type = 1;
  BetResponse data = 2;
}
`;


const root = protobuf.parse(proto).root;
const Envelope = root.lookupType("Envelope");
const ResponseEnvelope = root.lookupType("EnvelopeRes");


function extractBalance(buffer, expectedSession) {
    try {
        const decoded = ResponseEnvelope.decode(buffer);

        if (decoded.type !== 12) return null;

        const data = decoded.data;

        if (data.session !== expectedSession) return null;

        return data.balance;
    } catch {}

    return null;
}



function buildBet(session, betMultiplier, laneType, laneIndex) {
  return Envelope.encode({
    type: 12,
    data: {
      multiplier: betMultiplier, // field 1
      session: session,
      amount: laneType,          // field 3
      p4: laneIndex,             // field 4
      p5: 0,
      p6: 0
    }
  }).finish();
}

function getBestBet(balance) {
    const bets = [5, 3, 2, 1]; // highest → lowest

    for (let b of bets) {
        if (balance >= b) {
            return b;
        }
    }

    return 1; // fallback (should not happen unless balance < 1)
}

// ============================
// 🎁 CLAIM BONUS FUNCTIONS
// ===========================


async function runWorker(workerId, acc) {
	
	const proxy = getRandomProxy();

	console.log(
		`[W${workerId}] 🌐 Proxy: ${proxy.server}`
	);

    const { username } = acc;
	
	const browser = await chromium.launch({
    headless: true,
    proxy
});

	const proxyUrl =
		`http://${proxy.username}:${proxy.password}@${proxy.server.replace("http://", "")}`;

	const proxyAgent = new HttpsProxyAgent(proxyUrl);

	await logProxyIP(workerId, proxyAgent);

	const context = await browser.newContext();
	const page = await context.newPage();

	await page.addScriptTag({ path: "./crypto-js.min.js" });
	await page.addScriptTag({ path: "./vendor.encrypt.v2.dll.js" });

	const session = axios.create({timeout: 15000,
	baseURL: "https://www.luckycalico.ph",
	headers: {
		"Content-Type": "application/json",
		"Merchant": "luckycaf3"
	},
	httpAgent: proxyAgent,
	httpsAgent: proxyAgent
	});

	console.log(`[W${workerId}] 🔐 Logging in: ${username}`);
	await delay(1000 + Math.random() * 2000);
    let token = null;

	for (let attempt = 1; attempt <= 2; attempt++) {
	console.log(`[W${workerId}] 🔁 LOGIN ATTEMPT ${attempt}`);

	try {
		token = await loginAccount(username, page, session);
		console.log(`[W${workerId}] 🎟 TOKEN:`, token);
		break;
	} catch (err) {
		const data = err.response?.data;

		console.log(`[W${workerId}] ❌ Login failed`);

		if (data) {
		console.log(`[W${workerId}] 🔴 ERROR CODE:`, data.errorCode);
		console.log(`[W${workerId}] 🔴 MESSAGE:`, data.msg || data.message);
		}

		// 🚫 STOP RETRY CONDITIONS
		if (data?.errorCode === "us_forbidden_login_error") {
		console.log(`[W${workerId}] 🚫 BLOCKED → stop retry`);

		await saveFailed(username, "blocked");

		return;
		}

		// ❌ INVALID ACCOUNT (optional but recommended)
		if (data?.errorCode === "USER_NOT_EXIST") {
		console.log(`[W${workerId}] ❌ Invalid account → stop`);

		await saveFailed(username, "invalid_account");

		await page.close();
		await browser.close();
		return;
		}

		if (attempt === 2) {
		console.log(`[W${workerId}] ❌ All login attempts failed`);

		const reason = data?.errorCode || "login_failed";

		await saveFailed(username, reason);

		await page.close();
		await browser.close();
		return;
		}

		await delay(1000 + Math.random() * 1000);
	}
	}

    let SESSION = null;
    let START_BALANCE = null;
    let LAST_BALANCE = null;
    let WAITING_RESULT = false;
    let STOP = false;


	async function run() {

    const timestamp = Date.now();

    console.log(`[W${workerId}] Timestamp:`, timestamp);

    // ---------------------------
    // 1. launchGame request
    // ---------------------------
	console.log(`[W${workerId}] 🎁 CLAIMING BONUS...`);

	const balance = await getBalance(token, workerId, proxyAgent)

	await delay(1000);

	if (balance === null) {
	console.log(`[W${workerId}] ❌ Failed after claim, skipping`);
	return;
	}

	START_BALANCE = balance;
	LAST_BALANCE = balance;

	console.log(`[W${workerId}] 💰 START BALANCE:`, balance);
	await delay(1000);
    const launchRes = await axios.get(
        `https://www.luckycalico.ph/wps/game/launchGame?confirmTrans=0&launchMode=GLS&platform=html5&clientType=2&gameId=JL0118&nodeId=178045&accountType=1&vassalage=JL&username=${username}&language=EN&webView=false&isCoin=false`,
		{ headers: getHeaders(token), httpsAgent: proxyAgent }
    );

    const gameUrl = launchRes.data.value.content.game_url;

    console.log(`[W${workerId}] Game URL:`, gameUrl);

    // ---------------------------
    // 2. Extract ssoKey
    // ---------------------------
	await delay(1000);
    const ssoKey = new URL(gameUrl).searchParams.get("ssoKey");
	await delay(1000);
    console.log(`[W${workerId}] SSO Key:`, ssoKey);

    // ---------------------------
    // 3. SSO Login
    // ---------------------------
    const ssoRes = await axios.post(
        "https://wbwebapi.richventures888.com/sso-login.api",
        `key=${ssoKey}&lang=en-US`,
        {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                "Origin": "https://wbgame.richventures888.com",
                "Referer": "https://wbgame.richventures888.com/"
            },
			httpsAgent: proxyAgent
        }
    );

    const profile = ssoRes.data.profile;

    const aid = profile.aid;
    const apiId = profile.apiId;
    const siteId = profile.siteId;
    const nickname = profile.nickname;
    const agentAccount = profile.meta.agentAccount;
    const wstoken = ssoRes.data.token;

    ///console.log(`[W${workerId}] aid:`, aid);
    ///console.log(`[W${workerId}] apiId:`, apiId);
    ///console.log(`[W${workerId}] siteId:`, siteId);
    ///console.log(`[W${workerId}] nickname:`, nickname);
    ///console.log(`[W${workerId}] agentAccount:`, agentAccount);
    ///console.log(`[W${workerId}] token:`, wstoken);


    // ---------------------------
    // 5. WebSocket connection
    // ---------------------------
    const wsUrl = `wss://fish.richventures888.com/wheel/ws/${wstoken}?r=0`;

    console.log(`[W${workerId}] Connecting websocket:`, wsUrl);

await new Promise((resolve) => {

    const ws = new WebSocket(wsUrl, {
        agent: proxyAgent
    });

    let opened = false;

    ws.on("open", () => {

        opened = true;

        console.log(
            `[W${workerId}] ✅ WebSocket OPEN`
        );

    });

    // -----------------------------------
    // WS OPEN TIMEOUT
    // -----------------------------------

    setTimeout(() => {

        if (!opened) {

            console.log(
                `[W${workerId}] ❌ WS FAILED TO OPEN (timeout)`
            );

            ws.close();
            resolve();
        }

    }, 5000);

    // -----------------------------------
    // DEAD SOCKET MONITOR
    // -----------------------------------

    let lastMessageTime = Date.now();

    const monitor = setInterval(() => {

        const diff = Date.now() - lastMessageTime;

        if (diff > 10000) {

            console.log(
                `[W${workerId}] ⚠️ DEAD SOCKET`
            );

            ws.close();
        }

    }, 3000);

    // -----------------------------------
    // MESSAGE
    // -----------------------------------

    ws.on("message", async (data) => {

        lastMessageTime = Date.now();

        try {

            if (STOP) return;

            if (!Buffer.isBuffer(data)) return;

            if (!SESSION) {

                const found = extractSession(data);

                if (found) {

                    SESSION = found;

                    console.log(
                        `[W${workerId}] 🎯 SESSION DETECTED: ${SESSION}`
                    );

                    if (LAST_BALANCE < 1) {

                        console.log(
                            `[W${workerId}] 🛑 STOP: Balance below 1`
                        );

                        STOP = true;
                        ws.close();
                        return;
                    }

                    if (LAST_BALANCE >= 600) {

                        console.log(
                            `[W${workerId}] 🎉 STOP: Balance >= 600`
                        );

                        STOP = true;
                        ws.close();
                        return;
                    }

                    const betValue = getBestBet(LAST_BALANCE);

                    const bet = buildBet(
                        SESSION,
                        betValue,
                        3,
                        1
                    );

                    ws.send(bet);

                    WAITING_RESULT = true;

                    console.log(
                        `[W${workerId}] 📤 FIRST BET: ${betValue}`
                    );
                }
            }

            if (!SESSION || STOP || !WAITING_RESULT)
                return;

            const balance = extractBalance(
                data,
                SESSION
            );

            if (balance === null) return;

            console.log(
                `[W${workerId}] 💰 WS BALANCE: ${balance}`
            );

            if (balance !== LAST_BALANCE) {

                const profit = +(
                    balance - LAST_BALANCE
                ).toFixed(2);

                console.log(
                    `[W${workerId}] 📊 RESULT:`,
                    profit > 0 ? "WIN" : "LOSS"
                );

                LAST_BALANCE = balance;

                WAITING_RESULT = false;

                if (balance < 1 || balance >= 600) {

                    if (balance >= 600) {

                        console.log(
                            `[W${workerId}] 🎉 TARGET REACHED: ${balance}`
                        );

                        await saveAccount(username);

                        console.log(
                            `[W${workerId}] 💾 Saved account: ${username}`
                        );
                    }

                    STOP = true;

                    ws.close();

                    return;
                }

                setTimeout(() => {

                    if (!STOP) {

                        const betValue =
                            getBestBet(LAST_BALANCE);

                        ws.send(
                            buildBet(
                                SESSION,
                                betValue,
                                3,
                                1
                            )
                        );

                        WAITING_RESULT = true;

                        console.log(
                            `[W${workerId}] 📤 NEXT BET: ${betValue}`
                        );
                    }

                }, 500);
            }

        } catch (e) {

            console.log(
                `[W${workerId}] ⚠️ Decode error`,
                e.message
            );
        }
    });

    // -----------------------------------
    // CLOSE
    // -----------------------------------

    ws.on("close", () => {

        clearInterval(monitor);

        console.log(
            `[W${workerId}] WebSocket closed`
        );

        resolve();
    });

    // -----------------------------------
    // ERROR
    // -----------------------------------

    ws.on("error", (err) => {

        console.error(
            `[W${workerId}] WS error:`,
            err
        );

        ws.close();

        resolve();
    });

});

}
	try {
    await run();
} finally {

    console.log(
        `[W${workerId}] ✅ Worker finished`
    );

    await page.close();

    await browser.close();
}
}



const WORKERS = 20;


async function workerLoop(workerId) {

    while (true) {

        try {

            const acc = await getNextAccount();

            if (!acc) {

                console.log(
                    `[W${workerId}] ❌ No accounts left`
                );

                break;
            }

            await runWorker(workerId, acc);

        } catch (err) {

            console.log(
                `[W${workerId}] ❌ Worker crashed:`,
                err.message
            );
        }

        await delay(1000);
    }

    console.log(
        `[W${workerId}] ✅ LOOP FINISHED`
    );
}

async function main() {

    const tasks = [];

    for (let i = 0; i < WORKERS; i++) {
        tasks.push(workerLoop(i + 1));
        await delay(1000); // stagger
    }

    await Promise.allSettled(tasks);

    console.log("✅ ALL WORKERS DONE");
	await delay(2000)
}


main();