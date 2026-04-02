// ============================================================
// src/config/db.js  —  MongoDB Database Connection
// What this file does:
//   - Connects to MongoDB using the URI from your .env file
//   - Uses Mongoose (a library that makes MongoDB easier to use)
//   - Mongoose lets you define "schemas" — rules about what data looks like
// ============================================================

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // These options prevent deprecation warnings
      serverSelectionTimeoutMS: 5000,  // Give up connecting after 5 seconds
    });

    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    throw error;
  }
};

module.exports = connectDB;
