// ============================================================
// server.js  —  Entry point for SmartBoarding API
// What this file does:
//   1. Loads environment variables from .env file
//   2. Connects to MongoDB database
//   3. Starts the Express web server on the configured port
//   4. Starts background cron jobs (scheduled tasks)
// ============================================================

require('dotenv').config();           // Load .env variables into process.env
const app        = require('./src/app');
const connectDB  = require('./src/config/db');
const { startCronJobs } = require('./src/jobs/cronJobs');

const PORT = process.env.PORT || 5000;

// Connect to MongoDB, then start the server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 SmartBoarding API running on port ${PORT}`);
    console.log(`📖 Environment: ${process.env.NODE_ENV}`);
    console.log(`🌐 URL: http://localhost:${PORT}/api/v1\n`);
  });

  // Start background scheduled jobs
  startCronJobs();

}).catch((err) => {
  console.error('❌ Failed to connect to MongoDB:', err.message);
  process.exit(1);  // Exit the process if DB fails — no point running without DB
});

// Handle unhandled promise rejections (catches async errors not caught anywhere else)
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message);
  process.exit(1);
});
