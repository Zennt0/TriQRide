const express = require("express");
const router = express.Router();

const connect = require("../config/db");

// Get pending admins
router.get("/pending-admins", (req, res) => {
  connect.query(
    'SELECT id, fullname, username, profile_image FROM users WHERE role = "Admin" AND approval_status = "pending"',
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error" });
      }
      res.json(results);
    },
  );
});

// Approve admin route
router.post("/approve-admin/:id", (req, res) => {
  const { id } = req.params;
  const headAdminId = req.headers.headadminid;

  console.log("Approving admin ID:", id);
  console.log("Received Head Admin ID:", headAdminId);

  if (!headAdminId) {
    console.log("Missing Head Admin ID in request headers");
    return res
      .status(403)
      .json({ message: "Unauthorized: Missing Head Admin ID" });
  }

  connect.query(
    "SELECT * FROM users WHERE id = ?",
    [headAdminId],
    (err, result) => {
      if (err) {
        console.error("Database error while fetching Head Admin:", err);
        return res.status(500).json({ message: "Database query error" });
      }

      console.log("Head Admin Query Result:", result);

      const currentUser = result[0];
      if (!currentUser || currentUser.role !== "Head Admin") {
        console.log("Unauthorized access: User is not a Head Admin");
        return res.status(403).json({ message: "Unauthorized" });
      }

      connect.query(
        'UPDATE users SET approval_status = "approved", admin_request = NULL WHERE id = ?',
        [id],
        (err, result) => {
          if (err) {
            console.error("Database error while approving admin:", err);
            return res
              .status(500)
              .json({ message: "Error updating approval status" });
          }
          console.log("Admin approved successfully");
          res.json({ message: "Admin approved successfully" });
        },
      );
    },
  );
});

// Deny admin route
router.post("/deny-admin/:id", (req, res) => {
  const { id } = req.params;
  const headAdminId = req.headers.headadminid;

  console.log("Denying admin ID:", id);
  console.log("Received Head Admin ID:", headAdminId);

  if (!headAdminId) {
    console.log("Missing Head Admin ID in request headers");
    return res
      .status(403)
      .json({ message: "Unauthorized: Missing Head Admin ID" });
  }

  connect.query(
    "SELECT * FROM users WHERE id = ?",
    [headAdminId],
    (err, result) => {
      if (err) {
        console.error("Database error while fetching Head Admin:", err);
        return res.status(500).json({ message: "Database query error" });
      }

      console.log("Head Admin Query Result:", result);

      const currentUser = result[0];
      if (!currentUser || currentUser.role !== "Head Admin") {
        console.log("Unauthorized access: User is not a Head Admin");
        return res.status(403).json({ message: "Unauthorized" });
      }

      connect.query(
        'UPDATE users SET approval_status = "denied", admin_request = NULL WHERE id = ?',
        [id],
        (err, result) => {
          if (err) {
            console.error("Database error while denying admin:", err);
            return res
              .status(500)
              .json({ message: "Error updating approval status" });
          }
          console.log("Admin denied successfully");
          res.json({ message: "Admin denied successfully" });
        },
      );
    },
  );
});

module.exports = router;
