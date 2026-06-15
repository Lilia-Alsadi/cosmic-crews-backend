const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.use(authenticateToken);
router.use((req, res, next) => {
    if (req.user && (req.user.role === 'PLATFORM_ADMIN' || req.user.role === 'ADMIN' || req.user.role === 'admin')) {
        next();
    } else {
        return res.status(403).json({ message: "Platform Admin privileges required." });
    }
});

// GET /api/admin/stats
router.get('/stats', async (req, res, next) => {
    try {
        const usersCount = await db.query('SELECT COUNT(*) FROM users');
        const crewsCount = await db.query('SELECT COUNT(*) FROM crews');
        const logsCount = await db.query("SELECT COUNT(*) FROM observations WHERE created_at >= NOW() - INTERVAL '30 days'");
        
        const activeUsersCount = await db.query("SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '24 hours'");

        res.json({
            total_users: parseInt(usersCount.rows[0].count),
            total_crews: parseInt(crewsCount.rows[0].count),
            total_logs_last_30_days: parseInt(logsCount.rows[0].count),
            active_users_last_24h: parseInt(activeUsersCount.rows[0].count)
        });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/admin/crews/:id
router.delete('/crews/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM crews WHERE id = $1', [id]);
        res.json({ message: "Crew successfully deleted by admin." });
    } catch (err) {
        next(err);
    }
});

// GET /api/admin/users
router.get('/users', async (req, res, next) => {
    try {
        const result = await db.query('SELECT id, email, username, full_name, role, status, created_at FROM users ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// PUT /api/admin/users/:id/status
router.put('/users/:id/status', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['ACTIVE', 'BANNED'].includes(status)) {
            return res.status(400).json({ message: "Invalid status. Must be ACTIVE or BANNED." });
        }

        const result = await db.query(
            'UPDATE users SET status = $1 WHERE id = $2 RETURNING id, username, status',
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// GET /api/admin/flagged-logs
router.get('/flagged-logs', async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT o.*, u.username 
            FROM observations o
            JOIN users u ON o.user_id = u.id
            WHERE o.is_flagged = true
            ORDER BY o.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/admin/logs/:id
router.delete('/logs/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query('DELETE FROM observations WHERE id = $1 RETURNING id', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Observation log not found." });
        }

        res.json({ message: "Observation successfully deleted by admin." });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
