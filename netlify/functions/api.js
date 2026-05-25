const mysql = require("mysql2/promise");

let db;

async function getDB() {
    if (db) return db;
    db = await mysql.createConnection({
        host: process.env.MYSQLHOST,
        user: process.env.MYSQLUSER,
        password: process.env.MYSQLPASSWORD,
        database: process.env.MYSQLDATABASE,
        port: parseInt(process.env.MYSQLPORT),
        ssl: { rejectUnauthorized: false }
    });
    return db;
}

exports.handler = async (event) => {
    const method = event.httpMethod;
    const path   = event.path
        .replace("/.netlify/functions/api", "")
        .replace("/api", "")
        .replace(/\/$/, "") || "/";

    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
    };

    if (method === "OPTIONS") return { statusCode: 200, headers, body: "" };

    let conn;
    try {
        conn = await getDB();
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "DB connection failed: " + err.message }) };
    }

    try {

        // GET /balance
        if (method === "GET" && path === "/balance") {
            const [rows] = await conn.query("SELECT balance FROM main_account WHERE id = 1");
            if (!rows.length) return { statusCode: 404, headers, body: "Account not found" };
            return { statusCode: 200, headers, body: JSON.stringify({ balance: parseFloat(rows[0].balance) }) };
        }

        // GET /pockets
        if (method === "GET" && path === "/pockets") {
            const [rows] = await conn.query("SELECT * FROM pockets ORDER BY id ASC");
            return { statusCode: 200, headers, body: JSON.stringify(rows) };
        }

        // GET /pockets/:id
        if (method === "GET" && path.match(/^\/pockets\/\d+$/)) {
            const id = path.split("/")[2];
            const [rows] = await conn.query("SELECT * FROM pockets WHERE id = ?", [id]);
            if (!rows.length) return { statusCode: 404, headers, body: "Pocket not found" };
            return { statusCode: 200, headers, body: JSON.stringify(rows[0]) };
        }

        // POST /pockets
        if (method === "POST" && path === "/pockets") {
            const { name, amount, start, duration, type } = JSON.parse(event.body);
            if (!name || !amount || !start || !duration || !type)
                return { statusCode: 400, headers, body: "Missing required fields" };
            const [result] = await conn.query(
                "INSERT INTO pockets (name, amount, start, duration, type) VALUES (?, ?, ?, ?, ?)",
                [name, parseFloat(amount), start, parseInt(duration), type]
            );
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, id: result.insertId }) };
        }

        // PUT /pockets/:id
        if (method === "PUT" && path.match(/^\/pockets\/\d+$/)) {
            const id = path.split("/")[2];
            const { name, amount, start, duration, type } = JSON.parse(event.body);
            if (!name || !amount || !start || !duration || !type)
                return { statusCode: 400, headers, body: "Missing required fields" };
            await conn.query(
                "UPDATE pockets SET name=?, amount=?, start=?, duration=?, type=? WHERE id=?",
                [name, parseFloat(amount), start, parseInt(duration), type, id]
            );
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        // DELETE /pockets/:id
        if (method === "DELETE" && path.match(/^\/pockets\/\d+$/)) {
            const id = path.split("/")[2];
            await conn.query("DELETE FROM pockets WHERE id = ?", [id]);
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        // POST /transfer
        if (method === "POST" && path === "/transfer") {
            const { amount, category, receiverAccount, source } = JSON.parse(event.body);
            if (!amount || !category || !receiverAccount || !source)
                return { statusCode: 400, headers, body: "Missing required fields" };

            const amountNum = parseFloat(amount);
            if (amountNum <= 0) return { statusCode: 400, headers, body: "Invalid amount" };

            if (source === "main") {
                await conn.query("UPDATE main_account SET balance = balance - ? WHERE id = 1", [amountNum]);
            } else {
                await conn.query("UPDATE pockets SET amount = amount - ? WHERE id = ?", [amountNum, parseInt(source)]);
            }

            await conn.query(
                "INSERT INTO transactions (amount, category, receiver_account, source, date) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                [amountNum, category, receiverAccount, source]
            );

            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        // GET /transactions/all
        if (method === "GET" && path === "/transactions/all") {
            const [rows] = await conn.query("SELECT * FROM transactions ORDER BY id DESC");
            return { statusCode: 200, headers, body: JSON.stringify(rows) };
        }

        // GET /transactions/today
        if (method === "GET" && path === "/transactions/today") {
            const [rows] = await conn.query(
                "SELECT * FROM transactions WHERE DATE(date) = CURDATE() ORDER BY id DESC"
            );
            return { statusCode: 200, headers, body: JSON.stringify(rows) };
        }

        // GET /transactions/date/:date
        if (method === "GET" && path.match(/^\/transactions\/date\/\d{4}-\d{2}-\d{2}$/)) {
            const date = path.split("/")[3];
            const [rows] = await conn.query(
                "SELECT * FROM transactions WHERE DATE(date) = ? ORDER BY id DESC", [date]
            );
            return { statusCode: 200, headers, body: JSON.stringify(rows) };
        }

        // GET /dashboard
        if (method === "GET" && path === "/dashboard") {
            const months = parseInt(event.queryStringParameters?.months) || 3;
            const [rows] = await conn.query(
                "SELECT * FROM transactions WHERE date >= DATE_SUB(NOW(), INTERVAL ? MONTH) ORDER BY date ASC",
                [months]
            );
            const grouped = {};
            rows.forEach(t => {
                const d = new Date(t.date);
                if (isNaN(d)) return;
                const month = d.toISOString().slice(0, 7);
                if (!grouped[month]) grouped[month] = {};
                grouped[month][t.category] = (grouped[month][t.category] || 0) + Number(t.amount);
            });
            return { statusCode: 200, headers, body: JSON.stringify(grouped) };
        }

        return { statusCode: 404, headers, body: JSON.stringify({ error: "Route not found: " + method + " " + path }) };

    } catch (err) {
        console.error("Handler error:", err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
