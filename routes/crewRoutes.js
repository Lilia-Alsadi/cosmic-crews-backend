const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const checkCrewRole = async (userId, crewId) => {
    const res = await db.query('SELECT role FROM crew_members WHERE user_id = $1 AND crew_id = $2', [userId, crewId]);
    return res.rows.length ? res.rows[0].role : null;
};

// GET /api/crews
router.get('/', async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM crew_members cm WHERE cm.crew_id = c.id AND cm.role != 'pending')::int as member_count,
                   (SELECT COUNT(*) FROM observations o WHERE o.crew_id = c.id)::int as log_count
            FROM crews c
            WHERE c.is_public = true
        `);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// POST /api/crews
router.post('/', authenticateToken, async (req, res, next) => {
    try {
        const { name, description, location, is_public } = req.body;
        
        await db.query('BEGIN');
        
        const insertCrew = await db.query(
            `INSERT INTO crews (name, description, location, is_public, owner_id)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, description, location, is_public !== undefined ? is_public : true, req.user.id]
        );
        
        const newCrew = insertCrew.rows[0];
        
        await db.query(
            `INSERT INTO crew_members (user_id, crew_id, role) VALUES ($1, $2, 'owner')`,
            [req.user.id, newCrew.id]
        );
        
        await db.query('COMMIT');
        
        res.status(201).json(newCrew);
    } catch (err) {
        await db.query('ROLLBACK');
        next(err);
    }
});

// GET /api/crews/:id
router.get('/:id', authenticateToken, async (req, res, next) => {
    try {
        const { id } = req.params;
        const crewQuery = await db.query(`
            SELECT c.*, u.username as owner_username, u.id as owner_id,
                   (SELECT COUNT(*) FROM crew_members cm WHERE cm.crew_id = c.id AND cm.role != 'pending')::int as member_count,
                   (SELECT COUNT(*) FROM observations o WHERE o.crew_id = c.id)::int as log_count
            FROM crews c
            LEFT JOIN users u ON c.owner_id = u.id
            WHERE c.id = $1
        `, [id]);
        
        if (crewQuery.rows.length === 0) {
            return res.status(404).json({ message: "Crew not found" });
        }
        
        const crew = crewQuery.rows[0];
        const role = await checkCrewRole(req.user.id, id);
        
        if (!crew.is_public && (!role || role === 'pending')) {
            return res.status(403).json({ message: "Private crew, members only." });
        }

        const responseCrew = {
            ...crew,
            owner: {
                id: crew.owner_id,
                username: crew.owner_username
            },
            current_user_role: role
        };
        delete responseCrew.owner_username;
        
        res.json(responseCrew);
    } catch (err) {
        next(err);
    }
});

// PUT /api/crews/:id
router.put('/:id', authenticateToken, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, description, location, is_public } = req.body;
        
        const role = await checkCrewRole(req.user.id, id);
        if (role !== 'owner' && role !== 'admin') {
            return res.status(403).json({ message: "Not authorized to update crew." });
        }

        const result = await db.query(
            `UPDATE crews 
             SET name = COALESCE($1, name), 
                 description = COALESCE($2, description), 
                 location = COALESCE($3, location), 
                 is_public = COALESCE($4, is_public)
             WHERE id = $5 RETURNING *`,
            [name, description, location, is_public, id]
        );
        
        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// GET /api/crews/:id/members
router.get('/:id/members', authenticateToken, async (req, res, next) => {
    try {
        const { id } = req.params;
        const role = await checkCrewRole(req.user.id, id);
        if (!role || role === 'pending') {
            return res.status(403).json({ message: "Must be a member." });
        }

        const result = await db.query(`
            SELECT cm.user_id, cm.crew_id, cm.role, cm.joined_at, 
                   u.username, u.avatar_url, u.full_name
            FROM crew_members cm
            JOIN users u ON cm.user_id = u.id
            WHERE cm.crew_id = $1
        `, [id]);

        const members = result.rows.map(r => ({
            user_id: r.user_id,
            crew_id: r.crew_id,
            role: r.role,
            joined_at: r.joined_at,
            user: {
                username: r.username,
                avatar_url: r.avatar_url,
                full_name: r.full_name
            }
        }));

        res.json(members);
    } catch (err) {
        next(err);
    }
});

// POST /api/crews/:id/members
router.post('/:id/members', authenticateToken, async (req, res, next) => {
    try {
        const { id } = req.params;
        const crewQuery = await db.query('SELECT is_public FROM crews WHERE id = $1', [id]);
        
        if (crewQuery.rows.length === 0) {
            return res.status(404).json({ message: "Crew not found" });
        }
        
        const isPublic = crewQuery.rows[0].is_public;
        const roleToAssign = isPublic ? 'member' : 'pending';

        const result = await db.query(
            `INSERT INTO crew_members (user_id, crew_id, role) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (user_id, crew_id) DO NOTHING 
             RETURNING user_id, crew_id, role, joined_at`,
            [req.user.id, id, roleToAssign]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: "Already requested or joined." });
        }

        res.status(201).json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// PUT /api/crews/:id/members/:userId
router.put('/:id/members/:userId', authenticateToken, async (req, res, next) => {
    try {
        const { id, userId } = req.params;
        const { role } = req.body;
        
        const myRole = await checkCrewRole(req.user.id, id);
        if (myRole !== 'owner' && myRole !== 'admin') {
            return res.status(403).json({ message: "Not authorized." });
        }

        const result = await db.query(
            `UPDATE crew_members SET role = $1 WHERE crew_id = $2 AND user_id = $3 RETURNING user_id, crew_id, role`,
            [role, id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Membership not found." });
        }

        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/crews/:id/members/:userId
router.delete('/:id/members/:userId', authenticateToken, async (req, res, next) => {
    try {
        const { id, userId } = req.params;
        
        if (req.user.id.toString() !== userId) {
            const myRole = await checkCrewRole(req.user.id, id);
            if (myRole !== 'owner' && myRole !== 'admin') {
                return res.status(403).json({ message: "Not authorized." });
            }
        }

        await db.query(`DELETE FROM crew_members WHERE crew_id = $1 AND user_id = $2`, [id, userId]);
        
        res.json({ message: "User removed from crew successfully." });
    } catch (err) {
        next(err);
    }
});

// GET /api/crews/:id/logs
router.get('/:id/logs', authenticateToken, async (req, res, next) => {
    try {
        const { id } = req.params;
        
        const crewQuery = await db.query('SELECT is_public FROM crews WHERE id = $1', [id]);
        if (crewQuery.rows.length === 0) return res.status(404).json({ message: "Crew not found" });
        if (!crewQuery.rows[0].is_public) {
            const role = await checkCrewRole(req.user.id, id);
            if (!role || role === 'pending') return res.status(403).json({ message: "Members only." });
        }

        const result = await db.query(`
            SELECT o.*, u.username, u.avatar_url,
                   (SELECT COUNT(*) FROM observation_likes ol WHERE ol.observation_id = o.id)::int as likes_count,
                   (SELECT COUNT(*) FROM comments c WHERE c.observation_id = o.id)::int as comments_count
            FROM observations o
            JOIN users u ON o.user_id = u.id
            WHERE o.crew_id = $1
            ORDER BY o.created_at DESC
        `, [id]);

        const logs = result.rows.map(r => {
            const { username, avatar_url, ...logData } = r;
            return {
                ...logData,
                user: { username, avatar_url }
            };
        });

        res.json(logs);
    } catch (err) {
        next(err);
    }
});

// POST /api/crews/:id/logs
router.post('/:id/logs', authenticateToken, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { title, content, target_object, equipment_used, image_url } = req.body;
        
        const role = await checkCrewRole(req.user.id, id);
        if (!role || role === 'pending') return res.status(403).json({ message: "Must be a member to post." });

        const result = await db.query(`
            INSERT INTO observations (crew_id, user_id, title, content, target_object, equipment_used, image_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [id, req.user.id, title, content, target_object, equipment_used, image_url]);

        const newLog = result.rows[0];
        
        const userQuery = await db.query('SELECT username, avatar_url FROM users WHERE id = $1', [req.user.id]);
        const user = userQuery.rows[0];

        res.status(201).json({
            ...newLog,
            user,
            likes_count: 0,
            comments_count: 0
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/crews/:id/events
router.get('/:id/events', authenticateToken, async (req, res, next) => {
    try {
        const { id } = req.params;
        
        const crewQuery = await db.query('SELECT is_public FROM crews WHERE id = $1', [id]);
        if (crewQuery.rows.length === 0) return res.status(404).json({ message: "Crew not found" });
        if (!crewQuery.rows[0].is_public) {
            const role = await checkCrewRole(req.user.id, id);
            if (!role || role === 'pending') return res.status(403).json({ message: "Members only." });
        }

        const result = await db.query(`
            SELECT e.*, 
                   (SELECT COUNT(*) FROM event_rsvps er WHERE er.event_id = e.id AND er.status = 'attending')::int as attendee_count
            FROM events e
            WHERE e.crew_id = $1
            ORDER BY e.start_time ASC
        `, [id]);

        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// POST /api/crews/:id/events
router.post('/:id/events', authenticateToken, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { title, description, location, start_time, end_time } = req.body;
        
        const role = await checkCrewRole(req.user.id, id);
        if (role !== 'owner' && role !== 'admin') {
            return res.status(403).json({ message: "Not authorized to create events." });
        }

        const result = await db.query(`
            INSERT INTO events (crew_id, creator_id, title, description, location, start_time, end_time)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [id, req.user.id, title, description, location, start_time, end_time]);

        res.status(201).json({
            ...result.rows[0],
            attendee_count: 0
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
