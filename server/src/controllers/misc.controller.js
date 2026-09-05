import * as notifications from '../services/notifications.service.js';
import * as exporter from '../services/export.service.js';

export async function listNotifications(req, res, next) {
  try {
    res.json(await notifications.listNotifications(req.userId, { limit: req.query.limit }));
  } catch (err) { next(err); }
}

export async function markRead(req, res, next) {
  try {
    res.json(await notifications.markRead(req.userId, req.params.id));
  } catch (err) { next(err); }
}

export async function markAllRead(req, res, next) {
  try {
    res.json(await notifications.markAllRead(req.userId));
  } catch (err) { next(err); }
}

export async function clearNotifications(req, res, next) {
  try {
    res.json(await notifications.clearAll(req.userId));
  } catch (err) { next(err); }
}

/**
 * Content-Disposition is what turns a response into a saved file rather than
 * a wall of text in a tab.
 */
export async function exportJson(req, res, next) {
  try {
    const data = await exporter.exportJson(req.userId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="keep-notes-export.json"');
    res.send(JSON.stringify(data, null, 2));
  } catch (err) { next(err); }
}

export async function exportMarkdown(req, res, next) {
  try {
    const md = await exporter.exportMarkdown(req.userId);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="keep-notes-export.md"');
    res.send(md);
  } catch (err) { next(err); }
}
