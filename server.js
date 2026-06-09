import express from "express";
import cors from "cors";
import axios from "axios";
import { register } from "./register.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "./db.js";
import "dotenv/config";
import { SITES } from "./configs.js";



const app = express();

app.use(cors());
app.use(express.json());


app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "API Online"
    });
});

app.get("/db-test", async (req, res) => {

    try {

        const result = await db.query(
            "SELECT NOW()"
        );

        res.json({
            success: true,
            time: result.rows[0]
        });

    } catch(err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

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

app.post("/register", async (req, res) => {
try {
const result = await register(
    req.body.site,
    {
        username: req.body.username,
        password: req.body.password,
        mobile: req.body.mobile
    }
);
console.log("REGISTER RESULT:", result);

    res.json(result);

} catch (err) {
    console.error(err);

    res.status(500).json({
        success: false,
        error: err.message
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
console.log("Token:", token);
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
    res.json(response.data);

} catch (err) {
    console.error(err.response?.data || err.message);

    res.status(500).json({
        success: false,
        error: err.response?.data || err.message
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

    try{

const {
    site,
    username,
    mobile,
    password
} = req.body;

await db.query(
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
`,
[
    req.userId,
    site,
    username,
    mobile,
    password
]
);

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

app.post("/create-account", async (req,res)=>{

    const {
        site,
        username,
        password,
        mobile
    } = req.body;

    const result =
        await register(
            site,
            {
                username,
                password,
                mobile
            }
        );

    res.json(result);

});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});