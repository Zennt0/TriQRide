const multer = require("multer");
const path = require("path");

// Validate image types (JPEG, PNG, GIF) and limit file size to 5MB
const upload = multer({
  storage: multer.memoryStorage(), // Store in memory, providing a buffer
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const isValid = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    if (isValid) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, and GIF are allowed."));
    }
  },
});

module.exports = upload;
