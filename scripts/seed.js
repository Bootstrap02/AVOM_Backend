// Creates the first Super Admin (and optional demo academic structure with fictional names).
// Usage: npm run seed            -> super admin only
//        npm run seed -- --demo  -> plus a fictional demo programme/course/module/batch
const bcrypt = require('bcryptjs');
const { env } = require('../src/config/env');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const User = require('../src/models/User');
const Programme = require('../src/models/Programme');
const Course = require('../src/models/Course');
const Module = require('../src/models/Module');
const Batch = require('../src/models/Batch');

async function main() {
  await connectDatabase();
  const { adminEmail, adminPassword, adminName } = env.seed;
  if (env.isProduction && adminPassword === 'ChangeMe!12345') throw new Error('Set SEED_ADMIN_PASSWORD to your own strong password; the example one is public.');
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({ email: adminEmail, name: adminName, role: 'super_admin', status: 'active', passwordHash: await bcrypt.hash(adminPassword, 12), passwordChangedAt: new Date() });
    console.info(`Created Super Admin ${adminEmail} (change this password after first login).`);
  } else {
    console.info(`Super Admin ${adminEmail} already exists.`);
  }

  if (process.argv.includes('--demo')) {
    // Fictional placeholders only. Official AVOM programme and course names must come from AVOM.
    const programme = await Programme.findOneAndUpdate({ name: 'Demo Programme' }, { description: 'Placeholder for testing', active: true }, { upsert: true, new: true });
    const course = (await Course.findOne({ programme: programme._id, name: 'Demo Course' })) || (await Course.create({ programme: programme._id, name: 'Demo Course', order: 1 }));
    if (!(await Module.exists({ course: course._id }))) await Module.create({ course: course._id, name: 'Demo Module', order: 1 });
    if (!(await Batch.exists({ programme: programme._id }))) await Batch.create({ programme: programme._id, name: 'Demo Batch 1', status: 'open' });
    console.info('Demo structure ready.');
  }
  await disconnectDatabase();
}

main().catch((error) => { console.error(error); process.exit(1); });
