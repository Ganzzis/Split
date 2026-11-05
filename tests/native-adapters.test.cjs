const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const History = require('../history.js');
const load = () => import('../native/adapters.mjs');
const digest = async raw => createHash('sha256').update(raw).digest('hex');
const validate = raw => History.decodeBackup(raw);

test('native Share writes every PNG before delivering URIs and retains them for recipients', async () => {
 const { shareAdapter } = await load(); const writes = [], deleted = []; let sent;
 const adapter = shareAdapter({ Share: { share: async data => { sent = data; assert.equal(writes.length, 3); } },
  Filesystem: { writeFile: async data => writes.push(data), getUri: async ({ path }) => ({ uri: `file://cache/${path}` }), deleteFile: async ({ path }) => deleted.push(path) },
  directory: 'CACHE', id: () => 'unique', base64: async file => file.bytes });
 assert.deepEqual(await adapter.share({ title: 'Поездка', text: 'Текст', files: [{ bytes: 'a' }, { bytes: 'b' }, { bytes: 'c' }] }), { status: 'shared', withFiles: true });
 assert.equal(sent.text, 'Текст'); assert.equal(sent.files.length, 3); assert.equal(new Set(sent.files).size, 3);
 assert.deepEqual(writes.map(w => w.data), ['a', 'b', 'c']); assert.equal(deleted.length, 0);
});
test('native text-only Share needs no filesystem access', async () => {
 const { shareAdapter } = await load(); let data;
 const adapter = shareAdapter({ Share: { share: async d => { data = d; } }, Filesystem: {}, directory: 'CACHE' });
 assert.deepEqual(await adapter.share({ title: 'Split', text: '100 ₽' }), { status: 'shared', withFiles: false });
 assert.equal(data.files, undefined); assert.equal(data.text, '100 ₽');
});
test('native Share cancellation, failure and partial writes clean only owned files', async () => {
 const { shareAdapter } = await load();
 for (const message of ['Share canceled', 'Permission denied']) {
  const deleted = [];
  const adapter = shareAdapter({ Share: { share: async () => { throw Error(message); } }, Filesystem: {
   writeFile: async () => {}, getUri: async () => ({ uri: 'file://cache/owned.png' }), deleteFile: async ({ path }) => deleted.push(path)
  }, directory: 'CACHE', id: () => 'owned', base64: async () => 'png' });
  const result = await adapter.share({ text: 'x', files: [{}] });
  assert.equal(result.status, message.includes('canceled') ? 'cancelled' : 'fallback');
  assert.deepEqual(deleted, ['split-share/owned-0.png']);
 }
 const deleted = []; let shares = 0;
 const adapter = shareAdapter({ Share: { share: async () => shares++ }, Filesystem: {
  writeFile: async () => { throw Error('disk full'); }, deleteFile: async ({ path }) => deleted.push(path)
 }, directory: 'CACHE', id: () => 'partial', base64: async () => 'png' });
 assert.equal((await adapter.share({ text: 'x', files: [{}] })).status, 'fallback'); assert.equal(shares, 0); assert.deepEqual(deleted, ['split-share/partial-0.png']);
});
function preferences() {
 const values = new Map(); return { values, async get({ key }) { return { value: values.get(key) ?? null }; }, async set({ key, value }) { values.set(key, value); } };
}
test('opt-in native vault round-trips unchanged JSON, never writes localStorage', async () => {
 const { backupVault } = await load(); const p = preferences(); const original = History.encodeBackup([]);
 const vault = backupVault({ Preferences: p, digest, validate, id: () => 'one' });
 await vault.save(original); assert.equal(await vault.restore(), original); assert.deepEqual(History.decodeBackup(await vault.restore()), History.decodeBackup(original));
 const recreated = backupVault({ Preferences: p, digest, validate }); assert.equal(await recreated.restore(), original);
});
test('native vault refuses corruption, invalid JSON and preserves previous pointer on failed read-back', async () => {
 const { backupVault } = await load(); const p = preferences(); let id = 0;
 const vault = backupVault({ Preferences: p, digest, validate, id: () => String(++id) });
 const raw = History.encodeBackup([]); await vault.save(raw);
 await assert.rejects(vault.save('{broken')); assert.equal(await vault.restore(), raw);
 const set = p.set.bind(p); p.set = async ({ key, value }) => set({ key, value: key.endsWith('-2') ? value.replace('"sha256":"', '"sha256":"wrong') : value });
 await assert.rejects(vault.save(raw)); assert.equal(await vault.restore(), raw);
 p.values.set('split-native-backup-1', '{}'); await assert.rejects(vault.restore());
});

test('production backup checksum matches SHA-256 including Cyrillic', async () => {
 const { backupDigest } = await load();
 for (const raw of ['', 'Split — Анна 123,45 ₽', History.encodeBackup([])]) assert.equal(await backupDigest(raw), await digest(raw));
});

test('native backup preserves real balances, compensation and invalid drafts across importer recovery', async () => {
 const { backupVault, backupDigest } = await load();
 const record = { id: 'one', name: 'Поездка', updatedAt: '2026-11-04T12:00:00.000Z', state: {
  target: '', people: [{ id: 'p1', name: 'Анна', paid: 1000.01 }, { id: 'p2', name: 'Борис', paid: 0 }],
  transfers: [{ id: 't1', from: 1, to: 0, amount: 200 }], drafts: { 'paid-p2': '-5' }
 } };
 const raw = History.encodeBackup([record]);
 const vault = backupVault({ Preferences: preferences(), digest: backupDigest, validate });
 await vault.save(raw); const restored = History.decodeBackup(await vault.restore());
 assert.deepEqual(restored, [record]);
 assert.deepEqual(require('../core.js').calculate(restored[0].state), require('../core.js').calculate(record.state));
 const data = new Map(); const storage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) };
 const store = new History.Store(storage); store.load(); const before = storage.getItem(History.KEY);
 const plan = History.planImport(store.list(), restored); assert.equal(plan.added.length, 1); assert.equal(storage.getItem(History.KEY), before);
 store.restore(restored); assert.deepEqual(new History.Store(storage).load(), [record]);
});
