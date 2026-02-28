const express = require("express");
const router = express.Router();

const connect = require("../config/db");
const { admin } = require("../config/firebase");

// Store or update FCM token
router.post("/api/token", (req, res) => {
  const { id, fcm_token } = req.body;
  console.log("POST /api/token - Request received", { id, fcm_token });

  if (!id || !fcm_token) {
    console.error("Validation Error: Missing ID or FCM token");
    return res.status(400).json({ error: "ID and FCM token are required." });
  }

  connect.query(
    "INSERT INTO datalist (id, fcm_token) VALUES (?, ?) ON DUPLICATE KEY UPDATE fcm_token = VALUES(fcm_token)",
    [id, fcm_token],
    (err) => {
      if (err) {
        console.error("Error updating FCM token in the database:", err);
        return res.status(500).json({ error: "Failed to update FCM token" });
      }

      console.log("FCM token updated successfully for ID:", id);
      res.json({ msg: "FCM token updated successfully!" });
    },
  );
});

// Send notification to a user
router.post("/sendnotification", (req, res) => {
  const { id, title, body, serverTime, serverDate, fcm_token } = req.body;
  console.log("POST /sendnotification - Request received", {
    id,
    title,
    body,
    serverTime,
    serverDate,
    fcm_token,
  });

  if (!id || !title || !body || !serverTime || !serverDate || !fcm_token) {
    console.error("Validation Error: Missing required fields");
    return res
      .status(400)
      .json({
        error:
          "ID, title, body, serverTime, serverDate, and fcm_token are required.",
      });
  }

  const message = {
    notification: {
      title: title,
      body: body,
    },
    token: fcm_token,
    data: {
      serverTime: serverTime,
      serverDate: serverDate,
    },
  };

  console.log("Sending notification:", message);

  admin
    .messaging()
    .send(message)
    .then((response) => {
      console.log("Notification sent successfully to driver ID:", id);
      res
        .status(200)
        .json({ success: true, msg: "Notification sent successfully" });
    })
    .catch((error) => {
      console.error("Error sending notification for driver ID:", id, error);
      res.status(500).json({ error: "Error sending notification" });
    });
});

// Notify attendance
router.post("/api/notify-attendance", (req, res) => {
  const { plateNumber, attended } = req.body;
  console.log("POST /api/notify-attendance - Request received:", {
    plateNumber,
    attended,
    iconType: attended ? "attendance_icon" : "absence_icon",
  });

  if (!plateNumber || plateNumber === "N/A") {
    console.error("Invalid or missing plate number");
    return res.status(400).json({ error: "Invalid or missing plate number." });
  }

  connect.query(
    `SELECT fcm_token 
         FROM reportlist 
         WHERE Plate_number = ?`,
    [plateNumber],
    (err, reportRows) => {
      if (err) {
        console.error("Database Error: Failed to fetch FCM tokens:", err);
        return res.status(500).json({ error: "Failed to fetch FCM tokens." });
      }

      if (reportRows.length === 0) {
        console.error("No FCM tokens found for Plate number:", plateNumber);
        return res
          .status(404)
          .json({
            error: "No FCM tokens found for the provided Plate number.",
          });
      }

      const fcmTokens = reportRows
        .map((row) => row.fcm_token)
        .filter((token) => token);

      if (fcmTokens.length === 0) {
        console.error(
          "No valid FCM tokens found for Plate number:",
          plateNumber,
        );
        return res.status(404).json({ error: "No valid FCM tokens found." });
      }

      const currentDateTime = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Manila",
      });
      const [formattedDate, formattedTime] = currentDateTime.split(", ");

      const message = {
        notification: {
          title: "Seminar Attendance:",
          body: `${plateNumber} ${attended ? "Attended" : "Did not attend"} the seminar.`,
        },
        data: {
          plateNumber: plateNumber,
          attended: String(attended),
          icon: attended ? "attendance_icon" : "absence_icon",
          serverDate: formattedDate,
          serverTime: formattedTime,
        },
      };

      console.log("Message being sent:", message);

      const notificationPromises = fcmTokens.map((token) => {
        return admin.messaging().send({
          ...message,
          token: token,
        });
      });

      Promise.all(notificationPromises)
        .then((responses) => {
          console.log(
            "Notifications sent successfully for Plate number:",
            plateNumber,
            "with icon:",
            message.data.icon,
          );
          res.status(200).json({
            success: true,
            msg: "Notifications sent successfully to all devices.",
          });
        })
        .catch((error) => {
          console.error("Error sending notifications:", error);
          res.status(500).json({ error: "Failed to send notifications." });
        });
    },
  );
});

module.exports = router;
