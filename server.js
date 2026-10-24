const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./chw_records.db', (err) => {
    if (err) console.error('Error opening database', err.message);
    else console.log('Connected to SQLite database.');
});

db.run(`CREATE TABLE IF NOT EXISTS health_visits (
    local_id TEXT PRIMARY KEY,
    chw_id TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    village_name TEXT NOT NULL,
    visit_type TEXT NOT NULL,
    vitals_bp TEXT,
    vitals_temp REAL,
    urgency_level TEXT NOT NULL,
    visit_notes TEXT,
    created_at_local TEXT NOT NULL,
    synced_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

app.post('/api/sync', (req, res) => {
    const records = Array.isArray(req.body) ? req.body : [req.body];
    if (records.length === 0) return res.status(400).json({ error: 'No records provided' });

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO health_visits 
            (local_id, chw_id, patient_name, village_name, visit_type, vitals_bp, vitals_temp, urgency_level, visit_notes, created_at_local) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let errors = [];
        records.forEach((record) => {
            stmt.run(
                record.local_id, record.chw_id, record.patient_name, record.village_name,
                record.visit_type, record.vitals_bp, record.vitals_temp, record.urgency_level,
                record.visit_notes || '', record.created_at_local,
                (err) => { if (err) errors.push({ local_id: record.local_id, error: err.message }); }
            );
        });

        stmt.finalize((err) => {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Transaction failed' });
            }
            db.run('COMMIT', (commitErr) => {
                if (commitErr) return res.status(500).json({ error: 'Commit failed' });
                res.json({ success: true, message: 'Sync processed successfully', errors });
            });
        });
    });
});

app.get('/api/records', (req, res) => {
    db.all('SELECT * FROM health_visits ORDER BY created_at_local DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));