// ============================================================
// src/utils/seed.js  —  Database Seeder
//
// What this does:
//   Populates your MongoDB database with initial data so you
//   can test the app immediately without manually adding data.
//
// Run with:  npm run seed
//
// What it creates:
//   - Admin user account
//   - 8 Sri Lankan universities with GPS coordinates
//   - 1 sample owner + 2 sample student accounts
//   - 3 sample boarding listings with rooms and facilities
// ============================================================
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
require('dotenv').config();
const mongoose = require('mongoose');
const { University, User, Listing } = require('../models');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data (be careful — only use in development!)
    if (process.env.NODE_ENV !== 'production') {
      await University.deleteMany({});
      await User.deleteMany({});
      await Listing.deleteMany({});
      console.log('🗑️  Cleared existing seed data');
    }

    // ── 1. Create Universities ──────────────────────────
    const universities = await University.insertMany([
      {
        name: 'University of Colombo', shortName: 'UoC', city: 'Colombo',
        location: { type: 'Point', coordinates: [79.8612, 6.9022] }
      },
      {
        name: 'University of Peradeniya', shortName: 'UoP', city: 'Kandy',
        location: { type: 'Point', coordinates: [80.5986, 7.2543] }
      },
      {
        name: 'University of Kelaniya', shortName: 'UoK', city: 'Kelaniya',
        location: { type: 'Point', coordinates: [79.9201, 7.0014] }
      },
      {
        name: 'University of Moratuwa', shortName: 'UoM', city: 'Moratuwa',
        location: { type: 'Point', coordinates: [79.9012, 6.7964] }
      },
      {
        name: 'University of Jaffna', shortName: 'UoJ', city: 'Jaffna',
        location: { type: 'Point', coordinates: [80.0255, 9.6615] }
      },
      {
        name: 'SLIIT', shortName: 'SLIIT', city: 'Malabe',
        location: { type: 'Point', coordinates: [79.9709, 6.9141] }
      },
      {
        name: 'NSBM Green University', shortName: 'NSBM', city: 'Pitipana',
        location: { type: 'Point', coordinates: [80.0476, 6.8214] }
      },
      {
        name: 'University of Sri Jayewardenepura', shortName: 'USJ', city: 'Nugegoda',
        location: { type: 'Point', coordinates: [79.8990, 6.8703] }
      }
    ]);
    console.log(`✅ Created ${universities.length} universities`);

    // ── 2. Create Admin User ────────────────────────────
    const admin = await User.create({
      role:         'ADMIN',
      firstName:    'Super',
      lastName:     'Admin',
      email:        process.env.ADMIN_EMAIL || 'admin@smartboarding.lk',
      passwordHash: process.env.ADMIN_PASSWORD || 'Admin@1234',
      isVerified:   true,
      isActive:     true,
    });
    console.log(`✅ Admin created: ${admin.email}`);

    // ── 3. Create Sample Owner ──────────────────────────
    const owner = await User.create({
      role:      'OWNER',
      firstName: 'Nalini',
      lastName:  'Perera',
      email:     'owner@demo.lk',
      phone:     '+94771234567',
      passwordHash: 'Owner@1234',
      isVerified:   true,
      ownerProfile: {
        nicNumber:     '198512345678',
        nicVerified:   true,
        businessName:  'Perera Boarding Houses',
        verifiedBadge: true,
      }
    });
    console.log(`✅ Owner created: ${owner.email}`);

    // ── 4. Create Sample Students ───────────────────────
    const student1 = await User.create({
      role:      'STUDENT',
      firstName: 'Kasun',
      lastName:  'De Silva',
      email:     'kasun@demo.lk',
      phone:     '+94779876543',
      passwordHash: 'Student@1234',
      isVerified:   true,
      studentProfile: {
        university:  universities[0]._id,
        studentIdNo: 'CS/2024/001',
        faculty:     'Faculty of Science',
        yearOfStudy: 2,
        gender:      'MALE',
      }
    });

    const student2 = await User.create({
      role:      'STUDENT',
      firstName: 'Ayesha',
      lastName:  'Fernando',
      email:     'ayesha@demo.lk',
      phone:     '+94762345678',
      passwordHash: 'Student@1234',
      isVerified:   true,
      studentProfile: {
        university:  universities[0]._id,
        studentIdNo: 'IT/2024/045',
        faculty:     'Faculty of Computing',
        yearOfStudy: 1,
        gender:      'FEMALE',
      }
    });
    console.log(`✅ Students created: ${student1.email}, ${student2.email}`);

    // ── 5. Create Sample Listings ───────────────────────
    await Listing.create({
      owner:      owner._id,
      university: universities[0]._id,   // UoC
      title:      'Sunset View Boarding House',
      description: 'A comfortable and secure boarding facility designed specifically for university students. Located just 10 minutes walk from the University of Colombo. All rooms are fully furnished, reliable WiFi included, and bills are covered.',
      address:    'No. 45, Kandy Road, Colombo 7',
      city:       'Colombo',
      location:   { type: 'Point', coordinates: [79.8700, 6.9100] },
      genderAllowed:    'ANY',
      isActive:         true,
      isVerifiedOwner:  true,
      isGroupFriendly:  true,
      acceptsFutureRes: true,
      facilities: ['wifi', 'kitchen', 'parking', 'laundry', 'security'],
      roomTypes: [
        {
          type: 'SINGLE', bedType: 'Single Bed',
          pricePerMonth: 18000, totalSlots: 6, availableNow: 2,
          upcomingSlots: 3, availableFrom: new Date('2025-07-01'), isActive: true
        },
        {
          type: 'SHARED_2', bedType: 'Single Bed',
          pricePerMonth: 11000, totalSlots: 8, availableNow: 4,
          upcomingSlots: 0, isActive: true
        }
      ],
      avgRating: 4.8, totalReviews: 32
    });

    await Listing.create({
      owner:      owner._id,
      university: universities[0]._id,
      title:      'Green Garden Residence',
      description: 'Peaceful boarding house with a beautiful garden. 15 minutes from university by bus. Great for students who prefer a quiet study environment.',
      address:    'No. 12, Havelock Road, Colombo 5',
      city:       'Colombo',
      location:   { type: 'Point', coordinates: [79.8750, 6.8950] },
      genderAllowed:    'FEMALE',
      isActive:         true,
      isVerifiedOwner:  false,
      isGroupFriendly:  false,
      acceptsFutureRes: true,
      facilities: ['wifi', 'security', 'garden'],
      roomTypes: [
        {
          type: 'SINGLE', bedType: 'Single Bed',
          pricePerMonth: 12500, totalSlots: 5, availableNow: 0,
          upcomingSlots: 5, availableFrom: new Date('2025-05-01'), isActive: true
        }
      ],
      avgRating: 4.5, totalReviews: 18
    });

    await Listing.create({
      owner:      owner._id,
      university: universities[0]._id,
      title:      'Mahaweli Heights Annex',
      description: 'Premium boarding with air conditioning and all meals included. Just 5 minutes walk from campus. Highly recommended for first-year students.',
      address:    'No. 78, Peradeniya Road, Colombo 10',
      city:       'Colombo',
      location:   { type: 'Point', coordinates: [79.8650, 6.9050] },
      genderAllowed:    'ANY',
      isActive:         true,
      isVerifiedOwner:  true,
      isGroupFriendly:  false,
      acceptsFutureRes: true,
      facilities: ['wifi', 'kitchen', 'laundry', 'ac', 'meals', 'security'],
      roomTypes: [
        {
          type: 'SINGLE', bedType: 'Double Bed',
          pricePerMonth: 22000, totalSlots: 4, availableNow: 1,
          upcomingSlots: 0, isActive: true
        },
        {
          type: 'STUDIO', bedType: 'Queen Bed',
          pricePerMonth: 28000, totalSlots: 2, availableNow: 1,
          upcomingSlots: 0, isActive: true
        }
      ],
      avgRating: 4.9, totalReviews: 47
    });

    console.log('✅ Created 3 sample listings');
    console.log('\n🎉 Database seeded successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Demo Login Credentials:');
    console.log(`  Admin:   ${admin.email} / ${process.env.ADMIN_PASSWORD || 'Admin@1234'}`);
    console.log('  Owner:   owner@demo.lk   / Owner@1234');
    console.log('  Student: kasun@demo.lk   / Student@1234');
    console.log('  Student: ayesha@demo.lk  / Student@1234');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await mongoose.disconnect();
    process.exit(0);

  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
};

seed();
