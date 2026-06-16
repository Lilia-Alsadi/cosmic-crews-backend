const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

router.use(authenticateToken);
router.use(requireAdmin);

router.get("/stats", async (req, res, next) => {
  try {
    const usersCount = await db.query("SELECT COUNT(*) FROM users");
    const crewsCount = await db.query("SELECT COUNT(*) FROM crews");
    const logsCount = await db.query("SELECT COUNT(*) FROM observations");

    const activeUsersCount = await db.query("SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '24 hours'");

    res.json({
      total_users: parseInt(usersCount.rows[0].count),
      total_crews: parseInt(crewsCount.rows[0].count),
      total_logs: parseInt(logsCount.rows[0].count),
      active_users_last_24h: parseInt(activeUsersCount.rows[0].count),
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/crews/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query("DELETE FROM crews WHERE id = $1", [id]);
    res.json({ message: "Crew successfully deleted by admin." });
  } catch (err) {
    next(err);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const result = await db.query("SELECT id, email, username, full_name, avatar_url, role, status, created_at FROM users ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.put("/users/:id/status", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["ACTIVE", "BANNED"].includes(status)) {
      return res.status(400).json({ message: "Invalid status. Must be ACTIVE or BANNED." });
    }

    const result = await db.query("UPDATE users SET status = $1 WHERE id = $2 RETURNING id, username, status", [status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete("/users/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query("DELETE FROM users WHERE id = $1", [id]);
    res.json({ message: "User completely deleted by admin." });
  } catch (err) {
    next(err);
  }
});

router.get("/flagged-items", async (req, res, next) => {
  try {
    const obsResult = await db.query(`
            SELECT o.*, u.username, 'observation' as item_type 
            FROM observations o
            JOIN users u ON o.user_id = u.id
            WHERE o.is_flagged = true
        `);
    const commentsResult = await db.query(`
            SELECT c.*, u.username, 'comment' as item_type, o.title as observation_title 
            FROM comments c
            JOIN users u ON c.user_id = u.id
            JOIN observations o ON c.observation_id = o.id
            WHERE c.is_flagged = true
        `);

    const combined = [...obsResult.rows, ...commentsResult.rows];
    combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(combined);
  } catch (err) {
    next(err);
  }
});

router.delete("/observations/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query("DELETE FROM observations WHERE id = $1 RETURNING id", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Observation log not found." });
    }

    res.json({ message: "Observation successfully deleted by admin." });
  } catch (err) {
    next(err);
  }
});

router.put("/observations/:id/dismiss", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query("UPDATE observations SET is_flagged = FALSE, flags_count = 0 WHERE id = $1 RETURNING id", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Observation log not found." });
    }

    res.json({ message: "Flag dismissed." });
  } catch (err) {
    next(err);
  }
});

router.delete("/comments/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query("DELETE FROM comments WHERE id = $1 RETURNING id", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Comment not found." });
    }

    res.json({ message: "Comment successfully deleted by admin." });
  } catch (err) {
    next(err);
  }
});

router.put("/comments/:id/dismiss", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query("UPDATE comments SET is_flagged = FALSE, flags_count = 0 WHERE id = $1 RETURNING id", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Comment not found." });
    }

    res.json({ message: "Flag dismissed." });
  } catch (err) {
    next(err);
  }
});

router.get("/crews", async (req, res, next) => {
  try {
    const result = await db.query(`
            SELECT c.*, u.username as owner_username,
                   (SELECT COUNT(*) FROM crew_members cm WHERE cm.crew_id = c.id AND cm.role != 'pending')::int as member_count,
                   (SELECT COUNT(*) FROM observations o WHERE o.user_id IN (SELECT user_id FROM crew_members WHERE crew_id = c.id))::int as log_count
            FROM crews c
            LEFT JOIN users u ON c.owner_id = u.id
            ORDER BY c.created_at DESC
        `);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.put("/crews/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, location, badge_url, cover_image_url, owner_username } = req.body;

    let newOwnerId = null;
    if (owner_username) {
      const userRes = await db.query("SELECT id FROM users WHERE username = $1", [owner_username]);
      if (userRes.rows.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      newOwnerId = userRes.rows[0].id;
    }

    await db.query("BEGIN");

    let updateQuery = `UPDATE crews 
             SET name = COALESCE($1, name), 
                 description = COALESCE($2, description), 
                 location = COALESCE($3, location), 
                 badge_url = COALESCE($4, badge_url),
                 cover_image_url = COALESCE($5, cover_image_url)`;
    let values = [name, description, location, badge_url, cover_image_url];

    if (newOwnerId) {
      updateQuery += `, owner_id = $6`;
      values.push(newOwnerId);
    }

    updateQuery += ` WHERE id = $${values.length + 1} RETURNING *`;
    values.push(id);

    const result = await db.query(updateQuery, values);

    if (result.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({ message: "Crew not found" });
    }

    if (newOwnerId) {
      await db.query(`UPDATE crew_members SET role = 'admin' WHERE crew_id = $1 AND role = 'owner'`, [id]);
      await db.query(
        `
                INSERT INTO crew_members (user_id, crew_id, role) 
                VALUES ($1, $2, 'owner') 
                ON CONFLICT (user_id, crew_id) 
                DO UPDATE SET role = 'owner'
            `,
        [newOwnerId, id],
      );
    }

    await db.query("COMMIT");

    const finalCrew = result.rows[0];
    if (owner_username) finalCrew.owner_username = owner_username;

    res.json(finalCrew);
  } catch (err) {
    await db.query("ROLLBACK");
    next(err);
  }
});

router.get("/crews/:id/events", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `
            SELECT e.*, u.username as creator_username
            FROM events e
            LEFT JOIN users u ON e.creator_id = u.id
            WHERE e.crew_id = $1
            ORDER BY e.start_time DESC
        `,
      [id],
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.put("/events/:eventId", async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { title, description, location, start_time, end_time, max_attendees } = req.body;

    const result = await db.query(
      `UPDATE events 
             SET title = COALESCE($1, title), 
                 description = COALESCE($2, description), 
                 location = COALESCE($3, location), 
                 start_time = COALESCE($4, start_time), 
                 end_time = COALESCE($5, end_time),
                 max_attendees = $6
             WHERE id = $7 RETURNING *`,
      [title, description, location, start_time, end_time, max_attendees === undefined ? null : max_attendees, eventId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Event not found." });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete("/events/:eventId", async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const result = await db.query("DELETE FROM events WHERE id = $1 RETURNING id", [eventId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Event not found." });
    }
    res.json({ message: "Event successfully deleted by admin." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
