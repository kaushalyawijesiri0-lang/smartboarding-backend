// ============================================================
// src/app.js  —  Express application setup (FIXED VERSION)
// ============================================================

const express       = require('express');
const cors          = require('cors');
const helmet        = require('helmet');
const morgan        = require('morgan');
const rateLimit     = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

// Route imports
const authRoutes         = require('./routes/auth.routes');
const userRoutes         = require('./routes/user.routes');
const listingRoutes      = require('./routes/listing.routes');
const bookingRoutes      = require('./routes/booking.routes');
const paymentRoutes      = require('./routes/payment.routes');
const reviewRoutes       = require('./routes/review.routes');
const savedRoutes        = require('./routes/saved.routes');
const notificationRoutes = require('./routes/notification.routes');
const universityRoutes   = require('./routes/university.routes');
const adminRoutes        = require('./routes/admin.routes');

const errorHandler = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1);

// ── SECURITY ─────────────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(mongoSanitize());

// ── LOGGING ──────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ── BODY PARSING ─────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── RATE LIMITING ────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, error: { message: 'Too many requests. Please try again later.' } }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: { message: 'Too many login attempts. Please wait 15 minutes.' } }
});

app.use('/api/', generalLimiter);
app.use('/api/v1/auth', authLimiter);

// ── ROOT + HEALTH ROUTES (NEW) ───────────────────────────

// Root route (when visiting http://localhost:5000)
app.get('/', (req, res) => {
  res.send('🚀 SmartBoarding API is running...');
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ✅ BASE API ROUTE (THIS FIXES YOUR 404)
app.get('/api/v1', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'SmartBoarding API v1 is working 🚀'
  });
});

// ── API ROUTES ───────────────────────────────────────────
const API = '/api/v1';

app.use(`${API}/auth`,          authRoutes);
app.use(`${API}/users`,         userRoutes);
app.use(`${API}/listings`,      listingRoutes);
app.use(`${API}/bookings`,      bookingRoutes);
app.use(`${API}/payments`,      paymentRoutes);
app.use(`${API}/reviews`,       reviewRoutes);
app.use(`${API}/saved`,         savedRoutes);
app.use(`${API}/notifications`, notificationRoutes);
app.use(`${API}/universities`,  universityRoutes);
app.use(`${API}/admin`,         adminRoutes);

// ── 404 HANDLER ─────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.originalUrl} not found`,
      status: 404
    }
  });
});

// ── GLOBAL ERROR HANDLER ─────────────────────────────────
app.use(errorHandler);

module.exports = app;