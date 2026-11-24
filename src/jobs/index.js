const cron = require('node-cron');
const { env } = require('../config/env');
const { runExpirySweep } = require('../services/expiry.service');

let running = false;

function startJobs() {
  if (!env.jobs.enabled) {
    console.info('Background jobs are disabled (set RUN_JOBS=true to enable).');
    return;
  }
  cron.schedule(
    env.jobs.expiryCron,
    async () => {
      if (running) return; // never overlap two sweeps
      running = true;
      try {
        const summary = await runExpirySweep();
        console.info('Expiry sweep finished', JSON.stringify(summary));
      } catch (error) {
        console.error('Expiry sweep failed:', error);
      } finally {
        running = false;
      }
    },
    { timezone: env.jobs.timezone },
  );
  console.info(`Expiry sweep scheduled: "${env.jobs.expiryCron}" (${env.jobs.timezone})`);
}

module.exports = { startJobs };
