const express = require("express");
const router = express.Router();

const connect = require("../config/db");

// Get drivers eligible for seminar (3+ active violations)
router.get("/api/seminar", (req, res) => {
  const searchTerm = req.query.search;

  let query = `
        SELECT 
            r.Driver_name, 
            r.Plate_number, 
            COUNT(r.Violations) AS total_violations
        FROM reportlist r
        LEFT JOIN (
            SELECT Plate_number, MAX(attended_at) AS last_attended_at 
            FROM seminar_attendance 
            GROUP BY Plate_number
        ) sa ON r.Plate_number = sa.Plate_number
        WHERE (sa.last_attended_at IS NULL OR r.report_datetime > sa.last_attended_at)
        AND r.status = 'active'
        AND r.Violations IS NOT NULL AND r.Violations != ''
        GROUP BY r.Driver_name, r.Plate_number
        HAVING total_violations >= 3;
    `;

  if (searchTerm) {
    query += ` AND (r.Plate_number LIKE ? OR r.Driver_name LIKE ?)`;
  }

  connect.query(
    query,
    searchTerm ? [`%${searchTerm}%`, `%${searchTerm}%`] : [],
    (err, results) => {
      if (err) {
        console.error("Error fetching seminar data:", err);
        return res.status(500).json({ error: "Failed to fetch seminar data." });
      }

      results.forEach((driver) => {
        console.log(
          `Driver: ${driver.Driver_name}, Plate: ${driver.Plate_number}, Violations: ${driver.total_violations}`,
        );
      });

      res.json(results);
    },
  );
});

// Reset violations (record attendance)
router.post("/api/reset-violations", (req, res) => {
  const { plateNumber } = req.body;

  const attendanceQuery = `
        INSERT INTO seminar_attendance (Plate_number) VALUES (?);
    `;

  connect.query(attendanceQuery, [plateNumber], (err, result) => {
    if (err) {
      console.error("Error recording attendance:", err);
      return res.status(500).json({ error: "Failed to record attendance." });
    }

    const resetViolationsQuery = `
                UPDATE reportlist 
                SET 
                    status = 'resolved',
                    token_status = 'disabled',
                    fcm_token = NULL
                WHERE 
                    Plate_number = ? 
                    AND status = 'active';
            `;

    connect.query(resetViolationsQuery, [plateNumber], (err, result) => {
      if (err) {
        console.error("Error updating violations status:", err);
        return res
          .status(500)
          .json({ error: "Failed to update violations status." });
      }

      res.json({
        success: true,
        message:
          "Attendance recorded and violations marked as resolved with token disabled.",
      });
    });
  });
});

// Get seminar attendance data
router.get("/api/seminar-attendance", (req, res) => {
  const query = `
        SELECT 
            DATE_FORMAT(attendance_date, '%Y-%m') AS month,
            COUNT(*) AS attendees
        FROM seminar_attendance
        GROUP BY month
        ORDER BY month;
    `;

  connect.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching seminar attendance data:", err);
      return res
        .status(500)
        .json({ error: "Failed to fetch attendance data." });
    }

    res.json(results);
  });
});

// Server time
router.get("/api/server-time", (req, res) => {
  res.json({ serverTime: Date.now() });
});

module.exports = router;
