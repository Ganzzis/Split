/* Local delivery UI. A prepared snapshot keeps Web Share in the click's activation. */
(function(root){
 'use strict';const $=id=>document.getElementById(id);
 async function copyText(text,area){
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}}catch(_){}
  const temporary=!area;if(area?.closest('details'))area.closest('details').open=true;if(!area){area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);}area.focus();area.select();let ok=false;try{ok=document.execCommand('copy');}catch(_){}if(temporary)area.remove();return ok;
 }
 function create(api){
  let generation=0,urls=[],snapshot=null,pages=[],files=[];
  const dialog=$('share-dialog'),status=$('share-status');
  function release(){for(const url of urls)URL.revokeObjectURL(url);urls=[];pages=[];files=[];snapshot=null;$('share-image').removeAttribute('src');for(const id of ['share-download-png','share-open-png'])$(id).removeAttribute('href');}
  function showPage(){const index=Number($('share-page').value)||0;if(!urls[index])return;$('share-image').src=urls[index];$('share-image').alt=`${snapshot.model.title}, страница ${index+1} из ${pages.length}`;$('share-download-png').href=urls[index];$('share-download-png').download=`split-result-${index+1}.png`;$('share-open-png').href=urls[index];}
  $('share-results').onclick=async()=>{
   const record=api.record();if(!record)return;const token=++generation;release();
   try{const model=SplitReports.build(record,{unsaved:api.unsaved()});snapshot={model,title:model.title,text:SplitReports.text(model)};}catch(_){api.toast('Не удалось сформировать корректный отчёт. Проверьте данные расчёта.');return;}
   dialog.querySelector('.share-text-details').open=false;
   $('share-text').value=snapshot.text;$('share-warning').textContent=snapshot.model.warnings.join(' ');$('share-warning').hidden=!snapshot.model.warnings.length;
   $('share-image').hidden=true;$('share-pages').hidden=true;$('share-system').disabled=true;$('share-png-actions').hidden=true;status.textContent='Готовим PNG на устройстве…';dialog.showModal();
   try{
    const rendered=await SplitReports.png(snapshot.model,document.documentElement.dataset.theme);
    if(token!==generation)return;pages=rendered;
    urls=pages.map(page=>URL.createObjectURL(page.blob));files=typeof File==='function'?pages.map((page,i)=>new File([page.blob],`split-result-${i+1}.png`,{type:'image/png'})):[];
    $('share-page').replaceChildren();pages.forEach((page,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`Страница ${i+1} из ${pages.length}`;$('share-page').append(option);});
    $('share-page').value='0';$('share-pages').hidden=pages.length<2;$('share-image').hidden=false;$('share-png-actions').hidden=false;showPage();status.textContent=pages.length>1?'Все переводы сохранены на нескольких PNG-страницах. Выберите страницу для скачивания.':'Карточка готова. Можно отправить текст и PNG или сохранить их отдельно.';
   }catch(_){if(token!==generation)return;status.textContent='PNG недоступен. Текст отчёта можно скопировать или сохранить.';}
   if(token!==generation)return;
   const adapter=SplitReports.adapter();const supported=typeof adapter.supported==='function'?adapter.supported():true;$('share-system').disabled=!supported;
   if(!supported)status.textContent+=' Системный обмен не поддерживается: используйте кнопки ниже.';
  };
  $('share-page').onchange=showPage;
  $('share-system').onclick=async()=>{
   if(!snapshot)return;const token=generation;$('share-system').disabled=true;
   try{
    const outcome=await SplitReports.adapter().share({title:snapshot.title,text:snapshot.text,files});if(token!==generation)return;
    status.textContent=outcome?.status==='shared'?(outcome.withFiles?'Данные переданы системному меню обмена.':'Текст передан системному меню. PNG можно сохранить отдельно.'):outcome?.status==='cancelled'?'Отправка отменена. Ничего не скопировано и не скачано автоматически.':outcome?.reason||'Обмен не выполнен. Скопируйте текст или сохраните PNG.';
   }catch(_){if(token===generation)status.textContent='Не удалось открыть обмен. Используйте текст или PNG.';}
   finally{if(token===generation)$('share-system').disabled=false;}
  };
  $('share-copy').onclick=async()=>{if(!snapshot)return;const ok=await copyText(snapshot.text,$('share-text'));status.textContent=ok?'Текст отчёта скопирован.':'Текст выделен. Скопируйте его через меню браузера или сохраните TXT.';};
  $('share-download-text').onclick=()=>{if(!snapshot)return;const url=URL.createObjectURL(new Blob([snapshot.text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='split-result.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  dialog.addEventListener('close',()=>{generation++;release();$('share-text').value='';});
 }
 root.SplitShareUI={create,copyText};
})(globalThis);
