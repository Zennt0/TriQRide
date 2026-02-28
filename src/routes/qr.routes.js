const express = require("express");
const router = express.Router();
const QRCode = require("qrcode");

const connect = require("../config/db");

// Generate QR code for a record by ID
router.get("/api/qr/:id", (req, res) => {
  const qrId = req.params.id;
  const userIp = req.ip;

  console.log(
    `[${new Date().toISOString()}] GET /api/qr/${qrId} - Request received from IP: ${userIp}`,
  );

  connect.query(
    "SELECT * FROM driverlist WHERE id = ?",
    [qrId],
    (err, rows) => {
      if (err) {
        console.error("Error fetching data for QR code:", err);
        return res.status(500).json({ error: "Failed to fetch driver data" });
      }

      if (rows.length === 0) {
        console.error("Record not found for QR code ID:", qrId);
        return res
          .status(404)
          .json({ error: `No driver record found for ID: ${qrId}.` });
      }

      const driver = rows[0];

      const qrData = `https://triqride.onrender.com/api/qr?id=${qrId}`;

      QRCode.toDataURL(qrData, (err, url) => {
        if (err) {
          console.error("Error generating QR code:", err);
          return res.status(500).json({ error: "Failed to generate QR code" });
        }

        const insertScanQuery = `INSERT INTO qr_scan_history (qr_id, user_ip, scanned_at) VALUES (?, ?, NOW())`;
        connect.query(insertScanQuery, [qrId, userIp], (insertErr) => {
          if (insertErr) {
            console.error("Error inserting scan history:", insertErr);
            return res
              .status(500)
              .json({ error: "Failed to record QR code scan" });
          }

          console.log("QR code generated and scan recorded successfully");
          res.json({
            qrCode: url,
            driver: {
              id: driver.id,
              plate_number: driver.Plate_number,
              driver_name: driver.Driver_name,
              barangay: driver.Barangay,
              image: driver.Image,
              created_at: driver.created_at,
            },
          });
        });
      });
    },
  );
});

// QR lookup by query params
router.get("/api/qr", (req, res) => {
  console.log(`[${new Date().toISOString()}] GET /api/qr - Request received`);
  console.log("Request Query Params:", req.query);

  const { plate, driver, barangay } = req.query;

  if (!plate || !driver || !barangay) {
    return res
      .status(400)
      .json({
        error: "Missing required query parameters: plate, driver, barangay",
      });
  }

  const query = `SELECT * FROM driverlist WHERE Plate_number = ? AND Driver_name = ? AND Barangay = ?`;
  connect.query(query, [plate, driver, barangay], (err, rows) => {
    if (err) {
      console.error(
        `[${new Date().toISOString()}] Error executing query:`,
        err,
      );
      return res.status(500).json({ error: "Database query error" });
    }

    if (rows.length === 0) {
      console.log(
        `[${new Date().toISOString()}] No record found for query:`,
        req.query,
      );
      return res.status(404).json({ error: "No record found" });
    }

    console.log(
      `[${new Date().toISOString()}] Record found for query:`,
      rows[0],
    );
    res.json({ success: true, data: rows[0] });
  });
});

module.exports = router;
