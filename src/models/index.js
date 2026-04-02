// ============================================================
// src/models/index.js  —  All MongoDB Data Models (Schemas)
//
// What is a Mongoose Schema?
//   A schema is like a "blueprint" or "form" that defines:
//   - What fields a document has
//   - What type each field is (String, Number, Date, etc.)
//   - Which fields are required
//   - Default values
//
// What is a Model?
//   A model is what you actually use to create, read, update,
//   and delete data. Think of it as the table in SQL databases.
//
// MongoDB stores data as "documents" inside "collections".
// Example: users collection has many user documents.
// ============================================================

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const { Schema, model } = mongoose;

// ── Helper: generate 6-digit OTP ──────────────────────
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ============================================================
// 1. UNIVERSITY MODEL
// ============================================================
const universitySchema = new Schema({
  name:      { type: String, required: true, trim: true },
  shortName: { type: String, required: true, trim: true },   // e.g. "UoC"
  city:      { type: String, required: true, trim: true },
  // location stored as GeoJSON for MongoDB's geospatial queries
  location: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }  // [longitude, latitude]
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });  // timestamps: true → adds createdAt and updatedAt automatically

universitySchema.index({ location: '2dsphere' }); // Needed for geo distance queries

const University = model('University', universitySchema);

// ============================================================
// 2. USER MODEL
// ============================================================
const userSchema = new Schema({
  role:         { type: String, enum: ['STUDENT', 'OWNER', 'ADMIN'], required: true },
  firstName:    { type: String, required: true, trim: true },
  lastName:     { type: String, required: true, trim: true },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:        { type: String, trim: true, sparse: true },  // sparse: allow multiple nulls
  passwordHash: { type: String },    // null if they registered via Google/Facebook
  avatarUrl:    { type: String },

  // Email verification
  isVerified:      { type: Boolean, default: false },
  verifyOTP:       { type: String },
  verifyOTPExpiry: { type: Date },

  // Password reset
  resetOTP:       { type: String },
  resetOTPExpiry: { type: Date },

  // Social login IDs (stored when user logs in via Google/Facebook)
  googleId:   { type: String, sparse: true },
  facebookId: { type: String, sparse: true },

  isActive:     { type: Boolean, default: true },
  lastLoginAt:  { type: Date },

  // Refresh token: stored so we can invalidate it on logout
  refreshToken: { type: String },

  // Student-specific fields (only filled when role === 'STUDENT')
  studentProfile: {
    university:   { type: Schema.Types.ObjectId, ref: 'University' },
    studentIdNo:  { type: String },
    faculty:      { type: String },
    yearOfStudy:  { type: Number, min: 1, max: 6 },
    gender:       { type: String, enum: ['MALE', 'FEMALE', 'OTHER'] }
  },

  // Owner-specific fields (only filled when role === 'OWNER')
  ownerProfile: {
    nicNumber:      { type: String },
    nicVerified:    { type: Boolean, default: false },
    businessName:   { type: String },
    verifiedBadge:  { type: Boolean, default: false },  // Admin grants this
    responseTimeHr: { type: Number, default: 24 }
  }

}, { timestamps: true });

// Before saving, if password changed, hash it
// bcrypt hashing makes the password unreadable even if DB is stolen
userSchema.pre('save', async function(next) {
  // Only hash if the password was actually changed
  if (!this.isModified('passwordHash')) return next();
  if (!this.passwordHash) return next();

  // 12 "rounds" means it's hashed 2^12 = 4096 times (very secure, still fast enough)
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// Instance method: compare entered password with stored hash
// Used during login
userSchema.methods.comparePassword = async function(enteredPassword) {
  return bcrypt.compare(enteredPassword, this.passwordHash);
};

// Virtual: full name (not stored in DB, computed on the fly)
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Ensure virtuals appear in JSON output
userSchema.set('toJSON', {
  virtuals: true,
  // Remove sensitive fields from JSON output
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.refreshToken;
    delete ret.verifyOTP;
    delete ret.verifyOTPExpiry;
    delete ret.resetOTP;
    delete ret.resetOTPExpiry;
    return ret;
  }
});

const User = model('User', userSchema);

// ============================================================
// 3. LISTING MODEL
// ============================================================
const listingSchema = new Schema({
  owner:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
  university:  { type: Schema.Types.ObjectId, ref: 'University', required: true },
  title:       { type: String, required: true, trim: true },
  description: { type: String, required: true },
  address:     { type: String, required: true },
  city:        { type: String, required: true },

  // GeoJSON location for distance-based search
  location: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }  // [longitude, latitude]
  },

  // Listing settings
  genderAllowed:    { type: String, enum: ['ANY', 'MALE', 'FEMALE'], default: 'ANY' },
  isActive:         { type: Boolean, default: true },
  isVerifiedOwner:  { type: Boolean, default: false },
  isGroupFriendly:  { type: Boolean, default: false },
  acceptsFutureRes: { type: Boolean, default: true },

  // Room types — stored as an embedded array in the listing
  // Each item = one room variant (single, shared, studio)
  roomTypes: [{
    type:           { type: String, enum: ['SINGLE', 'SHARED_2', 'SHARED_3PLUS', 'STUDIO'], required: true },
    bedType:        { type: String },                  // e.g. "Single Bed", "Double Bed"
    pricePerMonth:  { type: Number, required: true },  // LKR
    totalSlots:     { type: Number, required: true },
    availableNow:   { type: Number, default: 0 },
    upcomingSlots:  { type: Number, default: 0 },
    availableFrom:  { type: Date },                    // For future vacancies
    isActive:       { type: Boolean, default: true }
  }],

  // Facilities — array of strings like ["wifi", "parking", "kitchen"]
  facilities: [{ type: String }],

  // Photos stored as array of objects
  photos: [{
    url:       { type: String, required: true },
    publicId:  { type: String },    // Cloudinary public_id (needed to delete)
    isPrimary: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 }
  }],

  // Denormalized stats — updated by cron job & after each review
  // Storing these directly avoids slow aggregation queries on every page load
  avgRating:    { type: Number, default: 0, min: 0, max: 5 },
  totalReviews: { type: Number, default: 0 },
  totalViews:   { type: Number, default: 0 },

}, { timestamps: true });

// MongoDB text index for full-text search
// When user types "garden secure near UoC", this index is used
listingSchema.index({ title: 'text', description: 'text', address: 'text', city: 'text' });

// 2dsphere index for geo queries (finding listings near a university)
listingSchema.index({ location: '2dsphere' });

// Other useful indexes for common filters
listingSchema.index({ owner: 1 });
listingSchema.index({ university: 1 });
listingSchema.index({ isActive: 1 });
listingSchema.index({ avgRating: -1 });

const Listing = model('Listing', listingSchema);

// ============================================================
// 4. BOOKING MODEL
// ============================================================
const bookingSchema = new Schema({
  listing:       { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
  roomTypeId:    { type: Schema.Types.ObjectId, required: true },  // Which room type in the listing
  student:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
  owner:         { type: Schema.Types.ObjectId, ref: 'User', required: true },

  type:   { type: String, enum: ['IMMEDIATE', 'FUTURE'], required: true },
  status: { type: String, enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'], default: 'PENDING' },

  moveInDate:      { type: Date, required: true },
  durationMonths:  { type: Number, required: true },  // 3, 6, or 12
  monthlyRent:     { type: Number, required: true },   // LKR snapshot at time of booking
  advanceAmount:   { type: Number, required: true },
  depositAmount:   { type: Number, required: true },
  discountAmount:  { type: Number, default: 0 },
  totalDue:        { type: Number, required: true },

  paymentMethod:  { type: String, enum: ['CARD', 'BANK_TRANSFER', 'EZCAST', 'MCASH'] },
  paymentStatus:  { type: String, enum: ['PENDING', 'PAID', 'REFUNDED'], default: 'PENDING' },
  paymentRef:     { type: String },  // Payment gateway reference

  notes:       { type: String },    // Student's message to owner
  confirmedAt: { type: Date },
  cancelledAt: { type: Date },
  cancelReason:{ type: String },

}, { timestamps: true });

bookingSchema.index({ student: 1 });
bookingSchema.index({ owner: 1 });
bookingSchema.index({ listing: 1 });
bookingSchema.index({ status: 1 });

const Booking = model('Booking', bookingSchema);

// ============================================================
// 5. REVIEW MODEL
// ============================================================
const reviewSchema = new Schema({
  listing:  { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
  booking:  { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },  // One review per booking
  student:  { type: Schema.Types.ObjectId, ref: 'User', required: true },

  // Overall rating (required) + per-category ratings (optional)
  rating:          { type: Number, required: true, min: 1, max: 5 },
  ratingClean:     { type: Number, min: 1, max: 5 },   // Cleanliness
  ratingLocation:  { type: Number, min: 1, max: 5 },   // Location
  ratingValue:     { type: Number, min: 1, max: 5 },   // Value for money
  ratingOwner:     { type: Number, min: 1, max: 5 },   // Owner responsiveness

  comment:      { type: String },
  roomType:     { type: String },   // e.g. "Single Room"
  stayDuration: { type: String },   // e.g. "12 months"
  helpfulCount: { type: Number, default: 0 },
  isApproved:   { type: Boolean, default: true },

}, { timestamps: true });

reviewSchema.index({ listing: 1 });
reviewSchema.index({ student: 1 });

const Review = model('Review', reviewSchema);

// ============================================================
// 6. PAYMENT MODEL
// ============================================================
const paymentSchema = new Schema({
  booking:   { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
  student:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  amount:    { type: Number, required: true },   // LKR
  currency:  { type: String, default: 'LKR' },
  method:    { type: String, enum: ['CARD', 'BANK_TRANSFER', 'EZCAST', 'MCASH'] },
  status:    { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'], default: 'PENDING' },
  gateway:   { type: String },            // e.g. "payhere"
  gatewayRef:{ type: String },            // Transaction ID from gateway
  gatewayResponse: { type: Schema.Types.Mixed },  // Raw JSON from gateway
  paidAt:    { type: Date },
}, { timestamps: true });

const Payment = model('Payment', paymentSchema);

// ============================================================
// 7. SAVED LISTING MODEL (Favourites)
// ============================================================
const savedListingSchema = new Schema({
  student: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  listing: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
}, { timestamps: true });

// Compound unique index: one student can save a listing only once
savedListingSchema.index({ student: 1, listing: 1 }, { unique: true });

const SavedListing = model('SavedListing', savedListingSchema);

// ============================================================
// 8. NOTIFICATION MODEL
// ============================================================
const notificationSchema = new Schema({
  user:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type:    { type: String, required: true },   // e.g. "BOOKING_CONFIRMED"
  title:   { type: String, required: true },
  body:    { type: String, required: true },
  data:    { type: Schema.Types.Mixed },        // Extra data like { bookingId: '...' }
  isRead:  { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ user: 1, isRead: 1 });

const Notification = model('Notification', notificationSchema);

// Export all models so other files can use them
module.exports = { University, User, Listing, Booking, Review, Payment, SavedListing, Notification, generateOTP };
