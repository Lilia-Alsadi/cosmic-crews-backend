const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/users/me
router.get('/me', authenticateToken, async (req, res, next) => {
    try {
        const result = await db.query(
            `SELECT id, email, username, full_name, bio, location, avatar_url, equipment, created_at 
             FROM users 
             WHERE id = $1`, 
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// PUT /api/users/me
router.put('/me', authenticateToken, async (req, res, next) => {
    try {
        const { full_name, bio, location, equipment } = req.body;
        
        const result = await db.query(
            `UPDATE users 
             SET full_name = COALESCE($1, full_name), 
                 bio = COALESCE($2, bio), 
                 location = COALESCE($3, location), 
                 equipment = COALESCE($4, equipment)
             WHERE id = $5
             RETURNING id, email, username, full_name, bio, location, avatar_url, equipment, updated_at`,
            [
                full_name !== undefined ? full_name : null,
                bio !== undefined ? bio : null,
                location !== undefined ? location : null,
                equipment !== undefined ? JSON.stringify(equipment) : null,
                req.user.id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
