import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
export const backupDigest = async raw => bytesToHex(sha256(new TextEncoder().encode(raw)));
// Transport only. Financial models and JSON schemas remain owned by SplitHistory.
export function shareAdapter({ Share, Filesystem, directory, id = () => crypto.randomUUID(), base64 }) {
 return {
  supported: () => true,
  async share({ title, text, files = [] }) {
   const paths = [];
   let delivered = false;
   try {
    for (let i = 0; i < files.length; i++) {
     const path = `split-share/${id()}-${i}.png`;
     paths.push(path);
     await Filesystem.writeFile({ path, data: await base64(files[i]), directory, recursive: true });
    }
    const uris = [];
    for (const path of paths) uris.push((await Filesystem.getUri({ path, directory })).uri);
    await Share.share({ title, text, ...(uris.length ? { files: uris } : {}), dialogTitle: 'Поделиться Split' });
    delivered = true;
    return { status: 'shared', withFiles: uris.length > 0 };
   } catch (error) {
    const cancelled = /cancel|dismiss/i.test(error?.message || '');
    return cancelled ? { status: 'cancelled' } : { status: 'fallback', reason: 'Системный обмен не выполнен. Используйте текст или повторите попытку.' };
   } finally {
    // A recipient may read the URI after the chooser resolves. Retain successful
    // deliveries in app cache; purge old files on later launches, never immediately.
    if (!delivered) for (const path of paths) try { await Filesystem.deleteFile({ path, directory }); } catch (_) {}
   }
  }
 };
}

// Opt-in migration rehearsal: localStorage stays authoritative and unchanged.
// Write immutable, checksummed versions; publish the pointer only after read-back.
export function backupVault({ Preferences, digest, validate, id = () => crypto.randomUUID() }) {
 const pointer = 'split-native-backup-current';
 async function read(key) {
  const { value } = await Preferences.get({ key });
  if (!value) throw Error('Резервная копия отсутствует');
  const envelope = JSON.parse(value);
  if (envelope.version !== 1 || typeof envelope.raw !== 'string' || await digest(envelope.raw) !== envelope.sha256) throw Error('Контрольная сумма резервной копии неверна');
  validate(envelope.raw);
  return envelope.raw;
 }
 return {
  async save(raw) {
   validate(raw);
   const key = `split-native-backup-${id()}`;
   const value = JSON.stringify({ version: 1, raw, sha256: await digest(raw) });
   await Preferences.set({ key, value });
   if (await read(key) !== raw) throw Error('Ошибка проверки записи');
   await Preferences.set({ key: pointer, value: key });
   return key;
  },
  async restore() {
   const { value } = await Preferences.get({ key: pointer });
   if (!value?.startsWith('split-native-backup-') || value === pointer) throw Error('Резервная копия отсутствует');
   return read(value); // caller must preview and confirm using the existing importer
  }
 };
}
