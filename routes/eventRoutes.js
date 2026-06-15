const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// POST /api/events/:eventId/rsvp
router.post('/:eventId/rsvp', authenticateToken, async (req, res, next) => {
    try {
        const { eventId } = req.params;
        const { status } = req.body; 

        const eventQuery = await db.query('SELECT crew_id FROM events WHERE id = $1', [eventId]);
        if (eventQuery.rows.length === 0) {
            return res.status(404).json({ message: "Event not found." });
        }
        const crewId = eventQuery.rows[0].crew_id;

        const roleQuery = await db.query('SELECT role FROM crew_members WHERE user_id = $1 AND crew_id = $2', [req.user.id, crewId]);
        const role = roleQuery.rows.length ? roleQuery.rows[0].role : null;

        if (!role || role === 'pending') {
            return res.status(403).json({ message: "Must be a crew member to RSVP." });
        }

        const result = await db.query(
            `INSERT INTO event_rsvps (user_id, event_id, status)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, event_id)
             DO UPDATE SET status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [req.user.id, eventId, status || 'attending']
        );

        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
