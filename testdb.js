import { db } from "./db.js";

console.log(
    "DATABASE_URL:",
    process.env.DATABASE_URL
);

try {

    const result = await db.query(
        "SELECT NOW()"
    );

    console.log(
        "Connected:",
        result.rows[0]
    );

} catch(err){

    console.error(err);

}