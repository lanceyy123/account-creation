import jwt from "jsonwebtoken";
import "dotenv/config";

export function auth(req,res,next){

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

        req.user = decoded;

        next();

    }catch{

        return res.status(401).json({
            success:false,
            error:"Invalid token"
        });

    }

}