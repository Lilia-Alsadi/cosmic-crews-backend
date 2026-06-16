const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");

router.post("/:eventId/rsvp", authenticateToken, async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { status } = req.body;

    const eventQuery = await db.query("SELECT crew_id FROM events WHERE id = $1", [eventId]);
    if (eventQuery.rows.length === 0) {
      return res.status(404).json({ message: "Event not found." });
    }
    const crewId = eventQuery.rows[0].crew_id;

    const roleQuery = await db.query("SELECT role FROM crew_members WHERE user_id = $1 AND crew_id = $2", [req.user.id, crewId]);
    const role = roleQuery.rows.length ? roleQuery.rows[0].role : null;

    if (!role || role === "pending") {
      return res.status(403).json({ message: "Must be a crew member to RSVP." });
    }

    const result = await db.query(
      `INSERT INTO event_rsvps (user_id, event_id, status)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, event_id)
             DO UPDATE SET status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
      [req.user.id, eventId, status || "attending"],
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put("/:eventId", authenticateToken, async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { title, description, location, start_time, end_time, max_attendees } = req.body;

    const eventQuery = await db.query("SELECT crew_id, creator_id FROM events WHERE id = $1", [eventId]);
    if (eventQuery.rows.length === 0) {
      return res.status(404).json({ message: "Event not found." });
    }
    const { crew_id, creator_id } = eventQuery.rows[0];

    const roleQuery = await db.query("SELECT role FROM crew_members WHERE user_id = $1 AND crew_id = $2", [req.user.id, crew_id]);
    const role = roleQuery.rows.length ? roleQuery.rows[0].role : null;

    if (req.user.id !== creator_id && role !== "owner" && role !== "admin") {
      return res.status(403).json({ message: "Not authorized to update this event." });
    }

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

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete("/:eventId", authenticateToken, async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const eventQuery = await db.query("SELECT crew_id, creator_id FROM events WHERE id = $1", [eventId]);
    if (eventQuery.rows.length === 0) {
      return res.status(404).json({ message: "Event not found." });
    }
    const { crew_id, creator_id } = eventQuery.rows[0];

    const roleQuery = await db.query("SELECT role FROM crew_members WHERE user_id = $1 AND crew_id = $2", [req.user.id, crew_id]);
    const role = roleQuery.rows.length ? roleQuery.rows[0].role : null;

    if (req.user.id !== creator_id && role !== "owner" && role !== "admin") {
      return res.status(403).json({ message: "Not authorized to delete this event." });
    }

    await db.query("DELETE FROM events WHERE id = $1", [eventId]);
    res.json({ message: "Event successfully deleted." });
  } catch (err) {
    next(err);
  }
});

router.get("/:eventId/rsvps", authenticateToken, async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const eventQuery = await db.query("SELECT crew_id FROM events WHERE id = $1", [eventId]);
    if (eventQuery.rows.length === 0) {
      return res.status(404).json({ message: "Event not found." });
    }
    const crewId = eventQuery.rows[0].crew_id;

    const roleQuery = await db.query("SELECT role FROM crew_members WHERE user_id = $1 AND crew_id = $2", [req.user.id, crewId]);
    const role = roleQuery.rows.length ? roleQuery.rows[0].role : null;

    if (!role || role === "pending") {
      return res.status(403).json({ message: "Must be a crew member to view RSVPs." });
    }

    const result = await db.query(
      `
            SELECT er.user_id, er.status, er.updated_at,
                   u.username, u.avatar_url
            FROM event_rsvps er
            JOIN users u ON er.user_id = u.id
            WHERE er.event_id = $1
            ORDER BY er.updated_at DESC
        `,
      [eventId],
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
