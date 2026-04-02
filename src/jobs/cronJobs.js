// ============================================================
// src/jobs/cronJobs.js  —  Scheduled Background Tasks
//
// What is a cron job?
//   A cron job is code that runs automatically on a schedule.
//   Like a timer that fires at a set time every day/hour.
//
// We use the 'node-cron' library.
// Cron time format:  second minute hour day month weekday
// Examples:
//   '0 * * * *'      = every hour at :00
//   '0 0 * * *'      = every day at midnight
//   '0 8 * * *'      = every day at 8:00 AM
//   '*/30 * * * *'   = every 30 minutes
// ============================================================

const cron  = require('node-cron');
const { Booking, Listing, Notification } = require('../models');
const { createNotification } = require('../utils/apiHelpers');
const { sendEmail, emailTemplates } = require('../config/mailer');

// ============================================================
// JOB 1: Auto-cancel PENDING bookings not confirmed in 48h
// Runs every hour
// ============================================================
const autoCancelUnconfirmed = async () => {
  console.log('⏰ [CRON] Checking for unconfirmed bookings...');
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);  // 48 hours ago

    const stale = await Booking.find({
      status:    'PENDING',
      createdAt: { $lt: cutoff }
    }).populate('student', 'firstName email').populate('listing', 'title');

    for (const booking of stale) {
      booking.status       = 'CANCELLED';
      booking.cancelledAt  = new Date();
      booking.cancelReason = 'Automatically cancelled: owner did not confirm within 48 hours.';
      await booking.save();

      // Notify student
      await createNotification(Notification, {
        userId: booking.student._id,
        type:   'BOOKING_CANCELLED',
        title:  'Booking Auto-Cancelled',
        body:   `Your booking for "${booking.listing?.title}" was auto-cancelled as the owner did not respond.`,
        data:   { bookingId: booking._id }
      });

      console.log(`  ✅ Auto-cancelled booking ${booking._id}`);
    }

    if (stale.length === 0) console.log('  No stale bookings found.');
  } catch (err) {
    console.error('  ❌ autoCancelUnconfirmed error:', err.message);
  }
};

// ============================================================
// JOB 2: Mark CONFIRMED bookings as COMPLETED
// Runs daily at midnight
// A booking is complete when move-in date + duration has passed
// ============================================================
const completeExpiredBookings = async () => {
  console.log('⏰ [CRON] Completing expired bookings...');
  try {
    const confirmed = await Booking.find({ status: 'CONFIRMED' });
    const now = new Date();

    for (const booking of confirmed) {
      // Calculate end date: move-in date + duration in months
      const endDate = new Date(booking.moveInDate);
      endDate.setMonth(endDate.getMonth() + booking.durationMonths);

      if (now >= endDate) {
        booking.status = 'COMPLETED';
        await booking.save();
        console.log(`  ✅ Completed booking ${booking._id}`);
      }
    }
  } catch (err) {
    console.error('  ❌ completeExpiredBookings error:', err.message);
  }
};

// ============================================================
// JOB 3: Remind owners about upcoming future vacancies
// Runs daily at 8 AM
// Sends email 14 days before the upcoming_date
// ============================================================
const futureVacancyReminder = async () => {
  console.log('⏰ [CRON] Sending future vacancy reminders...');
  try {
    const in14Days = new Date();
    in14Days.setDate(in14Days.getDate() + 14);
    const today = new Date();

    // Find listings with upcoming vacancies in the next 14 days
    const listings = await Listing.find({
      isActive: true,
      'roomTypes.upcomingSlots': { $gt: 0 },
      'roomTypes.availableFrom': { $gte: today, $lte: in14Days }
    }).populate('owner', 'firstName email');

    for (const listing of listings) {
      await createNotification(Notification, {
        userId: listing.owner._id,
        type:   'VACANCY_REMINDER',
        title:  '📅 Upcoming Vacancy in 14 Days',
        body:   `Your listing "${listing.title}" has upcoming vacancies in 2 weeks. Make sure you're ready!`,
        data:   { listingId: listing._id }
      });

      console.log(`  ✅ Reminded owner for listing: ${listing.title}`);
    }
  } catch (err) {
    console.error('  ❌ futureVacancyReminder error:', err.message);
  }
};

// ============================================================
// JOB 4: Notify students when a SAVED listing becomes available
// Runs every 6 hours
// ============================================================
const vacancyAlertForSaved = async () => {
  console.log('⏰ [CRON] Checking vacancy alerts for saved listings...');
  try {
    const { SavedListing } = require('../models');

    // Find saved listings that now have availability
    const saved = await SavedListing.find()
      .populate({
        path: 'listing',
        match: { isActive: true, 'roomTypes.availableNow': { $gt: 0 } },
        select: 'title roomTypes'
      });

    for (const item of saved) {
      if (!item.listing) continue;  // listing didn't match the filter

      await createNotification(Notification, {
        userId: item.student,
        type:   'VACANCY_ALERT',
        title:  '🏠 A Saved Listing is Now Available!',
        body:   `"${item.listing.title}" now has available rooms. Book before it's gone!`,
        data:   { listingId: item.listing._id }
      });
    }
  } catch (err) {
    console.error('  ❌ vacancyAlert error:', err.message);
  }
};

// ============================================================
// START ALL CRON JOBS
// ============================================================
const startCronJobs = () => {
  console.log('⏰ Starting background cron jobs...');

  // Every hour
  cron.schedule('0 * * * *', autoCancelUnconfirmed);

  // Every day at midnight
  cron.schedule('0 0 * * *', completeExpiredBookings);

  // Every day at 8 AM
  cron.schedule('0 8 * * *', futureVacancyReminder);

  // Every 6 hours
  cron.schedule('0 */6 * * *', vacancyAlertForSaved);

  console.log('  ✅ All cron jobs registered.\n');
};

module.exports = { startCronJobs };
