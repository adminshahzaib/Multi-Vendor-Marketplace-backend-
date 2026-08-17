import User from '../models/User.js';

const seedAdmin = async () => {
  const email = (process.env.ADMIN_EMAIL || 'admin@marketplace.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@12345';
  const name = process.env.ADMIN_NAME || 'Marketplace Admin';

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      await existing.save();
      console.log(`Existing user promoted to admin: ${email}`);
    } else {
      console.log(`Admin account ready: ${email}`);
    }
    return;
  }

  await User.create({
    name,
    email,
    password,
    role: 'admin',
  });

  console.log(`Admin account created: ${email}`);
};

export default seedAdmin;
