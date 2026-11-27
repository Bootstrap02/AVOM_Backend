// Runs the daily expiry/inactivity sweep once and exits. Use this as a Render Cron Job
// (command: npm run sweep) or any scheduler, instead of relying on the web server staying awake.
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { runExpirySweep } = require('../src/services/expiry.service');

(async () => {
  await connectDatabase();
  const summary = await runExpirySweep();
  console.info('Sweep finished', JSON.stringify(summary));
  await disconnectDatabase();
})().catch((error) => { console.error(error); process.exit(1); });
