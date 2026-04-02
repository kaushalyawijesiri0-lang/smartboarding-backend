// ============================================================
// src/config/cloudinary.js  —  Photo Upload Configuration
// What this file does:
//   - Configures Cloudinary (free photo hosting service)
//   - Sets up multer (middleware that handles file uploads)
//   - When a photo is uploaded, it goes directly to Cloudinary cloud
//   - You get back a URL to save in MongoDB
// ============================================================

const cloudinary = require('cloudinary').v2;
const multer     = require('multer');
const multerCloudinary = require('multer-storage-cloudinary');
const CloudinaryStorage = multerCloudinary.CloudinaryStorage || multerCloudinary.default?.CloudinaryStorage || multerCloudinary;
// Configure Cloudinary with your account credentials from .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Listing Photos Storage ───────────────────────────────
// Files uploaded here go to the "listings" folder in Cloudinary
const listingStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'smartboarding/listings',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 600, crop: 'fill', quality: 'auto' }]
  },
});

// ── Avatar (Profile Photo) Storage ──────────────────────
const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'smartboarding/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 200, height: 200, crop: 'fill', quality: 'auto' }]
  },
});

// multer: middleware that processes incoming multipart/form-data (file uploads)
// limits.fileSize: reject files larger than 10MB
const uploadListingPhoto = multer({ storage: listingStorage, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadAvatar       = multer({ storage: avatarStorage,  limits: { fileSize: 5 * 1024 * 1024 } });

// Helper to delete a photo from Cloudinary by its public_id
const deletePhoto = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Failed to delete from Cloudinary:', err.message);
  }
};

module.exports = { cloudinary, uploadListingPhoto, uploadAvatar, deletePhoto };
