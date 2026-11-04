/* Presentation-only navigation and motion. No financial or storage state lives here. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  const running=new Set();
  const reduced=()=>preference.matches;
  function animate(node,frames,options){const animation=node.animate(frames,options);running.add(animation);animation.finished.then(()=>running.delete(animation),()=>running.delete(animation));return animation;}
  preference.addEventListener('change',()=>{if(preference.matches)for(const animation of running)animation.cancel();});
  let feedbackAdapter=()=>{};
  function feedback(kind){try{Promise.resolve(feedbackAdapter(kind)).catch(()=>{});}catch(_){} }
  function enter(node){if(node && node.getClientRects().length && !reduced())animate(node,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:190,easing:'cubic-bezier(.2,.75,.25,1)'});}
  function exit(node){if(!node || !node.getClientRects().length || reduced())return Promise.resolve();return animate(node,[{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.97)'}],{duration:120,easing:'ease-in'}).finished.catch(()=>{});}
  function pulse(node){if(node && node.getClientRects().length && !reduced())animate(node,[{opacity:.55},{opacity:1}],{duration:180,easing:'ease-out'});}
  function compactActions(container,icons){
    [...container.children].forEach((button,i)=>{if(!icons[i])return;const label=button.textContent;button.setAttribute('aria-label',label);button.title=label;button.classList.add('compact-action');const paths={
      '✎':'m15 4 5 5M4 20l4-1L20 7a2 2 0 0 0-5-5L3 14l-1 5z',
      '⧉':'M8 8h12v12H8zM16 8V4H4v12h4',
      '↓':'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
      '×':'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5',
      '⇄':'M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4'
    };const glyph=document.createElementNS('http://www.w3.org/2000/svg','svg');glyph.setAttribute('viewBox','0 0 24 24');glyph.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',paths[icons[i]]);glyph.append(path);button.replaceChildren(glyph);});
  }
  function confirmAction({title,description,confirmLabel='Подтвердить'}){
    const dialog=$('ui-confirm-dialog');if(dialog.open)return Promise.resolve(false);
    $('ui-confirm-title').textContent=title;$('ui-confirm-description').textContent=description;$('ui-confirm-accept').textContent=confirmLabel;dialog.returnValue='cancel';
    return new Promise(resolve=>{dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true});dialog.showModal();});
  }
  function create(api){
    let view='history',section='expenses';const scrolls={history:0,calculation:0,results:0};
    function sync(){
      const current=api.hasCurrent(),items=api.isItems();
      document.body.dataset.view=view;
      $('home-screen').hidden=view!=='history';$('editor-screen').hidden=view==='history';
      $('calculation-screen').hidden=view!=='calculation';$('results').hidden=view!=='results';
      $('items-panel').hidden=!items || section!=='expenses';$('participants-panel').hidden=items && section!=='people';
      $('calc-tabs').hidden=!items || view!=='calculation';$('completed-payments').hidden=!items;
      $('reset-btn').hidden=view==='history';
      document.querySelectorAll('button[data-view]').forEach(button=>{const selected=button.dataset.view===view;button.setAttribute('aria-current',selected?'page':'false');button.disabled=button.dataset.view!=='history'&&!current;});
      document.querySelectorAll('[data-calc-section]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.calcSection===section)));
      const target=view==='history'?'history-heading':view==='results'?'results-heading':items && section==='expenses'?'items-heading':'setup-heading';
      document.querySelector('.skip-link').href='#'+target;document.querySelector('.skip-link').textContent='Перейти к содержимому';
    }
    function show(next,{focus=true}={}){
      if(next!=='history'&&!api.hasCurrent())return false;
      if(next==='history'&&!api.canNavigate())return false;
      scrolls[view]=window.scrollY;const changed=next!==view;view=next;sync();
      if(changed){enter($(view==='history'?'home-screen':view==='results'?'results':'calculation-screen'));feedback('selection');}
      if(focus){const target=$(view==='history'?'history-heading':view==='results'?'results-heading':'editor-title');target.focus({preventScroll:true});window.scrollTo({top:scrolls[view],behavior:'instant'});}
      return true;
    }
    function choose(next){if(!api.hasCurrent())return;section=next;show('calculation',{focus:false});enter($(next==='people'?'participants-panel':'items-panel'));$(next==='people'?'setup-heading':'items-heading').focus({preventScroll:true});window.scrollTo({top:0,behavior:reduced()?'instant':'smooth'});feedback('selection');}
    document.querySelectorAll('button[data-view]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.view==='history')api.history();else show(button.dataset.view);}));
    document.querySelectorAll('[data-calc-section]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.calcSection)));
    document.addEventListener('click',event=>{const link=event.target.closest('a[href^="#"]');if(!link || link.classList.contains('skip-link')||link.classList.contains('brand'))return;const hash=link.getAttribute('href');
      if(hash==='#results'){event.preventDefault();show('results');}
      else if(hash==='#setup-heading'){event.preventDefault();choose('people');}
      else if(hash==='#items-heading'){event.preventDefault();choose('expenses');}
    });
    // Keep keyboard cycling inside the top-layer sheet, including Chromium's body-focus edge.
    document.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;const dialog=document.querySelector('dialog[open]');if(!dialog)return;
      const controls=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')].filter(n=>n.getClientRects().length);
      const first=controls[0],last=controls.at(-1);if(!first)return;
      if(event.shiftKey && (document.activeElement===first || !dialog.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey && (document.activeElement===last || !dialog.contains(document.activeElement))){event.preventDefault();first.focus();}
    });
    // Native <dialog> supplies Escape and inert background; restore a visible opener.

    document.querySelectorAll('dialog').forEach(dialog=>{
      let opener;dialog.addEventListener('beforetoggle',event=>{if(event.newState==='open')opener=document.activeElement;});
      dialog.addEventListener('close',()=>{if(opener?.isConnected && opener.getClientRects().length)opener.focus({preventScroll:true});else document.querySelector('.mobile-dock [data-view][aria-current=page]')?.focus({preventScroll:true});});
    });
    sync();return {show,sync,choose,resetSection:()=>{section='expenses';},get view(){return view;}};
  }
  root.SplitShell={create,enter,exit,pulse,compactActions,feedback,confirm:confirmAction,setFeedbackAdapter:adapter=>{feedbackAdapter=typeof adapter==='function'?adapter:()=>{};}};
})(globalThis);
