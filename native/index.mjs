import { installIOSChrome } from './ios-chrome.mjs';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import { App } from '@capacitor/app';
import { Dialog } from '@capacitor/dialog';
import { shareAdapter, backupVault, backupDigest } from './adapters.mjs';

if (Capacitor.isNativePlatform()) {
 const Documents = registerPlugin('SplitDocuments');
 const html = document.documentElement;
 html.classList.add('split-native');
 html.dataset.platform = Capacitor.getPlatform();
 if (Capacitor.getPlatform() === 'ios') installIOSChrome({ Chrome: registerPlugin('SplitChrome'), document, window }).catch(() => {});
 Filesystem.readdir({ path: 'split-share', directory: Directory.Cache }).then(async ({ files }) => {
  for (const file of files) if (/^[a-f0-9-]+-\d+\.png$/.test(file.name) && file.mtime && Date.now() - file.mtime > 86400000) {
   await Filesystem.deleteFile({ path: `split-share/${file.name}`, directory: Directory.Cache }).catch(() => {});
  }
 }).catch(() => {});
 const notify = async message => {
  const toast = document.createElement('div'); toast.className = 'native-notice'; toast.setAttribute('role','status'); toast.textContent = message; (document.querySelector('dialog[open]:not(.native-proxied)') || document.body).append(toast); setTimeout(() => toast.remove(),5000);
 };
 const base64 = blob => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onerror = reject;
  reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(blob);
 });
 window.SplitReports.setAdapter(shareAdapter({ Share, Filesystem, directory: Directory.Cache, base64 }));
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 const motion = () => html.classList.toggle('reduced-motion', reduced.matches);
 reduced.addEventListener('change', motion); motion();
 const syncViewport = () => {
  const vv = visualViewport;
  html.style.setProperty('--native-vh', `${vv?.height || innerHeight}px`);
  html.style.setProperty('--native-keyboard', `${Math.max(0, innerHeight - (vv?.height || innerHeight) - (vv?.offsetTop || 0))}px`);
 };
 visualViewport?.addEventListener('resize', syncViewport); window.addEventListener('resize', syncViewport); syncViewport();
 Keyboard.addListener('keyboardWillShow', () => document.body.classList.add('keyboard-open')).catch(() => {});
 Keyboard.addListener('keyboardWillHide', () => { document.body.classList.remove('keyboard-open'); syncViewport(); }).catch(() => {});
 window.SplitShell.setFeedbackAdapter(() => reduced.matches ? undefined : Haptics.impact({ style: ImpactStyle.Light }));
 for (const dialog of document.querySelectorAll('dialog')) {
  const close = dialog.close.bind(dialog);
  let closing = false;
  dialog.close = value => {
   if (!dialog.open || closing) return;
   if (reduced.matches) { close(value); return; }
   closing = true;
   dialog.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(24px)' }], { duration: 140, easing: 'ease-in' })
    .finished.catch(() => {}).finally(() => { closing = false; close(value); });
  };
  dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close('cancel'); });
 }
 App.addListener('backButton', async () => {
  if (document.body.classList.contains('keyboard-open')) { await Keyboard.hide().catch(() => {}); document.activeElement?.blur(); return; }
  const sheet = [...document.querySelectorAll('dialog[open]')].at(-1);
  if (sheet) { sheet.close('cancel'); return; }
  if (document.body.dataset.view === 'results') { document.querySelector('.mobile-dock [data-view="calculation"]').click(); return; }
  if (document.body.dataset.view === 'calculation') { document.querySelector('#back-history').click(); return; }
  const { value } = await Dialog.confirm({ title: 'Закрыть Split?', message: 'Сохранённая история останется на устройстве.', okButtonTitle: 'Закрыть', cancelButtonTitle: 'Отмена' });
  if (value) App.exitApp();
 }).catch(() => {});

 const vault = backupVault({ Preferences, digest: backupDigest, validate: raw => SplitHistory.decodeBackup(raw) });
 let backupRequested = false;
 window.SplitNative = { ...window.SplitNative,
  async exportJSON(raw, name) {
   if (backupRequested) { backupRequested = false; await vault.save(raw); await notify('Резервная копия записана и проверена. Исходная история не изменена. Для защиты от удаления приложения также сохраните JSON в Файлы.'); return; }
   await Documents.exportJSON({ raw, name });
  }
 };
 function importRaw(raw) {
  const input = document.querySelector('#import-file'), transfer = new DataTransfer();
  transfer.items.add(new File([raw], 'split-import.json', { type: 'application/json' }));
  input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
 }
 const input = document.querySelector('#import-file');
 input.addEventListener('click', async event => {
  event.preventDefault(); event.stopImmediatePropagation();
  try { const result = await Documents.importJSON(); if (!result.cancelled) importRaw(result.raw); }
  catch (_) { await notify('Не удалось прочитать JSON. История не изменена.'); }
 }, true);
 const tools = document.createElement('div'); tools.className = 'native-tools share-buttons';
 function button(label, action) {
  const node = document.createElement('button'); node.type = 'button'; node.className = 'secondary-button'; node.textContent = label;
  node.onclick = async () => { node.disabled = true; try { await action(); } catch (_) { await notify('Операция не выполнена. Исходные данные сохранены.'); } finally { node.disabled = false; } };
  tools.append(node);
 }
 button('Резервная копия на устройстве', () => { backupRequested = true; document.querySelector('#export-history').click(); backupRequested = false; });
 button('Восстановить копию с устройства', async () => importRaw(await vault.restore()));
 button('Эффекты: переключить', async () => {
  const enabled = html.classList.toggle('low-effects'); await Preferences.set({ key: 'split-low-effects', value: String(enabled) });
 });
 Preferences.get({ key: 'split-low-effects' }).then(({ value }) => html.classList.toggle('low-effects', value === 'true')).catch(() => {});
 document.querySelector('#home-screen').append(tools);
 // TXT/PNG save links in the native shell use system delivery, never inert download links.
 document.querySelector('#share-download-png').addEventListener('click', async event => {
  event.preventDefault();
  try { const file = SplitShareUI.selectedFile?.(); if (!file) throw Error('PNG not ready'); const result = await SplitReports.adapter().share({ title: 'Split PNG', text: '', files: [file] }); if (result.status === 'fallback') await notify(result.reason); } catch (_) { await notify('Не удалось передать PNG. Повторите системный обмен.'); }
 });
 document.querySelector('#share-download-png').textContent = 'Отправить эту PNG-страницу';
 document.querySelector('#share-open-png').hidden = true;
 document.querySelector('#share-download-text').textContent = 'Отправить только текст';
 const sheet = document.querySelector('#share-dialog'), body = document.createElement('div');
 body.className = 'native-sheet-content';
 for (const node of [...sheet.children]) if (!node.matches('.sheet-heading,.share-buttons:not(#share-png-actions)')) body.append(node);
 sheet.querySelector('.sheet-heading').after(body);
 // Keep the text action ahead of the readonly preview's independent scroll area.
 sheet.querySelector('.share-text-details summary').after(document.querySelector('#share-download-text'));
 document.querySelector('#share-download-text').onclick = () => Share.share({ title: 'Split', text: document.querySelector('#share-text').value }).catch(() => notify('Системный обмен не выполнен.'));
}
