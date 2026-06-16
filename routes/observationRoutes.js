const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");

router.get("/", async (req, res, next) => {
  try {
    const { search, target, feed, viewer_id } = req.query;
    const activeUserIdFilter = req.query.user_id || req.query.userId;
    const viewerIdParam = viewer_id || -1;

    let queryText = `
            SELECT 
                o.*, 
                u.username, 
                u.avatar_url, 
                COUNT(DISTINCT ol.user_id)::int AS likes_count,
                COUNT(DISTINCT cmnt.id)::int AS comments_count,
                MAX(CASE WHEN ol_viewer.user_id IS NOT NULL THEN 1 ELSE 0 END) AS has_liked
            FROM observations o
            JOIN users u ON o.user_id = u.id
            LEFT JOIN observation_likes ol ON o.id = ol.observation_id
            LEFT JOIN comments cmnt ON o.id = cmnt.observation_id
            LEFT JOIN observation_likes ol_viewer ON o.id = ol_viewer.observation_id AND ol_viewer.user_id = $1
            WHERE 1=1
        `;

    const queryValues = [viewerIdParam];
    let paramIndex = 2;

    if (search) {
      queryText += ` AND (o.title ILIKE $${paramIndex} OR o.content ILIKE $${paramIndex})`;
      queryValues.push(`%${search}%`);
      paramIndex++;
    }

    if (target) {
      queryText += ` AND o.target_object = $${paramIndex}`;
      queryValues.push(target);
      paramIndex++;
    }

    if (feed === "following" && activeUserIdFilter) {
      queryText += ` AND o.user_id IN (SELECT user_id FROM crew_members WHERE crew_id IN (SELECT crew_id FROM crew_members WHERE user_id = $${paramIndex}))`;
      queryValues.push(activeUserIdFilter);
      paramIndex++;
    }

    if (activeUserIdFilter && feed !== "following" && feed !== "popular") {
      queryText += ` AND o.user_id = $${paramIndex}`;
      queryValues.push(activeUserIdFilter);
      paramIndex++;
    }

    queryText += ` 
            GROUP BY o.id, u.username, u.avatar_url 
        `;

    if (feed === "popular") {
      queryText += ` ORDER BY (COUNT(DISTINCT ol.user_id) + COUNT(DISTINCT cmnt.id)) DESC, o.created_at DESC`;
    } else {
      queryText += ` ORDER BY o.created_at DESC`;
    }

    const result = await db.query(queryText, queryValues);

    const logs = result.rows.map((row) => {
      const { username, avatar_url, likes_count, comments_count, has_liked, ...logData } = row;
      return {
        ...logData,
        likes_count,
        comments_count,
        has_liked: has_liked === 1,
        user: {
          username,
          avatar_url,
        },
      };
    });

    res.json(logs);
  } catch (err) {
    next(err);
  }
});
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const viewerIdParam = req.user ? req.user.id : -1;

    const queryText = `
            SELECT 
                o.*, 
                u.username, 
                u.avatar_url, 
                COUNT(DISTINCT ol.user_id)::int AS likes_count,
                COUNT(DISTINCT cmnt.id)::int AS comments_count,
                MAX(CASE WHEN ol_viewer.user_id IS NOT NULL THEN 1 ELSE 0 END) AS has_liked
            FROM observations o
            JOIN users u ON o.user_id = u.id
            LEFT JOIN observation_likes ol ON o.id = ol.observation_id
            LEFT JOIN comments cmnt ON o.id = cmnt.observation_id
            LEFT JOIN observation_likes ol_viewer ON o.id = ol_viewer.observation_id AND ol_viewer.user_id = $2
            WHERE o.id = $1
            GROUP BY o.id, u.username, u.avatar_url
        `;

    const result = await db.query(queryText, [id, viewerIdParam]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Observation not found" });
    }

    const { username, avatar_url, likes_count, comments_count, has_liked, ...logData } = result.rows[0];

    res.json({
      ...logData,
      likes_count,
      comments_count,
      has_liked: has_liked === 1,
      user: {
        username,
        avatar_url,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", authenticateToken, async (req, res, next) => {
  try {
    const { title, content, target_object, equipment_used, image_url, bortle_class, target_type, observation_date, location, transparency, seeing } = req.body;

    const result = await db.query(
      `
            INSERT INTO observations (user_id, title, content, target_object, equipment_used, image_url, bortle_class, target_type, observation_date, location, transparency, seeing)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `,
      [req.user.id, title, content, target_object, equipment_used, image_url, bortle_class, target_type, observation_date || null, location, transparency, seeing],
    );

    const newLog = result.rows[0];

    const userQuery = await db.query("SELECT username, avatar_url FROM users WHERE id = $1", [req.user.id]);
    const user = userQuery.rows[0];

    res.status(201).json({
      ...newLog,
      user,
      likes_count: 0,
      comments_count: 0,
      has_liked: false,
    });
  } catch (err) {
    next(err);
  }
});
router.post("/:id/flag", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query("UPDATE observations SET is_flagged = TRUE, flags_count = COALESCE(flags_count, 0) + 1 WHERE id = $1 RETURNING id", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Observation log not found." });
    }

    res.json({ message: "Observation successfully flagged." });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/comments", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content, user_id } = req.body;

    const activeUserId = req.user && req.user.id ? req.user.id : user_id;

    if (!activeUserId) {
      return res.status(401).json({ message: "User ID is required to comment." });
    }

    const result = await db.query(
      `INSERT INTO comments (observation_id, user_id, content) 
             VALUES ($1, $2, $3) 
             RETURNING *`,
      [id, activeUserId, content],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/like", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existingLike = await db.query("SELECT * FROM observation_likes WHERE observation_id = $1 AND user_id = $2", [id, userId]);

    if (existingLike.rows.length > 0) {
      await db.query("DELETE FROM observation_likes WHERE observation_id = $1 AND user_id = $2", [id, userId]);
      return res.json({ message: "Observation unliked.", liked: false });
    } else {
      await db.query("INSERT INTO observation_likes (observation_id, user_id) VALUES ($1, $2)", [id, userId]);
      return res.status(201).json({ message: "Observation liked.", liked: true });
    }
  } catch (err) {
    next(err);
  }
});

router.get("/:id/comments", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT c.*, u.username, u.avatar_url 
             FROM comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.observation_id = $1
             ORDER BY c.created_at ASC`,
      [id],
    );

    const comments = result.rows.map((row) => {
      const { username, avatar_url, ...commentData } = row;
      return {
        ...commentData,
        user: { username, avatar_url },
      };
    });

    res.json(comments);
  } catch (err) {
    next(err);
  }
});

router.post("/comments/:id/flag", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query("UPDATE comments SET is_flagged = TRUE, flags_count = COALESCE(flags_count, 0) + 1 WHERE id = $1 RETURNING id", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Comment not found." });
    }

    res.json({ message: "Comment successfully flagged." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
