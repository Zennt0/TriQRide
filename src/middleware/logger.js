function requestLogger(req, res, next) {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Request received`,
  );
  next();
}

module.exports = requestLogger;
