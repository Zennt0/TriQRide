const express = require("express");
const router = express.Router();
const moment = require("moment");
require("moment-timezone");

const connect = require("../config/db");

// Get reports (filtered by month and search)
router.get("/api/reports", (req, res) => {
  const searchTerm = req.query.search;
  let selectedMonth = req.query.month;

  if (!selectedMonth) {
    const today = moment().tz("Asia/Manila");
    selectedMonth = today.month() + 1;
  }

  let query = `
        SELECT 
            id,
            Plate_number,
            Driver_name,
            Violations,
            fcm_token,
            ratings,
            DATE_FORMAT(report_datetime, '%Y-%m-%d %H:%i:%s') as report_datetime,
            reporter_name
        FROM reportlist
    `;

  const queryParams = [];
  const conditions = [];

  if (searchTerm) {
    conditions.push("Plate_number LIKE ?");
    queryParams.push(`%${searchTerm}%`);
  }

  if (selectedMonth) {
    conditions.push("MONTH(report_datetime) = ?");
    queryParams.push(parseInt(selectedMonth, 10));
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY report_datetime DESC";

  connect.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("Error fetching reports:", err);
      return res.status(500).json({ error: "Failed to fetch reports." });
    }
    res.json(results);
  });
});

// Get all reports (no month filter)
router.get("/api/reportmonths", (req, res) => {
  const searchTerm = req.query.search;

  let query = `
        SELECT 
            id,
            Plate_number,
            Driver_name,
            Violations,
            fcm_token,
            ratings,
            DATE_FORMAT(report_datetime, '%Y-%m-%d %H:%i:%s') as report_datetime,
            reporter_name
        FROM reportlist
    `;

  const queryParams = [];

  query += " ORDER BY report_datetime DESC";

  connect.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("Error fetching reports:", err);
      return res.status(500).json({ error: "Failed to fetch reports." });
    }
    res.json(results);
  });
});

// Submit a report
router.post("/api/report/:id", async (req, res) => {
  const { plate, driver, report, fcm_token, ratings, reporter_name } = req.body;

  if (!plate || !driver || !fcm_token || !ratings) {
    return res
      .status(400)
      .json({
        error: "Plate, driver name, FCM token, and ratings are required.",
      });
  }

  connect.query(
    "SELECT id FROM driverlist WHERE Plate_number = ? AND Driver_name = ?",
    [plate, driver],
    (err, rows) => {
      if (err) {
        console.error("Error fetching driver data:", err);
        return res.status(500).json({ error: "Failed to fetch driver data." });
      }

      if (rows.length === 0) {
        return res
          .status(404)
          .json({
            error: "Driver not found for the provided Plate and Driver.",
          });
      }

      const driverId = rows[0].id;

      const reportDateTime = moment()
        .tz("Asia/Manila")
        .format("YYYY-MM-DD HH:mm:ss");

      const insertQuery = `
            INSERT INTO reportlist (Plate_number, Driver_name, Violations, fcm_token, ratings, report_datetime, reporter_name)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
      const violations = report ? report.trim() : "";
      const insertValues = [
        plate,
        driver,
        violations,
        fcm_token,
        ratings,
        reportDateTime,
        reporter_name || "",
      ];

      connect.query(insertQuery, insertValues, (err, result) => {
        if (err) {
          console.error("Error inserting report:", err);
          return res.status(500).json({ error: "Failed to submit report." });
        }

        res.json({
          msg: "Report submitted successfully!",
          reportId: result.insertId,
          plate,
          driver,
          violations,
          ratings,
          report_datetime: reportDateTime,
          reporter_name: reporter_name || "",
        });

        // Prepare notification payload with PH time
        const notificationPayload = {
          id: driverId,
          title: "Report Notice:",
          body: `Report Submitted To Municipal Office. \nFranchise Number: ${plate}`,
          serverTime: new Date().toLocaleTimeString("en-US", {
            timeZone: "Asia/Manila",
            hour12: true,
          }),
          serverDate: new Date().toLocaleDateString("en-US", {
            timeZone: "Asia/Manila",
          }),
          fcm_token: fcm_token,
        };

        // Send the notification after report submission
        fetch("https://triqride.onrender.com/sendnotification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notificationPayload),
        })
          .then((response) => {
            if (!response.ok) {
              return response.text().then((text) => {
                console.error("Error response:", text);
                throw new Error(
                  `Failed to send notification. Status: ${response.status}`,
                );
              });
            }
            return response.json();
          })
          .then((data) => {
            console.log("Notification Sent", data);
          })
          .catch((err) => console.error("Error sending notification", err));
      });
    },
  );
});

module.exports = router;
