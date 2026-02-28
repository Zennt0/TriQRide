const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");

const connect = require("../config/db");

// Get user profile
router.get("/api/getProfile/:id", (req, res) => {
  const userId = req.params.id;

  const sql = `
        SELECT username, fullname, role 
        FROM users
        WHERE id = ?
    `;

  connect.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("Error fetching profile:", err.message);
      return res.status(500).json({ message: "Database error occurred." });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json(results[0]);
  });
});

// Edit user profile
router.put("/api/editProfile/:id", (req, res) => {
  const userId = req.params.id;
  const { username, fullname, password } = req.body;

  if (!username || !fullname || !password) {
    return res.status(400).json({ message: "All fields are required." });
  }

  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      console.error("Error hashing password:", err.message);
      return res.status(500).json({ message: "Error hashing the password." });
    }

    const sql = `
            UPDATE users
            SET username = ?, fullname = ?, password = ?
            WHERE id = ?
        `;

    connect.query(
      sql,
      [username, fullname, hashedPassword, userId],
      (err, results) => {
        if (err) {
          console.error("Error updating profile:", err.message);
          return res.status(500).json({ message: "Database error occurred." });
        }

        if (results.affectedRows === 0) {
          return res.status(404).json({ message: "User not found." });
        }

        res.status(200).json({ message: "Profile updated successfully." });
      },
    );
  });
});

module.exports = router;
