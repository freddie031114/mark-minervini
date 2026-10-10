import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createStore } from './db.js';
import { normalizeTrade, validateImport, SHOT_LABELS, STRUCTURES } from './validate.js';
import { loadDemo } from './demo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.resolve(ROOT, process.env.JOURNAL_DATA_DIR || 'data');
const SHOTS_DIR = path.join(DATA_DIR, 'screenshots');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3000;

const store = createStore(DATA_DIR);
const app = express();

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const bad = (res, msg, fields) => res.status(400).json({ error: msg, fields });
const removeFiles = (files) => {
  for (const f of files) fs.rm(path.join(SHOTS_DIR, path.basename(f)), { force: true }, () => {});
};

app.use('/api', express.json({ limit: '50mb' }));

/* ---- Trades ---- */
app.get('/api/trades', (_req, res) => res.json(store.listTrades()));

app.get('/api/trades/:id', (req, res) => {
  const t = store.getTrade(Number(req.params.id));
  return t ? res.json(t) : res.status(404).json({ error: 'Not found' });
});

app.post('/api/trades', (req, res) => {
  const { value, errors } = normalizeTrade(req.body, { required: ['ticker', 'structure', 'entry_price', 'quantity'] });
  if (Object.keys(errors).length) return bad(res, 'Please fix the highlighted fields', errors);
  value.entry_date ??= localToday();
  value.status = 'open';
  const id = store.insertTrade(value);
  store.setSettings({ last_structure: value.structure, last_setup_tag: value.setup_tag ?? null });
  res.status(201).json(store.getTrade(id));
});

app.put('/api/trades/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = store.getTrade(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { value, errors } = normalizeTrade(req.body);
  for (const k of ['ticker', 'structure', 'entry_price', 'quantity', 'entry_date']) {
    if (k in value && value[k] == null) errors[k] = 'Required';
  }
  if (existing.status === 'closed' && 'exit_price' in value && value.exit_price == null) errors.exit_price = 'Required';
  if (Object.keys(errors).length) return bad(res, 'Please fix the highlighted fields', errors);
  store.updateTrade(id, value);
  res.json(store.getTrade(id));
});

app.post('/api/trades/:id/close', (req, res) => {
  const id = Number(req.params.id);
  if (!store.getTrade(id)) return res.status(404).json({ error: 'Not found' });
  const { value, errors } = normalizeTrade(req.body, { required: ['exit_price'] });
  if (Object.keys(errors).length) return bad(res, 'Please fix the highlighted fields', errors);
  value.exit_date ??= localToday();
  value.fees ??= 0;
  store.updateTrade(id, { ...value, status: 'closed' });
  res.json(store.getTrade(id));
});

app.delete('/api/trades/:id', (req, res) => {
  removeFiles(store.deleteTrade(Number(req.params.id)));
  res.json({ ok: true });
});

/* ---- Screenshots ---- */
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' };

app.post('/api/trades/:id/screenshots', express.raw({ type: 'image/*', limit: '30mb' }), (req, res) => {
  const id = Number(req.params.id);
  if (!store.getTrade(id)) return res.status(404).json({ error: 'Not found' });
  const ext = EXT[(req.headers['content-type'] || '').split(';')[0]];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return bad(res, 'Expected a PNG, JPEG, GIF, WebP or BMP image');
  const label = SHOT_LABELS.includes(req.query.label) ? req.query.label : 'Other';
  const caption = typeof req.query.caption === 'string' && req.query.caption.trim() ? req.query.caption.trim() : null;
  const filename = `t${id}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(SHOTS_DIR, filename), req.body);
  res.status(201).json(store.addScreenshot(id, filename, label, caption));
});

app.delete('/api/screenshots/:id', (req, res) => {
  const s = store.getScreenshot(Number(req.params.id));
  if (s) {
    store.deleteScreenshot(s.id);
    removeFiles([s.filename]);
  }
  res.json({ ok: true });
});

app.use('/screenshots', express.static(SHOTS_DIR, { maxAge: '1d' }));

/* ---- Tags ---- */
app.get('/api/tags', (_req, res) => res.json(store.listTags()));
app.post('/api/tags', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return bad(res, 'Tag name is required');
  if (store.listTags().some((t) => t.name.toLowerCase() === name.toLowerCase())) return bad(res, 'Tag already exists');
  store.addTag(name);
  res.json(store.listTags());
});
app.put('/api/tags/:id', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const id = Number(req.params.id);
  if (!name) return bad(res, 'Tag name is required');
  if (store.listTags().some((t) => t.id !== id && t.name.toLowerCase() === name.toLowerCase())) return bad(res, 'Tag already exists');
  store.renameTag(id, name);
  res.json(store.listTags());
});
app.delete('/api/tags/:id', (req, res) => {
  store.deleteTag(Number(req.params.id));
  res.json(store.listTags());
});

/* ---- Settings ---- */
app.get('/api/info', (_req, res) => res.json({ dataDir: DATA_DIR, driver: store.driver }));
app.get('/api/settings', (_req, res) => res.json(store.getSettings()));
app.put('/api/settings', (req, res) => {
  const b = req.body || {};
  const patch = {};
  if ('last_structure' in b && STRUCTURES.includes(b.last_structure)) patch.last_structure = b.last_structure;
  store.setSettings(patch);
  res.json(store.getSettings());
});

/* ---- Export / import ---- */
function exportData() {
  return {
    app: 'trading-journal',
    version: 1,
    exported_at: new Date().toISOString(),
    settings: {},
    tags: store.listTags().map((t) => t.name),
    trades: store.listTrades().map(({ id, screenshots, ...t }) => ({
      id,
      ...t,
      screenshots: screenshots.map((x) => ({ filename: x.filename, label: x.label, caption: x.caption })),
    })),
  };
}

app.get('/api/export.json', (_req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="trading-journal-${localToday()}.json"`);
  res.json(exportData());
});

app.post('/api/import', (req, res) => {
  const result = validateImport(req.body);
  if (!result.ok) return res.status(400).json({ error: 'Import file is not valid', details: result.errors });
  store.replaceAll(result.data);
  const missing = result.data.trades
    .flatMap((t) => t.screenshots.map((s) => s.filename))
    .filter((f) => !fs.existsSync(path.join(SHOTS_DIR, f)));
  res.json({ ok: true, trades: result.data.trades.length, missingScreenshots: missing.length });
});

/* ---- Demo data ---- */
app.post('/api/demo/load', (_req, res) => {
  removeFiles(store.demoScreenshotFiles());
  store.clearDemo();
  res.json({ ok: true, count: loadDemo(store, SHOTS_DIR) });
});
app.post('/api/demo/clear', (_req, res) => {
  removeFiles(store.demoScreenshotFiles());
  store.clearDemo();
  res.json({ ok: true });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.type === 'entity.parse.failed' ? 'File is not valid JSON' : err.message });
});

/* ---- Front end ---- */
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
} else {
  app.get('/', (_req, res) => res.send('Front end not built. Run `npm start` (it builds first).'));
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Trading journal running at http://localhost:${PORT}`);
  console.log(`Data folder: ${DATA_DIR} (sqlite driver: ${store.driver})`);
});
