// Native owns presentation; the existing web shell remains the single navigation authority.
export async function installIOSChrome({ Chrome, document, window }) {
 let pending = false, last = '';
 const state = () => ({ view: document.body.dataset.view || 'history', title: document.querySelector('#editor-title')?.textContent || 'Расчёт',
  hasCurrent: !document.querySelector('.mobile-dock [data-view="calculation"]').disabled,
  dark: document.documentElement.dataset.theme === 'dark', modal: !!document.querySelector('dialog[open]'), scrolled: window.scrollY > 16 });
 const sync = () => {
  if (pending) return; pending = true;
  window.requestAnimationFrame(async () => {
   pending = false; const next = state(), key = JSON.stringify(next); if (last === key) return;
   try { await Chrome.setState(next); last = key; document.documentElement.classList.add('ios-native-chrome'); } catch (_) { /* retain HTML controls on bridge failure */ }
  });
 };
 await Chrome.addListener('action', ({ action, view }) => {
  if (action === 'navigate') document.querySelector(`.mobile-dock [data-view="${['history','calculation','results'].includes(view) ? view : 'history'}"]`)?.click();
  const targets = { theme: '#theme-toggle', back: '#back-history', rename: '#rename-current', export: '#export-current', reset: '#reset-btn', mode: '#switch-mode', import: '#import-file', exportAll: '#export-history', create: '#create-calculation' };
  if (targets[action]) document.querySelector(targets[action])?.click();
  sync(); // rejected transitions must also restore native selection
 });
 const observer = new MutationObserver(sync);
 observer.observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
 observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
 observer.observe(document.querySelector('#editor-title'), { childList: true, subtree: true });
 observer.observe(document.querySelector('.mobile-dock [data-view="calculation"]'), { attributes: true, attributeFilter: ['disabled'] });
 for (const dialog of document.querySelectorAll('dialog')) observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
 window.addEventListener('scroll', sync, { passive: true });
 // Preserve all existing validation/storage handlers; native sheets only collect intent.
 const mapping = { 'rename-dialog': { input: '#rename-name', confirm: '#rename-form button[type="submit"]' },
  'delete-dialog': { confirm: '#confirm-delete', destructive: true }, 'reset-dialog': { confirm: '#confirm-reset', destructive: true },
  'mode-dialog': { confirm: '#confirm-mode' }, 'ui-confirm-dialog': { confirm: '#ui-confirm-accept' } };
 for (const [id, config] of Object.entries(mapping)) {
  const dialog = document.getElementById(id), open = dialog.showModal.bind(dialog);
  dialog.showModal = () => {
   open(); dialog.classList.add('native-proxied');
   const title = dialog.querySelector('h2')?.textContent || 'Подтвердить';
   const message = [...dialog.querySelectorAll('p')].map(p => p.textContent).join('\n');
   Chrome.presentSheet({ title, message, value: config.input ? document.querySelector(config.input).value : '', editing: !!config.input,
    confirm: document.querySelector(config.confirm)?.textContent || 'Подтвердить', destructive: !!config.destructive }).then(result => {
    dialog.addEventListener('close', () => dialog.classList.remove('native-proxied'), { once: true });
    if (!result.confirmed) { dialog.close('cancel'); return; }
    if (config.input) document.querySelector(config.input).value = result.value;
    document.querySelector(config.confirm)?.click();
   }).catch(() => dialog.classList.remove('native-proxied')); // graceful HTML fallback
  };
 }
 const create = document.querySelector('#create-calculation');
 let creating = false, allowCreate = false;
 create.addEventListener('click', async event => {
  if (allowCreate) return;
  event.preventDefault(); event.stopImmediatePropagation(); if (creating) return; creating = true;
  try {
   const result = await Chrome.presentSheet({ title: 'Новый расчёт', message: 'Дайте встрече или поездке короткое название.', value: '', editing: true, confirm: 'Создать', destructive: false });
   if (result.confirmed) {
    create.dataset.nativeName = result.value.trim().slice(0,120) || 'Новый расчёт';
    allowCreate = true; create.click(); allowCreate = false; delete create.dataset.nativeName;
   }
  } catch (_) { /* keep history unchanged if native presentation is unavailable */ } finally { creating = false; }
 }, true);
 sync();
 return { sync };
}
