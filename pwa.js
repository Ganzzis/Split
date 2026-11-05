(() => {
 'use strict';
 const banner = document.querySelector('#update-banner'), button = document.querySelector('#update-btn');
 let waitingWorker, requestedUpdate = false;
 const showUpdate = worker => { waitingWorker = worker; banner.hidden = false; };
 // Native shells load bundled assets offline; app updates replace the whole bundle.
 // Keep browser PWA caching separate from the native WebView origin.
 const native = window.Capacitor?.isNativePlatform?.() === true;
 if (!native && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load',async () => {
   try {
    const registration = await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
    if (registration.waiting) showUpdate(registration.waiting);
    registration.addEventListener('updatefound',() => {
     const worker = registration.installing;
     worker?.addEventListener('statechange',() => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(worker);
     });
    });
    registration.update().catch(() => {});
    document.addEventListener('visibilitychange',() => { if (!document.hidden) registration.update().catch(() => {}); });
   } catch (_) {
    const status = document.querySelector('#storage-status');
    if (status.dataset.error !== 'true') status.textContent = 'Данные локальные. Офлайн-режим пока недоступен.';
   }
  });
  button.addEventListener('click',() => {
   document.activeElement?.blur();
   if (document.querySelector('#storage-status').dataset.error === 'true') {
    banner.querySelector('span').textContent = 'Сначала скачайте копию и устраните ошибку сохранения.'; return;
   }
   if (waitingWorker) { requestedUpdate = true; waitingWorker.postMessage({type:'SKIP_WAITING'}); }
  });
  navigator.serviceWorker.addEventListener('controllerchange',() => { if (requestedUpdate) location.reload(); });
 }
 const viewport = window.visualViewport;
 const syncKeyboard = () => {
  const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  document.body.classList.toggle('keyboard-open',editing && !!viewport && viewport.height < innerHeight * .8);
 };
 viewport?.addEventListener('resize',syncKeyboard);
 document.addEventListener('focusin',syncKeyboard);
 document.addEventListener('focusout',() => requestAnimationFrame(syncKeyboard));
})();
