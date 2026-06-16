const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");

const checkCrewRole = async (userId, crewId) => {
  const res = await db.query("SELECT role FROM crew_members WHERE user_id = $1 AND crew_id = $2", [userId, crewId]);
  return res.rows.length ? res.rows[0].role : null;
};

router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const result = await db.query(
      `
            SELECT c.*, 
                   (SELECT role FROM crew_members WHERE crew_id = c.id AND user_id = $1) as current_user_role,
                   (SELECT COUNT(*) FROM crew_members cm WHERE cm.crew_id = c.id AND cm.role != 'pending')::int as member_count,
                   (SELECT COUNT(*) FROM observations o WHERE o.user_id IN (SELECT user_id FROM crew_members WHERE crew_id = c.id))::int as log_count
            FROM crews c
        `,
      [req.user.id],
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", authenticateToken, async (req, res, next) => {
  try {
    const { name, description, location, badge_url } = req.body;

    await db.query("BEGIN");

    const insertCrew = await db.query(
      `INSERT INTO crews (name, description, location, badge_url, owner_id)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, description, location, badge_url || null, req.user.id],
    );

    const newCrew = insertCrew.rows[0];

    await db.query(`INSERT INTO crew_members (user_id, crew_id, role) VALUES ($1, $2, 'owner')`, [req.user.id, newCrew.id]);

    await db.query("COMMIT");

    res.status(201).json(newCrew);
  } catch (err) {
    await db.query("ROLLBACK");
    next(err);
  }
});

router.get("/:id", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const crewQuery = await db.query(
      `
            SELECT c.*, u.username as owner_username, u.id as owner_id,
                   (SELECT COUNT(*) FROM crew_members cm WHERE cm.crew_id = c.id AND cm.role != 'pending')::int as member_count,
                   (SELECT COUNT(*) FROM observations o WHERE o.user_id IN (SELECT user_id FROM crew_members WHERE crew_id = c.id))::int as log_count
            FROM crews c
            LEFT JOIN users u ON c.owner_id = u.id
            WHERE c.id = $1
        `,
      [id],
    );

    if (crewQuery.rows.length === 0) {
      return res.status(404).json({ message: "Crew not found" });
    }

    const crew = crewQuery.rows[0];
    const role = await checkCrewRole(req.user.id, id);

    const responseCrew = {
      ...crew,
      owner: {
        id: crew.owner_id,
        username: crew.owner_username,
      },
      current_user_role: role,
    };
    delete responseCrew.owner_username;

    res.json(responseCrew);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, location, badge_url, cover_image_url } = req.body;

    const role = await checkCrewRole(req.user.id, id);
    if (role !== "owner" && role !== "admin") {
      return res.status(403).json({ message: "Not authorized to update crew." });
    }

    const result = await db.query(
      `UPDATE crews 
             SET name = COALESCE($1, name), 
                 description = COALESCE($2, description), 
                 location = COALESCE($3, location),
                 badge_url = COALESCE($4, badge_url),
                 cover_image_url = COALESCE($5, cover_image_url)
             WHERE id = $6 RETURNING *`,
      [name, description, location, badge_url, cover_image_url, id],
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = await checkCrewRole(req.user.id, id);
    if (role !== "owner") {
      return res.status(403).json({ message: "Only the owner can delete the crew." });
    }

    await db.query("DELETE FROM crews WHERE id = $1", [id]);
    res.json({ message: "Crew successfully deleted." });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/members", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = await checkCrewRole(req.user.id, id);
    if (!role || role === "pending") {
      return res.status(403).json({ message: "Must be a member." });
    }

    const result = await db.query(
      `
            SELECT cm.user_id, cm.crew_id, cm.role, cm.joined_at, 
                   u.username, u.avatar_url, u.full_name
            FROM crew_members cm
            JOIN users u ON cm.user_id = u.id
            WHERE cm.crew_id = $1
        `,
      [id],
    );

    const members = result.rows.map((r) => ({
      user_id: r.user_id,
      crew_id: r.crew_id,
      role: r.role,
      joined_at: r.joined_at,
      user: {
        username: r.username,
        avatar_url: r.avatar_url,
        full_name: r.full_name,
      },
    }));

    res.json(members);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/members", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const roleToAssign = "pending";

    const result = await db.query(
      `INSERT INTO crew_members (user_id, crew_id, role) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (user_id, crew_id) DO NOTHING 
             RETURNING user_id, crew_id, role, joined_at`,
      [req.user.id, id, roleToAssign],
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Already requested or joined." });
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put("/:id/members/:userId", authenticateToken, async (req, res, next) => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body;

    const myRole = await checkCrewRole(req.user.id, id);
    if (myRole !== "owner" && myRole !== "admin") {
      return res.status(403).json({ message: "Not authorized." });
    }

    const result = await db.query(`UPDATE crew_members SET role = $1 WHERE crew_id = $2 AND user_id = $3 RETURNING user_id, crew_id, role`, [role, id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Membership not found." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id/members/:userId", authenticateToken, async (req, res, next) => {
  try {
    const { id, userId } = req.params;

    if (req.user.id.toString() !== userId) {
      const myRole = await checkCrewRole(req.user.id, id);
      if (myRole !== "owner" && myRole !== "admin") {
        return res.status(403).json({ message: "Not authorized." });
      }
    }

    const leavingUserRole = await checkCrewRole(userId, id);
    if (leavingUserRole === "owner") {
      await db.query(`DELETE FROM crews WHERE id = $1`, [id]);
      return res.json({ message: "Owner left, crew deleted successfully." });
    }

    await db.query(`DELETE FROM crew_members WHERE crew_id = $1 AND user_id = $2`, [id, userId]);

    res.json({ message: "User removed from crew successfully." });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/observations", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `
            SELECT o.*, u.username, u.avatar_url,
                   (SELECT COUNT(*) FROM observation_likes ol WHERE ol.observation_id = o.id)::int as likes_count,
                   (SELECT COUNT(*) FROM comments c WHERE c.observation_id = o.id)::int as comments_count,
                   EXISTS(SELECT 1 FROM observation_likes ol_viewer WHERE ol_viewer.observation_id = o.id AND ol_viewer.user_id = $2) as has_liked
            FROM observations o
            JOIN users u ON o.user_id = u.id
            WHERE o.user_id IN (SELECT user_id FROM crew_members WHERE crew_id = $1)
            ORDER BY o.created_at DESC
        `,
      [id, req.user.id],
    );

    const logs = result.rows.map((r) => {
      const { username, avatar_url, ...logData } = r;
      return {
        ...logData,
        user: { username, avatar_url },
      };
    });

    res.json(logs);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/events", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `
            SELECT e.*, 
                   (SELECT COUNT(*) FROM event_rsvps er WHERE er.event_id = e.id AND er.status = 'attending')::int as attendee_count
            FROM events e
            WHERE e.crew_id = $1
            ORDER BY e.start_time ASC
        `,
      [id],
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/events", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, location, start_time, end_time, max_attendees } = req.body;

    const role = await checkCrewRole(req.user.id, id);
    if (role !== "owner" && role !== "admin") {
      return res.status(403).json({ message: "Not authorized to create events." });
    }

    const result = await db.query(
      `
            INSERT INTO events (crew_id, creator_id, title, description, location, start_time, end_time, max_attendees)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `,
      [id, req.user.id, title, description, location, start_time, end_time, max_attendees || null],
    );

    res.status(201).json({
      ...result.rows[0],
      attendee_count: 0,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
