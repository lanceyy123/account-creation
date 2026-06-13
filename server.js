import express from "express";
import cors from "cors";
import axios from "axios";
import { register } from "./register.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "./db.js";
import "dotenv/config";
import { SITES } from "./configs.js";
import rateLimit from "express-rate-limit";


const resendOtpMap = new Map();

const otpAttempts = new Map();
const app = express();
app.set("trust proxy", 1);
//const otpLimiter = rateLimit({
//    windowMs: 3 * 60 * 1000,
 //   max: 5,
  //  message: {
 //       success:false,
 //       error:"Too many requests"
 //   }
//});


if(process.env.MAINTENANCE_MODE === "true"){
    console.log("Maintenance mode");
    process.exit(0);
}




//app.use("/verify-otp", otpLimiter);
app.use(
    cors({
        origin: [
            "https://accountcreationlnc.netlify.app"
        ],
        methods: [
            "GET",
            "POST"
        ],
        credentials: false
    })
);
app.use(express.json());


app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "API Online"
    });
});



function auth(req, res, next){

    const token =
        req.headers.authorization;

    if(!token){

        return res.status(401).json({
            success:false,
            error:"No token"
        });

    }

    try{

        const decoded =
            jwt.verify(
                token,
                process.env.JWT_SECRET
            );

        req.userId =
            decoded.userId;

        next();

    }catch{

        return res.status(401).json({
            success:false,
            error:"Invalid token"
        });

    }

}

app.post("/register", auth, async (req, res) => {
try {
const result = await register(
    req.body.site,
    {
        mobile: req.body.mobile
    }
);
console.log("REGISTER RESULT:", result);

    res.json(result);

} catch (err) {

    console.error(err);

    res.status(
        err.response?.status || 500
    ).json({
        success: false,
        message:
            err.response?.data?.message ||
            err.response?.data?.msg ||
            err.message
    });

}

});

app.post("/verify-otp", async (req, res) => {
try {
const {
    site,
    mobile,
    otp,
    token
} = req.body;

const config = SITES[site];

if (!config) {
    return res.status(400).json({
        success: false,
        error: "Invalid site"
    });
}
console.log("VERIFY REQUEST:");
console.log("Mobile:", mobile);
console.log("OTP:", otp);
const key = `${mobile}_${site}`;

const data =
    otpAttempts.get(key) || {
        attempts: 0,
        blockedUntil: 0
    };

if(Date.now() < data.blockedUntil){

    return res.status(429).json({
        success:false,
        message:
            `Too many wrong OTP attempts. Try again in ${
                Math.ceil(
                    (data.blockedUntil - Date.now()) / 1000
                )
            } seconds.`
    });

}

    const response = await axios.post(
        `${config.siteUrl}/wps/v2/verification/sms/verify`,
		
        {
            countryDialingCode: "",
            mobileNum: mobile,
            verificationCode: otp
        },
        {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: token,
                Merchant: config.merchant,
                Language: "EN",
                ModuleId: "VERIFICATION3",
                Origin: config.siteUrl,
                Referer: `${config.siteUrl}/member`,
                "X-Requested-With": "XMLHttpRequest",
                "X-Timestamp": Date.now().toString()
            }
        }
    );
	console.log(
    "VERIFY RESPONSE:",
    JSON.stringify(response.data, null, 2)
);

console.log(
    "VERIFY OTP:",
    mobile,
    otp
);

if(response.data.success){
otpAttempts.delete(key);
    try{

        const ticketResponse = await axios.get(
            `${config.siteUrl}/wps/relay/PROMOFE_getClaimTicketList?isApp=N&status=AVAILABLE&isAll=N&_=${Date.now()}`,
            {
                headers:{
                    Authorization: token,
                    Merchant: config.merchant,
                    Language: "TY"
                }
            }
        );

        const registerBonus =
            ticketResponse.data.value.find(
                x => x.name === "Register Bonus"
            );

        if(registerBonus){

            const claimResponse =
                await axios.post(
                    `${config.siteUrl}/wps/relay/PROMOFE_claimTicket`,
                    {
                        transactionId:
                            registerBonus.transactionId,

                        isApp:"N"
                    },
                    {
                        headers:{
                            Authorization: token,
                            Merchant: config.merchant,
                            Language: "TY",
                            Origin: config.siteUrl,
                            Referer: `${config.siteUrl}/index`
                        }
                    }
                );

            console.log(
                "BONUS CLAIMED:",
                claimResponse.data
            );

        }

    }catch(claimErr){

        console.error(
            "CLAIM ERROR:",
            claimErr.response?.data ||
            claimErr.message
        );

    }

}

res.json(response.data);

} catch (err) {

    const {
        site,
        mobile
    } = req.body;

    const key =
        `${mobile}_${site}`;

    const data =
        otpAttempts.get(key) || {
            attempts: 0,
            blockedUntil: 0
        };

    const apiError =
        err.response?.data;

    const errorText =
        JSON.stringify(apiError || "")
            .toLowerCase();

const status =
    err.response?.status;

if(
    status === 400 ||
    status === 401
){
    data.attempts++;

    if(data.attempts >= 3){

        data.attempts = 0;

        data.blockedUntil =
            Date.now() + (3 * 60 * 1000);

    }

    otpAttempts.set(key, data);
}
    return res.status(
        err.response?.status || 500
    ).json({
        success:false,
        message:
            apiError?.msg ||
            apiError?.message ||
            apiError?.error ||
            err.message,
        full: apiError
    });

}
});


app.post("/send-otp", async (req, res) => {

    try {

        const {
            site,
            mobile,
            token
        } = req.body;
const key = `${mobile}_${site}`;

const lastSent =
    resendOtpMap.get(key);

if(
    lastSent &&
    Date.now() - lastSent < 180000
){
    return res.status(429).json({
        success:false,
        error:"Please wait before requesting another OTP."
    });
}

resendOtpMap.set(
    key,
    Date.now()
);
        const config = SITES[site];

if (!config) {
    return res.status(400).json({
        success: false,
        error: "Invalid site"
    });
}

        const response = await axios.post(
            `${config.siteUrl}/wps/v2/verification/sms/send`,
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

                    Merchant: config.merchant,
                    Language: "EN",
                    ModuleId: "VERIFICATION3",

                    Origin: config.siteUrl,
                    Referer: `${config.siteUrl}/member`,

                    "X-Requested-With": "XMLHttpRequest",
                    "X-Timestamp": Date.now().toString()
                }
            }
        );

        res.json(response.data);

    } catch(err) {
        console.error(err);
        res.status(500).json({
            success:false,
            error:err.message
        });
    }

});

app.post("/register-user", async (req, res) => {

    try {

        const {
            username,
            password
        } = req.body;

        const existing =
            await db.query(
                `
                SELECT *
                FROM users
                WHERE username = $1
                `,
                [username]
            );

        if(existing.rows.length > 0){

            return res.json({
                success:false,
                error:"Username already exists"
            });

        }

        const hash =
            await bcrypt.hash(
                password,
                10
            );

        await db.query(
            `
            INSERT INTO users
            (
                username,
                password_hash
            )
            VALUES
            (
                $1,
                $2
            )
            `,
            [
                username,
                hash
            ]
        );

        res.json({
            success:true
        });

    } catch(err){

        console.error(err);

        res.status(500).json({
            success:false,
            error:err.message
        });

    }

});

app.post("/login", async (req, res) => {

    try {

        const {
            username,
            password
        } = req.body;

        const result =
            await db.query(
                `
                SELECT *
                FROM users
                WHERE username = $1
                `,
                [username]
            );

        if(result.rows.length === 0){

            return res.json({
                success:false,
                error:"User not found"
            });

        }

        const user =
            result.rows[0];

        const valid =
            await bcrypt.compare(
                password,
                user.password_hash
            );

        if(!valid){

            return res.json({
                success:false,
                error:"Wrong password"
            });

        }

        const token =
            jwt.sign(
                {
                    userId:user.id
                },
                process.env.JWT_SECRET,
                {
                    expiresIn:"30d"
                }
            );

        res.json({
            success:true,
            token,
            username:user.username
        });

    } catch(err){

        console.error(err);

        res.status(500).json({
            success:false,
            error:err.message
        });

    }

});

app.post("/save-account", auth, async (req, res) => {
console.log("SAVE ACCOUNT REQUEST");
console.log(req.body);
    try{

const {
    site,
    username,
    mobile,
    password
} = req.body;



const countResult = await db.query(`
    SELECT COUNT(*)
    FROM mvpph_accounts
`);

const totalAccounts =
    Number(countResult.rows[0].count);

if(totalAccounts >= 8000){

    return res.status(503).json({
        success:false,
        error:"Global account limit reached"
    });

}



const result = await db.query(
`
INSERT INTO mvpph_accounts
(
    user_id,
    site,
    username,
    mobile,
    password
)
VALUES
(
    $1,
    $2,
    $3,
    $4,
    $5
)
RETURNING *
`,
[
    req.userId,
    site,
    username,
    mobile,
    password
]
);

console.log("INSERTED:", result.rows[0]);
console.log("ACCOUNT SAVED");
        res.json({
            success:true
        });

    }catch(err){

        console.error(err);

        res.status(500).json({
            success:false,
            error:err.message
        });

    }

});

app.get("/accounts", auth, async (req, res) => {

    try{

        const result =
            await db.query(
                `
                SELECT *
                FROM mvpph_accounts
                WHERE user_id = $1
                AND downloaded = FALSE
                ORDER BY id DESC
                `,
                [req.userId]
            );

        res.json(result.rows);

    }catch(err){

        res.status(500).json({
            success:false,
            error:err.message
        });

    }

});

app.post("/create-account", auth, async (req,res)=>{

try{

    const {
        site,
        mobile
    } = req.body;

    const result =
        await register(
            site,
            {
                mobile
            }
        );

    res.json(result);

}catch(err){

    console.error(
        "CREATE ACCOUNT ERROR:",
        err.message
    );

    res.status(500).json({
        success:false,
        error:err.message
    });

}

});
app.get("/download-accounts", auth, async (req,res)=>{

    const result = await db.query(
        `
        SELECT *
        FROM mvpph_accounts
        WHERE user_id = $1
        `,
        [req.userId]
    );

    let txt = "";

    result.rows.forEach(acc => {

        txt +=
`Site: ${acc.site}
Username: ${acc.username}
Mobile: ${acc.mobile}

`;

    });

    res.setHeader(
        "Content-Type",
        "text/plain"
    );

    res.setHeader(
        "Content-Disposition",
        `attachment; filename=accounts-${Date.now()}.txt`
    );

    await db.query(
        `
        UPDATE mvpph_accounts
        SET downloaded = TRUE
        WHERE user_id = $1
        `,
        [req.userId]
    );

    res.send(txt);

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});