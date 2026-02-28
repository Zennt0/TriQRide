require("dotenv").config();
const express = require("express");
const cors = require("cors");

// Middleware
const requestLogger = require("./src/middleware/logger");

// Route files
const authRoutes = require("./src/routes/auth.routes");
const adminRoutes = require("./src/routes/admin.routes");
const profileRoutes = require("./src/routes/profile.routes");
const driverRoutes = require("./src/routes/driver.routes");
const reportRoutes = require("./src/routes/report.routes");
const qrRoutes = require("./src/routes/qr.routes");
const notificationRoutes = require("./src/routes/notification.routes");
const seminarRoutes = require("./src/routes/seminar.routes");

const app = express();
const PORT = process.env.PORT || 4500;

// Global middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(requestLogger);

// Mount routes
app.use("/", authRoutes);
app.use("/", adminRoutes);
app.use("/", profileRoutes);
app.use("/", driverRoutes);
app.use("/", reportRoutes);
app.use("/", qrRoutes);
app.use("/", notificationRoutes);
app.use("/", seminarRoutes);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
