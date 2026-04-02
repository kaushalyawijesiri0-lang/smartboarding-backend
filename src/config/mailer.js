// ============================================================
// src/config/mailer.js  —  Email Sending Setup
// What this file does:
//   - Sets up Nodemailer to send emails via Gmail
//   - Provides a simple sendEmail() function you can use anywhere
//   - Used for: OTP verification, booking confirmations, etc.
// ============================================================

const nodemailer = require('nodemailer');

// Create a "transporter" — the connection to Gmail's SMTP server
// SMTP = Simple Mail Transfer Protocol (the standard email sending protocol)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,   // Your Gmail address
    pass: process.env.EMAIL_PASS,   // Gmail App Password (NOT your Gmail password)
  }
});

/**
 * Send an email
 * @param {string} to       - Recipient email address
 * @param {string} subject  - Email subject line
 * @param {string} html     - HTML content of the email body
 */
const sendEmail = async ({ to, subject, html }) => {
  try {
    const info = await transporter.sendMail({
      from: `"SmartBoarding Finder" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html,
    });
    console.log(`📧 Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    // Log the error but DON'T crash the app — email failure is non-critical
    console.error('❌ Email send failed:', err.message);
    throw err;
  }
};

// ── Email HTML Templates ────────────────────────────────
// Simple HTML email templates. You can make these prettier.

const emailTemplates = {

  // Sent after user registers — they must click this OTP to verify
  verifyEmail: (name, otp) => ({
    subject: 'Verify Your SmartBoarding Account',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#1D4ED8">🏠 SmartBoarding Finder</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Welcome! Please verify your email using the OTP below.</p>
        <div style="background:#EFF6FF;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
          <p style="font-size:32px;font-weight:bold;color:#1D4ED8;letter-spacing:8px">${otp}</p>
          <p style="color:#6B7280;font-size:13px">This code expires in <strong>10 minutes</strong></p>
        </div>
        <p style="color:#6B7280;font-size:13px">If you didn't register, ignore this email.</p>
      </div>`
  }),

  // Sent when student successfully books
  bookingConfirmed: (studentName, listingTitle, moveInDate, amount) => ({
    subject: '✅ Your Booking is Confirmed — SmartBoarding',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#1D4ED8">🏠 SmartBoarding Finder</h2>
        <p>Hi <strong>${studentName}</strong>,</p>
        <p>Your booking has been <strong style="color:#10B981">confirmed!</strong></p>
        <div style="background:#D1FAE5;border-radius:8px;padding:16px;margin:16px 0">
          <p><strong>Property:</strong> ${listingTitle}</p>
          <p><strong>Move-in Date:</strong> ${moveInDate}</p>
          <p><strong>Amount Paid:</strong> LKR ${amount.toLocaleString()}</p>
        </div>
        <p>The owner will contact you before your move-in date. Good luck with your studies! 🎓</p>
      </div>`
  }),

  // Sent to owner when a new booking comes in
  newBookingOwner: (ownerName, studentName, listingTitle, moveInDate) => ({
    subject: '🔔 New Booking Request — SmartBoarding',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#1D4ED8">🏠 SmartBoarding Finder</h2>
        <p>Hi <strong>${ownerName}</strong>,</p>
        <p>You have a new booking request!</p>
        <div style="background:#EFF6FF;border-radius:8px;padding:16px;margin:16px 0">
          <p><strong>Student:</strong> ${studentName}</p>
          <p><strong>Property:</strong> ${listingTitle}</p>
          <p><strong>Move-in Date:</strong> ${moveInDate}</p>
        </div>
        <p>Log in to your dashboard to confirm or manage this booking.</p>
      </div>`
  }),

  // Password reset email with OTP
  passwordReset: (name, otp) => ({
    subject: '🔑 Reset Your SmartBoarding Password',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#1D4ED8">🏠 SmartBoarding Finder</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your password reset OTP:</p>
        <div style="background:#FEF3C7;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
          <p style="font-size:32px;font-weight:bold;color:#92400E;letter-spacing:8px">${otp}</p>
          <p style="color:#6B7280;font-size:13px">Expires in <strong>10 minutes</strong></p>
        </div>
        <p style="color:#6B7280;font-size:13px">If you didn't request this, your account is safe — ignore this email.</p>
      </div>`
  }),
};

module.exports = { sendEmail, emailTemplates };
