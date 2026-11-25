/**
 * Durable Preparation Reminder Background Worker
 * Polls MongoDB on startup and on a steady interval using atomic claim locks
 * so reminders survive restarts and never duplicate across instances.
 */

const { PreparationReminderService } = require('../services/preparationReminderService');

const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds
let reminderInterval = null;
let isProcessing = false;

async function runReminderTick() {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const result = await PreparationReminderService.processDueReminders(new Date());
    if (result.processedCount > 0 || result.failedCount > 0) {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          component: 'PreparationReminderWorker',
          action: 'TICK_PROCESSED',
          ...result,
        })
      );
    }
  } catch (err) {
    console.error('[PreparationReminderWorker] Error in reminder tick:', err.message);
  } finally {
    isProcessing = false;
  }
}

function startPreparationReminderWorker() {
  if (reminderInterval) return;

  // Run immediately on startup to recover any reminders due during downtime/restart
  setImmediate(() => {
    runReminderTick().catch(() => {});
  });

  reminderInterval = setInterval(() => {
    runReminderTick().catch(() => {});
  }, POLL_INTERVAL_MS);

  if (typeof reminderInterval.unref === 'function') {
    reminderInterval.unref();
  }

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      component: 'PreparationReminderWorker',
      action: 'WORKER_STARTED',
      pollIntervalMs: POLL_INTERVAL_MS,
    })
  );
}

function stopPreparationReminderWorker() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}

module.exports = {
  startPreparationReminderWorker,
  stopPreparationReminderWorker,
  runReminderTick,
};
