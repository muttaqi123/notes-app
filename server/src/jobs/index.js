import cron from 'node-cron';
import { sweepDueReminders, purgeOldTrash } from '../services/reminders.service.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * The background work.
 *
 * Both jobs are plain calls into the service layer, which means both are
 * testable by calling the function — the schedule is the only part cron owns,
 * and a scheduler you have to run in order to test your logic is a scheduler
 * that has absorbed your logic.
 *
 * Overlap guards matter more than they look: node-cron will happily start a
 * second run while the first is still going, and two sweeps in flight would
 * send some reminders twice.
 */
let running = { reminders: false, purge: false };
const tasks = [];

export function startJobs() {
  if (!env.jobsEnabled) {
    logger.info('[jobs] disabled');
    return () => {};
  }

  const everyMinute = cron.schedule('* * * * *', async () => {
    if (running.reminders) return;
    running.reminders = true;
    try {
      const { sent } = await sweepDueReminders();
      if (sent) logger.info({ sent }, '[jobs] reminders sent');
    } catch (err) {
      logger.error({ err }, '[jobs] reminder sweep failed');
    } finally {
      running.reminders = false;
    }
  });

  // 03:15, because a purge is not urgent and the middle of the night is when
  // nobody is looking at their trash.
  const nightly = cron.schedule('15 3 * * *', async () => {
    if (running.purge) return;
    running.purge = true;
    try {
      const { purged } = await purgeOldTrash(env.trashRetentionDays);
      if (purged) logger.info({ purged }, '[jobs] old trash purged');
    } catch (err) {
      logger.error({ err }, '[jobs] trash purge failed');
    } finally {
      running.purge = false;
    }
  });

  tasks.push(everyMinute, nightly);
  logger.info('[jobs] reminder sweep and nightly trash purge scheduled');

  return () => tasks.forEach((t) => t.stop());
}
