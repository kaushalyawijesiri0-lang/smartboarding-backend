// ============================================================
// src/controllers/saved.controller.js
// ============================================================
const savedCtrl = (() => {
  const { SavedListing } = require('../models');
  const { AppError, asyncHandler, sendSuccess, getPagination } = require('../utils/apiHelpers');

  return {
    getSaved: asyncHandler(async (req, res) => {
      const { page, limit, skip } = getPagination(req.query);
      const [total, saved] = await Promise.all([
        SavedListing.countDocuments({ student: req.user._id }),
        SavedListing.find({ student: req.user._id })
          .populate({ path: 'listing', populate: { path: 'university', select: 'name shortName' } })
          .sort({ createdAt: -1 }).skip(skip).limit(limit)
      ]);
      sendSuccess(res, 200, { total, page, limit, saved });
    }),

    saveListing: asyncHandler(async (req, res) => {
      const { listingId } = req.params;
      try {
        await SavedListing.create({ student: req.user._id, listing: listingId });
        sendSuccess(res, 201, {}, 'Listing saved to favourites.');
      } catch (err) {
        if (err.code === 11000) throw new AppError('Listing already saved.', 409);
        throw err;
      }
    }),

    unsaveListing: asyncHandler(async (req, res) => {
      const result = await SavedListing.findOneAndDelete({ student: req.user._id, listing: req.params.listingId });
      if (!result) throw new AppError('Saved listing not found.', 404);
      sendSuccess(res, 200, {}, 'Removed from favourites.');
    }),
  };
})();

// ============================================================
// src/controllers/notification.controller.js
// ============================================================
const notifCtrl = (() => {
  const { Notification } = require('../models');
  const { asyncHandler, sendSuccess, getPagination } = require('../utils/apiHelpers');

  return {
    getAll: asyncHandler(async (req, res) => {
      const { page, limit, skip } = getPagination(req.query);
      const [total, notifications] = await Promise.all([
        Notification.countDocuments({ user: req.user._id }),
        Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit)
      ]);
      sendSuccess(res, 200, { total, page, limit, notifications });
    }),

    getUnreadCount: asyncHandler(async (req, res) => {
      const count = await Notification.countDocuments({ user: req.user._id, isRead: false });
      sendSuccess(res, 200, { count });
    }),

    markRead: asyncHandler(async (req, res) => {
      await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
      sendSuccess(res, 200, {}, 'Marked as read.');
    }),

    markAllRead: asyncHandler(async (req, res) => {
      await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });
      sendSuccess(res, 200, {}, 'All notifications marked as read.');
    }),

    deleteNotification: asyncHandler(async (req, res) => {
      await Notification.findByIdAndDelete(req.params.id);
      sendSuccess(res, 200, {}, 'Notification deleted.');
    }),
  };
})();

// ============================================================
// src/controllers/university.controller.js
// ============================================================
const uniCtrl = (() => {
  const { University } = require('../models');
  const { AppError, asyncHandler, sendSuccess } = require('../utils/apiHelpers');

  return {
    getAll: asyncHandler(async (req, res) => {
      const universities = await University.find({ isActive: true }).sort({ name: 1 });
      sendSuccess(res, 200, universities);
    }),

    getById: asyncHandler(async (req, res) => {
      const uni = await University.findById(req.params.id);
      if (!uni) throw new AppError('University not found.', 404);
      sendSuccess(res, 200, uni);
    }),

    create: asyncHandler(async (req, res) => {
      const { name, shortName, city, latitude, longitude } = req.body;
      const uni = await University.create({
        name, shortName, city,
        location: { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] }
      });
      sendSuccess(res, 201, uni, 'University created.');
    }),

    update: asyncHandler(async (req, res) => {
      const uni = await University.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!uni) throw new AppError('University not found.', 404);
      sendSuccess(res, 200, uni, 'University updated.');
    }),
  };
})();

// ============================================================
// src/controllers/payment.controller.js
// ============================================================
const paymentCtrl = (() => {
  const { Payment, Booking, Notification } = require('../models');
  const { AppError, asyncHandler, sendSuccess, createNotification } = require('../utils/apiHelpers');

  return {
    // Initiate payment — creates a payment record and returns payment info
    initiate: asyncHandler(async (req, res) => {
      const { bookingId } = req.body;
      const booking = await Booking.findById(bookingId).populate('listing', 'title');
      if (!booking) throw new AppError('Booking not found.', 404);
      if (booking.student.toString() !== req.user._id.toString()) throw new AppError('Forbidden.', 403);
      if (booking.paymentStatus === 'PAID') throw new AppError('Booking already paid.', 409);

      const payment = await Payment.create({
        booking:  bookingId,
        student:  req.user._id,
        amount:   booking.totalDue,
        method:   booking.paymentMethod,
        gateway:  'payhere',
        status:   'PENDING',
      });

      // In production: generate PayHere payment form hash here
      // For now: return payment ID so frontend can handle it
      sendSuccess(res, 201, {
        paymentId:  payment._id,
        amount:     payment.amount,
        currency:   'LKR',
        bookingId:  bookingId,
        // PayHere integration: return merchant_id, order_id, hash etc.
        sandbox: process.env.PAYHERE_SANDBOX === 'true',
        merchantId: process.env.PAYHERE_MERCHANT_ID,
        message: 'Payment initiated. Complete payment on the gateway.'
      });
    }),

    // Webhook: called by PayHere/gateway when payment is done
    webhook: asyncHandler(async (req, res) => {
      // In production: verify HMAC signature from gateway here!
      const { order_id, status_code, payment_id } = req.body;

      const payment = await Payment.findById(order_id);
      if (!payment) return res.sendStatus(200);

      if (status_code === '2') {  // PayHere: 2 = SUCCESS
        payment.status     = 'SUCCESS';
        payment.gatewayRef = payment_id;
        payment.paidAt     = new Date();
        await payment.save();

        // Update booking payment status
        const booking = await Booking.findByIdAndUpdate(
          payment.booking,
          { paymentStatus: 'PAID', paymentRef: payment_id },
          { new: true }
        );

        // Notify student
        await createNotification(Notification, {
          userId: payment.student,
          type:   'PAYMENT_SUCCESS',
          title:  'Payment Successful 💰',
          body:   `Your payment of LKR ${payment.amount.toLocaleString()} was received.`,
          data:   { bookingId: payment.booking }
        });
      }

      res.sendStatus(200);  // Always respond 200 to gateway
    }),

    getMyPayments: asyncHandler(async (req, res) => {
      const payments = await Payment.find({ student: req.user._id })
        .populate('booking', 'moveInDate durationMonths status')
        .sort({ createdAt: -1 });
      sendSuccess(res, 200, payments);
    }),
  };
})();

// ============================================================
// src/controllers/admin.controller.js
// ============================================================
const adminCtrl = (() => {
  const { User, Listing, Review, Booking } = require('../models');
  const { asyncHandler, sendSuccess, getPagination } = require('../utils/apiHelpers');

  return {
    getUsers: asyncHandler(async (req, res) => {
      const { page, limit, skip } = getPagination(req.query);
      const filter = {};
      if (req.query.role)   filter.role = req.query.role.toUpperCase();
      if (req.query.active) filter.isActive = req.query.active === 'true';

      const [total, users] = await Promise.all([
        User.countDocuments(filter),
        User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      ]);
      sendSuccess(res, 200, { total, page, limit, users });
    }),

    toggleUserStatus: asyncHandler(async (req, res) => {
      const user = await User.findById(req.params.id);
      if (!user) throw require('../utils/apiHelpers').AppError('User not found', 404);
      user.isActive = !user.isActive;
      await user.save();
      sendSuccess(res, 200, { isActive: user.isActive });
    }),

    verifyOwner: asyncHandler(async (req, res) => {
      const { grant } = req.body;
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { 'ownerProfile.verifiedBadge': grant === true, 'ownerProfile.nicVerified': grant === true },
        { new: true }
      );

      // Also update all their listings
      await Listing.updateMany({ owner: req.params.id }, { isVerifiedOwner: grant === true });

      sendSuccess(res, 200, { verifiedBadge: user.ownerProfile.verifiedBadge },
        grant ? 'Owner verified badge granted.' : 'Verified badge revoked.');
    }),

    getListings: asyncHandler(async (req, res) => {
      const { page, limit, skip } = getPagination(req.query);
      const [total, listings] = await Promise.all([
        Listing.countDocuments(),
        Listing.find().populate('owner', 'firstName lastName email').sort({ createdAt: -1 }).skip(skip).limit(limit)
      ]);
      sendSuccess(res, 200, { total, page, limit, listings });
    }),

    toggleListingStatus: asyncHandler(async (req, res) => {
      const l = await Listing.findById(req.params.id);
      if (!l) throw new (require('../utils/apiHelpers').AppError)('Listing not found', 404);
      l.isActive = !l.isActive;
      await l.save();
      sendSuccess(res, 200, { isActive: l.isActive });
    }),

    getReviews: asyncHandler(async (req, res) => {
      const { page, limit, skip } = getPagination(req.query);
      const filter = {};
      if (req.query.approved !== undefined) filter.isApproved = req.query.approved === 'true';
      const [total, reviews] = await Promise.all([
        Review.countDocuments(filter),
        Review.find(filter).populate('student', 'firstName lastName').populate('listing', 'title').sort({ createdAt: -1 }).skip(skip).limit(limit)
      ]);
      sendSuccess(res, 200, { total, reviews });
    }),

    approveReview: asyncHandler(async (req, res) => {
      const review = await Review.findByIdAndUpdate(req.params.id, { isApproved: req.body.approve }, { new: true });
      sendSuccess(res, 200, review);
    }),

    getPlatformStats: asyncHandler(async (req, res) => {
      const [totalUsers, totalListings, totalBookings, totalRevenue] = await Promise.all([
        User.countDocuments(),
        Listing.countDocuments({ isActive: true }),
        Booking.countDocuments(),
        Booking.aggregate([
          { $match: { status: 'CONFIRMED' } },
          { $group: { _id: null, total: { $sum: '$monthlyRent' } } }
        ])
      ]);
      sendSuccess(res, 200, {
        totalUsers, totalListings, totalBookings,
        totalMonthlyRevenue: totalRevenue[0]?.total || 0
      });
    }),
  };
})();

module.exports = { savedCtrl, notifCtrl, uniCtrl, paymentCtrl, adminCtrl };
