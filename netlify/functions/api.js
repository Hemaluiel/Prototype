const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const serverless = require("serverless-http");

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

// DATABASE 

let db;

function getDB() {
    if (db) return db;

    db = mysql.createConnection({
        host: process.env.MYSQLHOST,
        user: process.env.MYSQLUSER,
        password: process.env.MYSQLPASSWORD,
        database: process.env.MYSQLDATABASE,
        port: parseInt(process.env.MYSQLPORT),
        ssl: { rejectUnauthorized: false }   
    });

    db.connect(err => {
        if (err) {
            console.error("DB connect error:", err);
            db = null;
        } else {
            console.log("Connected to MySQL");

            db.query(`
                CREATE TABLE IF NOT EXISTS pockets (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100),
                    amount DECIMAL(15,2),
                    start DATE,
                    duration INT,
                    type ENUM('days','months','years')
                )
            `, err => {
                if (err) console.error("Table create error:", err);
            });
        }
    });

    return db;
}


// BALANCE

app.get("/balance", (req, res) => {
    getDB().query("SELECT balance FROM main_account WHERE id = 1", (err, data) => {
        if (err) return res.status(500).send(err.message);
        if (!data.length) return res.status(404).send("Account not found");
        res.json({ balance: parseFloat(data[0].balance) });
    });
});


// POCKETS

app.get("/pockets", (req, res) => {
    getDB().query("SELECT * FROM pockets ORDER BY id ASC", (err, data) => {
        if (err) return res.status(500).send(err.message);
        res.json(data);
    });
});

app.get("/pockets/:id", (req, res) => {
    getDB().query("SELECT * FROM pockets WHERE id = ?", [req.params.id], (err, data) => {
        if (err) return res.status(500).send(err.message);
        if (!data.length) return res.status(404).send("Pocket not found");
        res.json(data[0]);
    });
});

app.post("/pockets", (req, res) => {
    const { name, amount, start, duration, type } = req.body;
    if (!name || !amount || !start || !duration || !type)
        return res.status(400).send("Missing required fields");

    getDB().query(
        "INSERT INTO pockets (name, amount, start, duration, type) VALUES (?, ?, ?, ?, ?)",
        [name, parseFloat(amount), start, parseInt(duration), type],
        (err, result) => {
            if (err) return res.status(500).send("Error creating pocket");
            res.json({ success: true, id: result.insertId });
        }
    );
});

app.put("/pockets/:id", (req, res) => {
    const { name, amount, start, duration, type } = req.body;
    if (!name || !amount || !start || !duration || !type)
        return res.status(400).send("Missing required fields");

    getDB().query(
        "UPDATE pockets SET name=?, amount=?, start=?, duration=?, type=? WHERE id=?",
        [name, parseFloat(amount), start, parseInt(duration), type, req.params.id],
        (err) => {
            if (err) return res.status(500).send("Update failed");
            res.json({ success: true });
        }
    );
});

app.delete("/pockets/:id", (req, res) => {
    getDB().query("DELETE FROM pockets WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).send(err.message);
        res.json({ success: true });
    });
});


// TRANSFER 

app.post("/transfer", (req, res) => {
    const { amount, category, receiverAccount, source } = req.body;

    if (!amount || !category || !receiverAccount || !source)
        return res.status(400).send("Missing required fields");

    const amountNum = parseFloat(amount);
    if (amountNum <= 0) return res.status(400).send("Invalid amount");

    const deductSQL = source === "main"
        ? "UPDATE main_account SET balance = balance - ? WHERE id = 1"
        : "UPDATE pockets SET amount = amount - ? WHERE id = ?";

    const deductValues = source === "main"
        ? [amountNum]
        : [amountNum, parseInt(source)];

    const conn = getDB();

    conn.beginTransaction(err => {
        if (err) return res.status(500).send("Transaction start failed");

        conn.query(deductSQL, deductValues, err => {
            if (err) return conn.rollback(() => res.status(500).send("Deduct failed"));

            conn.query(
                "INSERT INTO transactions (amount, category, receiver_account, source, date) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                [amountNum, category, receiverAccount, source],
                err2 => {
                    if (err2) return conn.rollback(() => res.status(500).send("Insert failed"));

                    conn.commit(err3 => {
                        if (err3) return conn.rollback(() => res.status(500).send("Commit failed"));
                        res.json({ success: true });
                    });
                }
            );
        });
    });
});


// TRANSACTIONS 

app.get("/transactions/all", (req, res) => {
    getDB().query("SELECT * FROM transactions ORDER BY id DESC", (err, data) => {
        if (err) return res.status(500).send(err.message);
        res.json(data);
    });
});

app.get("/transactions/today", (req, res) => {
    getDB().query(
        "SELECT * FROM transactions WHERE DATE(date) = CURDATE() ORDER BY id DESC",
        (err, data) => {
            if (err) return res.status(500).send(err.message);
            res.json(data);
        }
    );
});

app.get("/transactions/date/:date", (req, res) => {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        return res.status(400).send("Invalid date format. Use YYYY-MM-DD");

    getDB().query(
        "SELECT * FROM transactions WHERE DATE(date) = ? ORDER BY id DESC",
        [date],
        (err, data) => {
            if (err) return res.status(500).send(err.message);
            res.json(data);
        }
    );
});

app.get("/dashboard", (req, res) => {
    const months = parseInt(req.query.months) || 3;

    getDB().query(
        "SELECT * FROM transactions WHERE date >= DATE_SUB(NOW(), INTERVAL ? MONTH) ORDER BY date ASC",
        [months],
        (err, data) => {
            if (err) return res.status(500).send(err.message);

            const grouped = {};
            data.forEach(t => {
                const d = new Date(t.date);
                if (isNaN(d)) return;
                const month = d.toISOString().slice(0, 7);
                if (!grouped[month]) grouped[month] = {};
                grouped[month][t.category] =
                    (grouped[month][t.category] || 0) + Number(t.amount);
            });

            res.json(grouped);
        }
    );
});


// EXPORT

module.exports.handler = serverless(app);
