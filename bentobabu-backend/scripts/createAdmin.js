/**
 * BentoBabu — Admin Account Creation & Password Reset CLI
 *
 * Usage:
 *   node scripts/createAdmin.js <email> <password> [name] [phone]
 *
 * Example:
 *   node scripts/createAdmin.js newadmin@bentobabu.in MyStrongPassword@123 "Head Chef" "9876543299"
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');
const connectDB = require('../app/config/db');
const { User } = require('../app/models');

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  let [email, password, name, phone] = process.argv.slice(2);

  if (!email) {
    email = await prompt('Enter Admin Email (e.g. admin@bentobabu.in): ');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('❌ Error: A valid email address is required.');
    process.exit(1);
  }

  if (!password) {
    password = await prompt('Enter Admin Password (min 8 chars): ');
  }
  if (!password || password.length < 8) {
    console.error('❌ Error: Password must be at least 8 characters long.');
    process.exit(1);
  }

  if (!name) {
    name = (await prompt('Enter Admin Full Name [BentoBabu Administrator]: ')) || 'BentoBabu Administrator';
  }
  if (!phone) {
    phone = (await prompt('Enter 10-digit Phone [9876543210]: ')) || '9876543210';
  }

  console.log('\nConnecting to database...');
  await connectDB();

  const hashedPassword = await bcrypt.hash(password, 12);

  const existingUser = await User.findOne({ email: email.toLowerCase() });

  if (existingUser) {
    existingUser.name = name;
    existingUser.password = hashedPassword;
    existingUser.role = 'ADMIN';
    existingUser.phone = phone;
    existingUser.isActive = true;
    existingUser.isEmailVerified = true;
    existingUser.isPhoneVerified = true;
    await existingUser.save();

    console.log('\n====================================================');
    console.log('✅ EXISTING USER PROMOTED/UPDATED TO ADMIN:');
    console.log(`   Email:    ${existingUser.email}`);
    console.log(`   Name:     ${existingUser.name}`);
    console.log(`   Role:     ${existingUser.role}`);
    console.log(`   Password: (updated successfully)`);
    console.log('====================================================\n');
  } else {
    const newUser = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone,
      role: 'ADMIN',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    console.log('\n====================================================');
    console.log('✅ NEW ADMIN ACCOUNT CREATED SUCCESSFULLY:');
    console.log(`   Email:    ${newUser.email}`);
    console.log(`   Name:     ${newUser.name}`);
    console.log(`   Role:     ${newUser.role}`);
    console.log(`   Phone:    ${newUser.phone}`);
    console.log('====================================================\n');
  }

  await mongoose.disconnect();
  console.log('Database disconnected. You can now log in at http://localhost:3001/login');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Failed to create admin user:', err);
  process.exit(1);
});

