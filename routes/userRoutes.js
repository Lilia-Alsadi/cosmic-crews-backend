const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");

router.get("/me", authenticateToken, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, email, username, full_name, bio, location, avatar_url, banner_url, role, created_at 
             FROM users 
             WHERE id = $1`,
      [req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put("/me", authenticateToken, async (req, res, next) => {
  try {
    const { full_name, bio, location, avatar_url, banner_url, username } = req.body;

    if (username) {
      const check = await db.query("SELECT id FROM users WHERE username = $1 AND id != $2", [username, req.user.id]);
      if (check.rows.length > 0) {
        return res.status(400).json({ message: "Username is already taken." });
      }
    }

    const result = await db.query(
      `UPDATE users 
             SET full_name = COALESCE($1, full_name), 
                 bio = COALESCE($2, bio), 
                 location = COALESCE($3, location), 
                 avatar_url = COALESCE($4, avatar_url),
                 banner_url = COALESCE($5, banner_url),
                 username = COALESCE($7, username)
             WHERE id = $6
             RETURNING id, email, username, full_name, bio, location, avatar_url, banner_url, role, created_at`,
      [full_name !== undefined ? full_name : null, bio !== undefined ? bio : null, location !== undefined ? location : null, avatar_url !== undefined ? avatar_url : null, banner_url !== undefined ? banner_url : null, req.user.id, username !== undefined ? username : null],
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
