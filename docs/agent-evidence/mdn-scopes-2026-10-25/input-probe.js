// Read-only diagnostic probe for the isolated MDN test page and fixed query Promise.
(() => {
 if(location.hostname!=='developer.mozilla.org')return;
 const ids=new WeakMap();let seq=0,last='';const roots=new WeakSet();
 const fields=()=>{let h=document.querySelector('mdn-sidebar-filter'),e=h?.shadowRoot?.querySelector('input');if(e&&!ids.has(e))ids.set(e,++seq);return{node:ids.get(e)||0,value:e?.value??null,query:h?.query??null,hasUpdated:h?.hasUpdated??null,pending:h?.isUpdatePending??null,constructor:h?.constructor.name,connected:e?.isConnected??false};};
 const emit=(kind,extra={})=>console.log('MDN_TRACE '+JSON.stringify({t:Math.round(performance.now()),kind,...fields(),...extra}));
 const watch=root=>{if(roots.has(root))return;roots.add(root);for(const type of ['input','change','focus'])root.addEventListener(type,e=>{if(e.composedPath().some(n=>n?.placeholder==='Filter')){emit(type,{at:root===document?'document':'shadow',composed:e.composed,trusted:e.isTrusted});queueMicrotask(()=>emit(type+'-microtask'));}},true);};
 watch(document);let n=0;const timer=setInterval(()=>{const h=document.querySelector('mdn-sidebar-filter');if(h?.shadowRoot)watch(h.shadowRoot);const data=JSON.stringify(fields());if(data!==last){last=data;emit('state');}if(++n>300)clearInterval(timer);},16);
 emit('installed');
})();
