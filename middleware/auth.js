const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ message: "Authentication token required." });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'supersecret_fallback', (err, user) => {
        if (err) {
            return res.status(403).json({ message: "Invalid or expired token." });
        }
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'PLATFORM_ADMIN') {
        next();
    } else {
        return res.status(403).json({ message: "Admin privileges required." });
    }
};

module.exports = {
    authenticateToken,
    requireAdmin
};
