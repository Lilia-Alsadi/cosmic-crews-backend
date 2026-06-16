const jwt = require("jsonwebtoken");
const db = require("../db");

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Authentication token required." });
  }

  jwt.verify(token, process.env.JWT_SECRET || "supersecret_fallback", async (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token." });
    }
    
    try {
      const userResult = await db.query("SELECT status FROM users WHERE id = $1", [user.id]);
      if (userResult.rows.length === 0 || userResult.rows[0].status === "BANNED") {
         return res.status(403).json({ message: "Your account has been banned or does not exist." });
      }
    } catch (dbErr) {
       return res.status(500).json({ message: "Server error checking user status." });
    }

    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user && (req.user.role === "ADMIN" || req.user.role === "admin")) {
    next();
  } else {
    return res.status(403).json({ message: "Admin privileges required." });
  }
};

module.exports = {
  authenticateToken,
  requireAdmin,
};
