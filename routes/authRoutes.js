const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
    try {
        const { email, password, username, full_name } = req.body;
        
        const userCheck = await db.query('SELECT * FROM users WHERE email = $1 OR username = $2', [email, username]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ message: "Email or username already in use." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const result = await db.query(
            `INSERT INTO users (email, password, username, full_name) 
             VALUES ($1, $2, $3, $4) 
             RETURNING id, email, username, full_name, avatar_url, created_at, role`,
            [email, hashedPassword, username, full_name]
        );

        const newUser = result.rows[0];

        const token = jwt.sign(
            { id: newUser.id, role: newUser.role }, 
            process.env.JWT_SECRET || 'supersecret_fallback', 
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: "User registered successfully",
            token,
            user: {
                id: newUser.id,
                email: newUser.email,
                username: newUser.username,
                full_name: newUser.full_name,
                avatar_url: newUser.avatar_url,
                created_at: newUser.created_at
            }
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            return res.status(400).json({ message: "Invalid credentials." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials." });
        }

        if (user.status === 'BANNED') {
            return res.status(403).json({ message: "Your account has been banned." });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role }, 
            process.env.JWT_SECRET || 'supersecret_fallback', 
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                avatar_url: user.avatar_url,
                role: user.role
            }
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
