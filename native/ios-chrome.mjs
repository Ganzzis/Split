// Native owns presentation; the existing web shell remains the single navigation authority.
export async function installIOSChrome({ Chrome, document, window }) {
 let preparingModal = false;
 let pending = false, last = '', revision = 0, activeKey = '', activePromise, lastReply;
 const state = () => ({ view: document.body.dataset.view || 'history', title: document.querySelector('#editor-title')?.textContent || 'Расчёт',
  hasCurrent: !document.querySelector('.mobile-dock [data-view="calculation"]').disabled,
  dark: document.documentElement.dataset.theme === 'dark', modal: preparingModal || !!document.querySelector('dialog[open]'), viewportWidth: window.innerWidth, scrolled: window.scrollY > 16 });
 const publishProbe = reply => {
  // XCTest-only: the acknowledgement reports the real UIKit isHidden property,
  // not a second JS prediction of whether tabs ought to be hidden.
  if (!window.__SPLIT_UI_TESTS__ || typeof reply?.tabsHidden !== 'boolean') return;
  let probe = document.getElementById('native-tabs-probe');
  if (!probe) {
   probe = document.createElement('span'); probe.id = 'native-tabs-probe';
   probe.style.cssText = 'position:absolute;top:1px;left:1px;font-size:1px;color:transparent;pointer-events:none';
  }
  const text = reply.tabsHidden ? 'native-tabs-hidden' : 'native-tabs-visible';
  if (probe.textContent !== text) probe.textContent = text;
  const parent = [...document.querySelectorAll('dialog[open]')].at(-1) || document.body;
  if (probe.parentElement !== parent) parent.append(probe);
 };
 const send = async override => {
  const next = {...state(), ...override}, key = JSON.stringify(next);
  if (last === key && !activeKey) { publishProbe(lastReply); return lastReply; }
  if (activeKey === key) return activePromise;
  const ticket = ++revision; activeKey = key;
  activePromise = Chrome.setState(next);
  try {
   const reply = await activePromise;
   if (ticket === revision) { last = key; lastReply = reply; publishProbe(reply); document.documentElement.classList.add('ios-native-chrome'); }
   return reply;
  } finally { if (ticket === revision) activeKey = ''; }
 };
 const sync = () => {
  if (pending) return; pending = true;
  window.requestAnimationFrame(() => { pending = false; send().catch(() => {}); });
 };
 window.SplitNative ||= {};
 window.SplitNative.beforeModalOpen = async () => {
  preparingModal = true;
  try {
   const reply = await send();
   if (reply?.tabsHidden !== true) throw Error('Native tabs did not acknowledge hiding');
  } catch (error) { preparingModal = false; sync(); throw error; }
 };
 window.SplitNative.afterModalOpen = () => { preparingModal = false; sync(); };
 await Chrome.addListener('action', ({ action, view }) => {
  if (action === 'refresh') last = '';
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
 const modalSync = () => { send().catch(() => {}); };
 const modalObserver = new MutationObserver(modalSync);
 modalObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
 for (const dialog of document.querySelectorAll('dialog')) {
  const open = dialog.showModal.bind(dialog);
  dialog.showModal = () => { open(); modalSync(); };
  dialog.addEventListener('close', modalSync);
 }
 window.addEventListener('scroll', sync, { passive: true });
 window.addEventListener('resize', sync, { passive: true });
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
