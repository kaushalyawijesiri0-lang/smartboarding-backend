// ============================================================
// src/controllers/listing.controller.js  —  Listing Logic
//
// Handles:
//   - Searching and filtering listings (with geo distance)
//   - Featured listings for home page
//   - Creating/editing/deleting listings (owner only)
//   - Photo upload/delete
//   - Availability toggles
// ============================================================

const { Listing, University } = require('../models');
const { AppError, asyncHandler, sendSuccess, getPagination } = require('../utils/apiHelpers');
const { deletePhoto } = require('../config/cloudinary');

// ============================================================
// GET /api/v1/listings  —  Search with filters
// ============================================================
exports.searchListings = asyncHandler(async (req, res) => {
  const {
    universityId, keyword, minPrice, maxPrice, maxDistance,
    roomType, gender, facilities, availability, minSlots,
    verifiedOnly, sort
  } = req.query;

  const { page, limit, skip } = getPagination(req.query);

  // We'll build a MongoDB "aggregation pipeline"
  // Think of it as a series of steps that process data one by one
  const pipeline = [];

  // ── STEP 1: Geo filter (distance from university) ──────
  // If universityId is given, find the university's location first
  if (universityId) {
    const uni = await University.findById(universityId);
    if (uni) {
      // $geoNear must be the FIRST stage in aggregation
      // It adds a "dist.calculated" field with distance in meters
      pipeline.push({
        $geoNear: {
          near:           { type: 'Point', coordinates: uni.location.coordinates },
          distanceField:  'distanceMeters',   // New field added to each doc
          maxDistance:    (parseFloat(maxDistance) || 10) * 1000,  // Convert km to meters
          spherical:      true,
          query:          { isActive: true }
        }
      });
    }
  } else {
    // No geo filter — just match active listings
    pipeline.push({ $match: { isActive: true } });
  }

  // ── STEP 2: Build filter conditions ────────────────────
  const matchConditions = {};

  // Text search — $text uses the text index we created on the model
  if (keyword) {
    matchConditions.$text = { $search: keyword };
  }

  // University filter
  if (universityId) {
    matchConditions.university = new (require('mongoose').Types.ObjectId)(universityId);
  }

  // Gender filter
  if (gender && gender !== 'ANY') {
    matchConditions.$or = [{ genderAllowed: 'ANY' }, { genderAllowed: gender }];
  }

  // Verified owner filter
  if (verifiedOnly === 'true') {
    matchConditions.isVerifiedOwner = true;
  }

  // Facilities filter — listing must have ALL listed facilities
  if (facilities) {
    const facilityList = facilities.split(',').map(f => f.trim());
    matchConditions.facilities = { $all: facilityList };
  }

  // Price filter — check if any room type matches the price range
  if (minPrice || maxPrice) {
    const priceFilter = {};
    if (minPrice) priceFilter.$gte = parseInt(minPrice);
    if (maxPrice) priceFilter.$lte = parseInt(maxPrice);
    matchConditions['roomTypes.pricePerMonth'] = priceFilter;
  }

  // Room type filter
  if (roomType) {
    matchConditions['roomTypes.type'] = roomType;
  }

  // Availability filter
  if (availability === 'NOW') {
    matchConditions['roomTypes.availableNow'] = { $gt: 0 };
  } else if (availability === 'FUTURE') {
    matchConditions['roomTypes.upcomingSlots'] = { $gt: 0 };
    matchConditions['roomTypes.availableFrom'] = { $gt: new Date() };
  }

  // Min slots filter (for groups)
  if (minSlots) {
    matchConditions['roomTypes.availableNow'] = { $gte: parseInt(minSlots) };
  }

  pipeline.push({ $match: matchConditions });

  // ── STEP 3: Sort ────────────────────────────────────────
  const sortMap = {
    price_asc:  { 'roomTypes.pricePerMonth': 1 },
    price_desc: { 'roomTypes.pricePerMonth': -1 },
    distance:   { distanceMeters: 1 },
    rating:     { avgRating: -1 },
    newest:     { createdAt: -1 },
  };
  pipeline.push({ $sort: sortMap[sort] || { avgRating: -1, createdAt: -1 } });

  // ── STEP 4: Populate owner and university ───────────────
  pipeline.push(
    { $lookup: { from: 'users', localField: 'owner', foreignField: '_id', as: 'ownerData' } },
    { $unwind: { path: '$ownerData', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'universities', localField: 'university', foreignField: '_id', as: 'universityData' } },
    { $unwind: { path: '$universityData', preserveNullAndEmptyArrays: true } }
  );

  // ── STEP 5: Project (shape the output) ─────────────────
  // Only return fields needed for search result cards
  pipeline.push({
    $project: {
      title:          1,
      address:        1,
      city:           1,
      distanceMeters: 1,
      distanceKm:     { $divide: ['$distanceMeters', 1000] },
      avgRating:      1,
      totalReviews:   1,
      isVerifiedOwner:1,
      isGroupFriendly:1,
      genderAllowed:  1,
      facilities:     1,
      roomTypes:      1,
      photos:         1,
      createdAt:      1,
      'ownerData.firstName':    1,
      'ownerData.lastName':     1,
      'ownerData.avatarUrl':    1,
      'universityData.name':    1,
      'universityData.shortName':1,
    }
  });

  // ── STEP 6: Count total + paginate ─────────────────────
  // Run count and paginated data in parallel for speed
  const countPipeline = [...pipeline, { $count: 'total' }];
  const dataPipeline  = [...pipeline, { $skip: skip }, { $limit: limit }];

  const [countResult, results] = await Promise.all([
    Listing.aggregate(countPipeline),
    Listing.aggregate(dataPipeline)
  ]);

  const total = countResult[0]?.total || 0;

  // Add availability_status to each result for the UI badge
  const enriched = results.map(listing => {
    const hasNow    = listing.roomTypes?.some(r => r.availableNow > 0);
    const hasFuture = listing.roomTypes?.some(r => r.upcomingSlots > 0);
    const minPrice  = Math.min(...(listing.roomTypes?.map(r => r.pricePerMonth) || [0]));
    const primaryPhoto = listing.photos?.find(p => p.isPrimary)?.url || listing.photos?.[0]?.url;

    return {
      ...listing,
      minPrice,
      primaryPhoto,
      availabilityStatus: hasNow ? 'AVAILABLE_NOW' : hasFuture ? 'AVAILABLE_FUTURE' : 'FULLY_BOOKED'
    };
  });

  res.json({
    success: true,
    data: { total, page, limit, pages: Math.ceil(total / limit), results: enriched }
  });
});

// ============================================================
// GET /api/v1/listings/featured
// ============================================================
exports.getFeatured = asyncHandler(async (req, res) => {
  const listings = await Listing.find({ isActive: true })
    .sort({ avgRating: -1, totalViews: -1 })
    .limit(6)
    .populate('university', 'name shortName city')
    .populate('owner', 'firstName lastName avatarUrl ownerProfile');

  sendSuccess(res, 200, listings, 'Featured listings fetched.');
});

// ============================================================
// GET /api/v1/listings/stats  —  Platform stats for home page
// ============================================================
exports.getStats = asyncHandler(async (req, res) => {
  const [totalListings, totalOwners] = await Promise.all([
    Listing.countDocuments({ isActive: true }),
    Listing.distinct('owner').then(ids => ids.length),
  ]);

  sendSuccess(res, 200, {
    activeListings: totalListings,
    verifiedOwners: totalOwners,
    studentsHoused: Math.floor(totalListings * 7.2),  // Estimated
    avgRating: '4.7',
  });
});

// ============================================================
// GET /api/v1/listings/:id  —  Full listing detail
// ============================================================
exports.getListingById = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id)
    .populate('owner', 'firstName lastName avatarUrl ownerProfile phone email')
    .populate('university', 'name shortName city');

  if (!listing || !listing.isActive) throw new AppError('Listing not found.', 404);

  // Increment view count (don't await — fire and forget)
  Listing.findByIdAndUpdate(req.params.id, { $inc: { totalViews: 1 } }).exec();

  sendSuccess(res, 200, listing);
});

// ============================================================
// POST /api/v1/listings  (Owner only)
// ============================================================
exports.createListing = asyncHandler(async (req, res) => {
  const { title, description, address, city, latitude, longitude,
          universityId, genderAllowed, isGroupFriendly, acceptsFutureRes,
          facilities, roomTypes } = req.body;

  const listing = await Listing.create({
    owner:       req.user._id,
    university:  universityId,
    title, description, address, city,
    location:    { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] },
    genderAllowed:    genderAllowed || 'ANY',
    isGroupFriendly:  isGroupFriendly || false,
    acceptsFutureRes: acceptsFutureRes !== false,
    facilities:       facilities || [],
    roomTypes:        roomTypes   || [],
  });

  sendSuccess(res, 201, listing, 'Listing created successfully.');
});

// ============================================================
// PUT /api/v1/listings/:id  (Owner only — own listing)
// ============================================================
exports.updateListing = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new AppError('Listing not found.', 404);

  // Security: ensure only the owner can edit their own listing
  if (listing.owner.toString() !== req.user._id.toString()) {
    throw new AppError('You do not have permission to edit this listing.', 403);
  }

  const allowedUpdates = ['title', 'description', 'address', 'city', 'genderAllowed',
                           'isGroupFriendly', 'acceptsFutureRes', 'facilities', 'roomTypes'];

  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) listing[field] = req.body[field];
  });

  if (req.body.latitude && req.body.longitude) {
    listing.location = { type: 'Point', coordinates: [parseFloat(req.body.longitude), parseFloat(req.body.latitude)] };
  }

  await listing.save();
  sendSuccess(res, 200, listing, 'Listing updated.');
});

// ============================================================
// PATCH /api/v1/listings/:id/availability  (Owner)
// ============================================================
exports.toggleAvailability = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new AppError('Listing not found.', 404);
  if (listing.owner.toString() !== req.user._id.toString()) throw new AppError('Forbidden.', 403);

  listing.isActive = !listing.isActive;
  await listing.save();

  sendSuccess(res, 200, { isActive: listing.isActive },
    listing.isActive ? 'Listing is now visible.' : 'Listing marked as unavailable.');
});

// ============================================================
// DELETE /api/v1/listings/:id  (Owner)
// ============================================================
exports.deleteListing = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new AppError('Listing not found.', 404);
  if (listing.owner.toString() !== req.user._id.toString()) throw new AppError('Forbidden.', 403);

  listing.isActive = false;   // Soft delete — keep data, just hide it
  await listing.save();

  sendSuccess(res, 200, {}, 'Listing removed successfully.');
});

// ============================================================
// GET /api/v1/listings/my  (Owner)
// ============================================================
exports.getMyListings = asyncHandler(async (req, res) => {
  const listings = await Listing.find({ owner: req.user._id })
    .populate('university', 'name shortName')
    .sort({ createdAt: -1 });

  sendSuccess(res, 200, listings);
});

// ============================================================
// POST /api/v1/listings/:id/photos  (Owner)
// Files uploaded via multer middleware — file is on req.file
// ============================================================
exports.uploadPhoto = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new AppError('Listing not found.', 404);
  if (listing.owner.toString() !== req.user._id.toString()) throw new AppError('Forbidden.', 403);

  if (listing.photos.length >= 10) throw new AppError('Maximum 10 photos allowed per listing.', 400);
  if (!req.file) throw new AppError('No file uploaded.', 400);

  // req.file.path = Cloudinary URL (set by multer-storage-cloudinary)
  const photo = {
    url:       req.file.path,
    publicId:  req.file.filename,
    isPrimary: listing.photos.length === 0,   // First photo is primary by default
    sortOrder: listing.photos.length
  };

  listing.photos.push(photo);
  await listing.save();

  sendSuccess(res, 201, photo, 'Photo uploaded successfully.');
});

// ============================================================
// DELETE /api/v1/listings/:listingId/photos/:photoId  (Owner)
// ============================================================
exports.deletePhoto = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.listingId);
  if (!listing) throw new AppError('Listing not found.', 404);
  if (listing.owner.toString() !== req.user._id.toString()) throw new AppError('Forbidden.', 403);

  const photoIdx = listing.photos.findIndex(p => p._id.toString() === req.params.photoId);
  if (photoIdx === -1) throw new AppError('Photo not found.', 404);

  const photo = listing.photos[photoIdx];

  // Delete from Cloudinary
  if (photo.publicId) await deletePhoto(photo.publicId);

  // Remove from array
  listing.photos.splice(photoIdx, 1);

  // If deleted photo was primary, make the first remaining photo primary
  if (photo.isPrimary && listing.photos.length > 0) listing.photos[0].isPrimary = true;

  await listing.save();
  sendSuccess(res, 200, {}, 'Photo deleted.');
});
