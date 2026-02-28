const express = require("express");
const router = express.Router();
const path = require("path");

const connect = require("../config/db");
const { bucket } = require("../config/firebase");
const upload = require("../middleware/upload");

// Add a new driver record with image upload
router.post("/api/list", upload.single("image"), (req, res) => {
  const { plate, driver, brgy } = req.body;

  if (!plate || !driver || !brgy) {
    return res
      .status(400)
      .json({ error: "Plate number, driver name, and barangay are required." });
  }

  // Handle case where no image is uploaded
  if (!req.file || req.body.image === "no_image") {
    connect.query(
      "INSERT INTO driverlist (Plate_number, Driver_name, Barangay) VALUES (?, ?, ?)",
      [plate, driver, brgy],
      (err) => {
        if (err) {
          console.error("Error inserting data into MySQL:", err);
          return res.status(500).json({ error: "Failed to insert data" });
        }
        res.json({ msg: "Successfully posted without image!" });
      },
    );
    return;
  }

  // If there is an image, proceed with image upload
  const fileName = Date.now() + path.extname(req.file.originalname);
  const file = bucket.file(`images/${fileName}`);

  const stream = file.createWriteStream({
    metadata: {
      contentType: req.file.mimetype,
    },
  });

  stream.on("error", (err) => {
    console.error("Error uploading to Firebase Storage:", err);
    return res.status(500).json({ error: "Failed to upload image" });
  });

  stream.on("finish", async () => {
    try {
      await file.makePublic();
      const imageUrl = file.publicUrl();

      connect.query(
        "INSERT INTO driverlist (Plate_number, Driver_name, Barangay, Image) VALUES (?, ?, ?, ?)",
        [plate, driver, brgy, imageUrl],
        (err) => {
          if (err) {
            console.error("Error inserting data into MySQL:", err);
            return res.status(500).json({ error: "Failed to insert data" });
          }
          res.json({
            msg: "Successfully posted with image!",
            imagePath: imageUrl,
          });
        },
      );
    } catch (err) {
      console.error("Error making image public:", err);
      res.status(500).json({ error: "Error saving image" });
    }
  });

  stream.end(req.file.buffer);
});

// Get all records with images
router.get("/api/list", (req, res) => {
  console.log("GET /api/list - Request received");
  connect.query(
    "SELECT id, Plate_number, Driver_name, Barangay, Image FROM driverlist",
    (err, rows) => {
      if (err) {
        console.error("Error fetching data:", err);
        return res.status(500).json({ error: "Failed to fetch data" });
      }
      console.log("Fetched data successfully:", rows);
      res.json(rows);
    },
  );
});

// Get a record by ID
router.get("/api/list/:id", (req, res) => {
  const id = req.params.id;
  console.log(`GET /api/list/${id} - Request received`);

  const driverQuery = "SELECT * FROM driverlist WHERE id = ?";

  connect.query(driverQuery, [id], (err, driverRows) => {
    if (err) {
      console.error("Error fetching driver data:", err);
      return res.status(500).json({ error: "Failed to fetch driver data" });
    }

    if (driverRows.length > 0) {
      const driver = driverRows[0];

      const reportQuery = `
                SELECT 
                    COUNT(CASE WHEN Violations IS NOT NULL AND Violations <> '' THEN 1 END) AS totalViolations, 
                    AVG(ratings) AS overallRating,
                    COUNT(ratings) AS ratingCount
                FROM reportlist 
                WHERE Plate_number = ?
            `;

      connect.query(reportQuery, [driver.Plate_number], (err, reportRows) => {
        if (err) {
          console.error("Error fetching report data:", err);
          return res.status(500).json({ error: "Failed to fetch report data" });
        }

        const overallRating = reportRows[0].overallRating
          ? parseFloat(reportRows[0].overallRating).toFixed(2)
          : "0.00";

        const responseData = {
          ...driver,
          totalViolations: reportRows[0].totalViolations || 0,
          overallRating: overallRating,
          ratingCount: reportRows[0].ratingCount || 0,
        };

        console.log(
          "Fetched driver and report data successfully:",
          responseData,
        );
        res.json(responseData);
      });
    } else {
      console.error(`Record with ID ${id} not found`);
      res.status(404).json({ msg: `Record with ID ${id} not found!` });
    }
  });
});

// Get an image by record ID
router.get("/api/list/:id/image", (req, res) => {
  const id = req.params.id;
  console.log(`GET /api/list/${id}/image - Request received`);

  connect.query(
    "SELECT image FROM datalist WHERE id = ?",
    [id],
    (err, rows) => {
      if (err) {
        console.error("Error fetching image:", err);
        return res.status(500).json({ error: "Failed to fetch image" });
      }

      if (rows.length === 0 || !rows[0].image) {
        console.error("Image not found for ID:", id);
        return res.status(404).json({ error: "Image not found" });
      }

      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Content-Length": rows[0].image.length,
      });
      console.log("Sending image for ID:", id);
      res.end(rows[0].image);
    },
  );
});

// Search drivers
router.get("/api/drivers", (req, res) => {
  const searchTerm = req.query.search;

  let query = `SELECT * FROM driverlist`;

  if (searchTerm) {
    query += ` WHERE Plate_number LIKE ?`;
  }

  connect.query(
    query,
    searchTerm ? [`%${searchTerm}%`] : [],
    (err, results) => {
      if (err) {
        console.error("Error fetching drivers:", err);
        return res.status(500).json({ error: "Failed to fetch drivers." });
      }

      res.json(results);
    },
  );
});

// Fetch driver details along with their report data
router.get("/api/driver/:plateNumber", (req, res) => {
  const plateNumber = req.params.plateNumber;

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const query = `
        SELECT dl.*, 
            CASE WHEN COUNT(rl.ratings) > 0 THEN AVG(rl.ratings) ELSE NULL END AS averageRating,
            COUNT(rl.ratings) AS ratingCount,
            GROUP_CONCAT(
                CASE 
                    WHEN MONTH(rl.report_datetime) = ? AND YEAR(rl.report_datetime) = ? 
                    THEN CONCAT(rl.Violations, ' - ', DATE_FORMAT(rl.report_datetime, '%Y-%m-%d %H:%i:%s'), ' - ', rl.reporter_name)  
                    ELSE NULL 
                END SEPARATOR ', '
            ) AS ViolationHistory,
            COUNT(CASE WHEN MONTH(rl.report_datetime) = ? AND YEAR(rl.report_datetime) = ? THEN rl.Violations END) AS totalViolations
        FROM driverlist dl
        LEFT JOIN reportlist rl ON dl.Plate_number = rl.Plate_number
        WHERE dl.Plate_number = ?
        GROUP BY dl.Plate_number;
    `;

  connect.query(
    query,
    [currentMonth, currentYear, currentMonth, currentYear, plateNumber],
    (err, results) => {
      if (err) {
        console.error("Error fetching driver report details:", err);
        return res
          .status(500)
          .json({ error: "Failed to fetch report details." });
      }
      if (results.length > 0) {
        res.json({
          success: true,
          data: results[0],
        });
      } else {
        res.status(404).json({ error: "Driver not found" });
      }
    },
  );
});

// Update driver
router.put("/api/driver/update", upload.single("image"), async (req, res) => {
  const { id, Driver_name, Plate_number, Barangay } = req.body;

  try {
    if (!req.file) {
      connect.query(
        "UPDATE driverlist SET Driver_name = ?, Plate_number = ?, Barangay = ? WHERE id = ?",
        [Driver_name, Plate_number, Barangay, id],
        (err, result) => {
          if (err) {
            console.error("Error updating data:", err);
            return res
              .status(500)
              .json({ success: false, message: "Failed to update data" });
          }
          return res.json({ success: true, message: "Updated successfully" });
        },
      );
    } else {
      const fileName = Date.now() + path.extname(req.file.originalname);
      const file = bucket.file(`images/${fileName}`);

      const stream = file.createWriteStream({
        metadata: {
          contentType: req.file.mimetype,
        },
      });

      stream.on("error", (err) => {
        console.error("Error uploading to Firebase Storage:", err);
        return res
          .status(500)
          .json({ success: false, message: "Failed to upload image" });
      });

      stream.on("finish", async () => {
        try {
          await file.makePublic();
          const imageUrl = file.publicUrl();

          connect.query(
            "UPDATE driverlist SET Driver_name = ?, Plate_number = ?, Barangay = ?, Image = ? WHERE id = ?",
            [Driver_name, Plate_number, Barangay, imageUrl, id],
            (err, result) => {
              if (err) {
                console.error("Error updating data:", err);
                return res
                  .status(500)
                  .json({ success: false, message: "Failed to update data" });
              }
              return res.json({
                success: true,
                message: "Updated successfully with new image",
              });
            },
          );
        } catch (err) {
          console.error("Error making image public:", err);
          return res
            .status(500)
            .json({ success: false, message: "Error saving image" });
        }
      });

      stream.end(req.file.buffer);
    }
  } catch (error) {
    console.error("Error in update endpoint:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete a record by ID
router.delete("/api/remove", (req, res) => {
  const { id } = req.body;
  console.log("DELETE /api/remove - Request received", { id });

  connect.query("DELETE FROM driverlist WHERE id = ?", [id], (err) => {
    if (err) {
      console.error("Error deleting data:", err);
      return res.status(500).json({ error: "Failed to delete data" });
    }

    console.log("Data deleted successfully for ID:", id);
    res.json({ msg: "Successfully deleted!" });
  });
});

module.exports = router;
