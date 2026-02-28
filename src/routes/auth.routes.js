const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const connect = require("../config/db");
const { bucket } = require("../config/firebase");
const upload = require("../middleware/upload");

// Create Head Admin
router.post("/create-head-admin", async (req, res) => {
  const { username, fullname, password } = req.body;

  if (!username || !fullname || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Check if username already exists
  connect.query(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, result) => {
      if (err) {
        return res.status(500).json({ message: "Database error" });
      }

      if (result.length > 0) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Check if Head Admin exists
      connect.query(
        'SELECT * FROM users WHERE role = "Head Admin"',
        async (err, result) => {
          if (err) {
            return res.status(500).json({ message: "Database error" });
          }

          if (result.length > 0) {
            return res
              .status(400)
              .json({ message: "Head Admin already exists" });
          }

          try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const query = `
                    INSERT INTO users (username, fullname, password, role, approval_status, admin_request) 
                    VALUES (?, ?, ?, 'Head Admin', 'approved', 'null')
                `;

            connect.query(
              query,
              [username, fullname, hashedPassword],
              (err, result) => {
                if (err) {
                  console.error("Error creating Head Admin:", err);
                  return res
                    .status(500)
                    .json({ message: "Error creating Head Admin" });
                }
                res
                  .status(201)
                  .json({ message: "Head Admin created successfully" });
              },
            );
          } catch (error) {
            console.error("Error in head admin creation:", error);
            res.status(500).json({ message: "Server error" });
          }
        },
      );
    },
  );
});

// Check if Head Admin exists
router.get("/check-head-admin", async (req, res) => {
  connect.query(
    'SELECT * FROM users WHERE role = "Head Admin"',
    (err, result) => {
      if (err) {
        console.error("Database query error:", err);
        return res.status(500).json({ message: "Database error" });
      }
      res.json({ headAdminExists: result.length > 0 });
    },
  );
});

// Login endpoint
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  connect.query(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, result) => {
      if (err) {
        return res.status(500).json({ message: "Database query error" });
      }

      if (result.length === 0) {
        return res
          .status(400)
          .json({ message: "Invalid username or password" });
      }

      const user = result[0];
      const passwordMatch = await bcrypt.compare(password, user.password);

      if (!passwordMatch) {
        return res
          .status(400)
          .json({ message: "Invalid username or password" });
      }

      if (user.approval_status !== "approved") {
        return res.status(403).json({ message: "Access denied." });
      }

      // Generate a JWT token
      const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "1h" },
      );

      // Send the token along with user details
      res.json({
        message: "Login successful",
        fullname: user.fullname,
        role: user.role,
        userId: user.id,
        profileImage: user.profile_image,
        token: token,
      });
    },
  );
});

// Register / Create account endpoint
router.post("/register", upload.single("profileImage"), async (req, res) => {
  const { username, fullname, password, role } = req.body;
  let profileImageUrl = null;
  let fileName = null;

  // Validate input fields
  if (!username || !fullname || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Handle image upload if a file was provided
    if (req.file) {
      const sanitizedOriginalname = req.file.originalname.replace(
        /[^a-zA-Z0-9.]/g,
        "_",
      );
      fileName = `profile-images/admin/${Date.now()}-${sanitizedOriginalname}`;

      const fileBuffer = req.file.buffer;

      try {
        const file = bucket.file(fileName);

        await file.save(fileBuffer, {
          metadata: {
            contentType: req.file.mimetype,
            metadata: {
              originalname: req.file.originalname,
              uploadedBy: username,
              uploadDate: new Date().toISOString(),
              role: role,
            },
          },
        });

        await file.makePublic();
        profileImageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

        console.log(`File uploaded successfully to: ${fileName}`);
      } catch (uploadError) {
        console.error("Error uploading to Firebase:", uploadError);
        return res
          .status(500)
          .json({ message: "Error uploading image to storage" });
      }
    }

    // Check if username already exists
    connect.query(
      "SELECT * FROM users WHERE username = ?",
      [username],
      async (err, result) => {
        if (err) {
          console.error("Database query error:", err);

          if (profileImageUrl) {
            try {
              const file = bucket.file(fileName);
              await file.delete();
              console.log("Cleaned up uploaded file after database error");
            } catch (deleteError) {
              console.error("Error deleting uploaded file:", deleteError);
            }
          }

          return res.status(500).json({ message: "Database error" });
        }

        if (result.length > 0) {
          if (profileImageUrl) {
            try {
              const file = bucket.file(fileName);
              await file.delete();
              console.log("Cleaned up uploaded file due to duplicate username");
            } catch (deleteError) {
              console.error("Error deleting uploaded file:", deleteError);
            }
          }

          return res.status(400).json({ message: "Username already exists" });
        }

        try {
          const hashedPassword = await bcrypt.hash(password, 10);
          const approvalStatus = "pending";
          const adminRequest = "pending";

          const query = `
                    INSERT INTO users (username, fullname, password, role, approval_status, admin_request, profile_image) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `;

          connect.query(
            query,
            [
              username,
              fullname,
              hashedPassword,
              role,
              approvalStatus,
              adminRequest,
              profileImageUrl,
            ],
            (err, result) => {
              if (err) {
                console.error("Error creating account:", err);

                if (profileImageUrl) {
                  try {
                    const file = bucket.file(fileName);
                    file.delete().catch(console.error);
                    console.log(
                      "Cleaned up uploaded file after account creation error",
                    );
                  } catch (deleteError) {
                    console.error("Error deleting uploaded file:", deleteError);
                  }
                }

                return res
                  .status(500)
                  .json({ message: "Error creating account" });
              }
              res.status(201).json({ message: "Account created successfully" });
            },
          );
        } catch (error) {
          console.error("Error in account creation:", error);

          if (profileImageUrl) {
            try {
              const file = bucket.file(fileName);
              await file.delete();
              console.log(
                "Cleaned up uploaded file after account creation error",
              );
            } catch (deleteError) {
              console.error("Error deleting uploaded file:", deleteError);
            }
          }

          res.status(500).json({ message: "Server error" });
        }
      },
    );
  } catch (error) {
    console.error("Error handling image upload:", error);
    res.status(500).json({ message: "Error handling image upload" });
  }
});

module.exports = router;
