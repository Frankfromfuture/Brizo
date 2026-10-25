#!/usr/bin/env node
import {execFile} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createAgentSession,AgentSession} from '../lib/agent-session.mjs';
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const engine=option('--engine','brizo'),phase=option('--phase','release'),directory=option('--directory','/tmp/brizo-real-bridge'),space=Number(option('--ego-space','')),pageLabel=option('--ego-page','p1');
if(engine==='ego'&&(!Number.isInteger(space)||space<1))throw new Error('--ego-space must identify this task’s owned Space');
const output=path.resolve(option('--output',`/tmp/real-sites-${engine}-${phase}.json`));const evidence=path.resolve(option('--evidence',path.dirname(output)));await mkdir(evidence,{recursive:true});
const sites={wikipedia:'https://en.wikipedia.org/wiki/Artificial_intelligence',mdn:'https://developer.mozilla.org/en-US/docs/Web/JavaScript',github:'https://github.com/microsoft/playwright'};
// This plan is serialized into the Ego round, so both engines use one implementation.
async function runPlan(a,site){
 const records=[];let stopped=false;
 const step=async(name,operation,check=()=>true)=>{if(stopped)return;const started=performance.now();let error;let firstError,recoveryAttempts=0;try{await operation();}catch(e){firstError={code:e.code||'ACTION_ERROR',message:String(e.message).slice(0,300)};if(a.recover&&await a.recover(name,e)){recoveryAttempts=1;try{await operation();}catch(next){error={code:next.code||'ACTION_ERROR',message:String(next.message).slice(0,300)};}}else error=firstError;if(error)stopped=true;}const elapsedMs=performance.now()-started;const text=a.text(),url=await a.url();const row={name,elapsedMs,success:!error&&check(text,url),url,outputBytes:Buffer.byteLength(a.raw()),...(firstError?{firstError,recoveryAttempts}:{}),...(error?{error}:{})};records.push(row);await a.save(name);};
 if(site==='wikipedia'){
  await step('ethics',()=>a.href('#Ethics'),t=>t.includes('AI has potential benefits and potential risks.'));
  await step('collapse-ethics',()=>a.named('click','button','Toggle Ethics subsection'));
  await step('history',()=>a.href('#History'),(_t,u)=>u.endsWith('#History'));
  await step('top',()=>a.named('click','link','(Top)'));
  await step('search',()=>a.named('fill','textbox','Search Wikipedia','Machine learning'));
  await step('search-enter',()=>a.named('press','textbox','Search Wikipedia','Enter'),(_t,u)=>u.includes('/wiki/Machine_learning'));
 }else if(site==='mdn'){
  await step('filter-sidebar',()=>a.filterSidebar('Promise'));
  await step('promise',()=>a.href('/docs/Web/JavaScript/Reference/Global_Objects/Promise'),(_t,u)=>u.endsWith('/Promise'));
  await step('static-methods',()=>a.href('#static_methods'),(_t,u)=>u.endsWith('#static_methods'));
  await step('all-settled',()=>a.href('/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled'),(_t,u)=>u.includes('/Promise/allSettled'));
  await step('back',()=>a.back(),(_t,u)=>u.includes('/Global_Objects/Promise')&&!u.includes('/allSettled'));
 }else{
  await step('branch-menu',()=>a.named('click','button','main branch'),t=>t.includes('Filter branches')||t.includes('Find a branch'));
  await step('filter-branches',()=>a.named('fill','textbox','Filter branches','main'));
  await step('cancel-menu',()=>a.named('click','button','Cancel'));
  await step('tags',()=>a.href('/microsoft/playwright/tags'),(_t,u)=>u.includes('/playwright/tags'));
  await step('release',()=>a.href('/microsoft/playwright/releases/tag/',true),(_t,u)=>u.includes('/releases/tag/'));
  await step('back',()=>a.back(),(_t,u)=>u.includes('/playwright/tags'));
 }
 return{site,success:records.every(r=>r.success)&&!stopped,records};
}
async function executeEgoPlan({space,pageLabel,url,site,evidence,engine,phase}) {
 const fs=await import('node:fs/promises');const task=await taskSpace(space),page=task.page(pageLabel);
 await page.goto(url);let last=String(await page.snapshot({includeActionMarks:false,includeStableLocator:false}));let calls=1;const fallbacks=[];
 const a={raw:()=>last,text:()=>last,url:()=>page.url(),save:async name=>fs.writeFile(`${evidence}/${engine}-${phase}-${site}-${name}.txt`,last),
 async observe(scope){calls++;last=String(await page.snapshot({...(scope?{scope}:{}),includeActionMarks:false,includeStableLocator:false}));},
 async named(action,role,name,value){calls++;const selector='loc=role:'+(name==='Search Wikipedia'?'searchbox':role)+'[name='+JSON.stringify(name)+']';
  if(action==='click'){await page.click(selector,{label:'follow observed benchmark control'});if(name==='main branch'){await page.waitForSelector('loc=role:textbox[name="Filter branches"]',{state:'visible',timeout:5000});calls++;}}
  else if(action==='fill')await page.fill(selector,value);
  else{await page.press(selector,value);await page.waitForFunction(()=>location.pathname==='/wiki/Machine_learning',undefined,{timeout:10000});calls++;}
  await this.observe();
 },
 async filterSidebar(value){calls++;await page.fill('input[placeholder="Filter"]',value);await page.waitForSelector('a[href="/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise"]',{state:'visible',timeout:5000});calls++;await this.observe();},
 async href(suffix,prefix=false){
  const find=()=>last.split('\n').find(line=>{const h=line.match(/url=([^\]]+)/)?.[1];return h&&(prefix?h.includes(suffix):h.endsWith(suffix));});let line=find();
  if(!line){await this.observe('full_page');fallbacks.push({kind:'full-page-observation',target:suffix,bytes:Buffer.byteLength(last)});line=find();}
  if(!line)throw Object.assign(new Error('Target link is absent from observation: '+suffix),{code:'TARGET_NOT_OBSERVED'});
  const href=line.match(/url=([^\]]+)/)[1];calls++;const targetUrl=new URL(href),currentUrl=new URL(await page.url());const forms=[href,targetUrl.pathname+targetUrl.search+targetUrl.hash];if(targetUrl.pathname===currentUrl.pathname&&targetUrl.hash)forms.push(targetUrl.hash);await page.click([...new Set(forms)].map(value=>'a[href='+JSON.stringify(value)+']').join(',')+' >> nth=0',{label:'open observed documentation link'});
  await page.waitForFunction(expected=>location.href===expected,href,{timeout:10000});calls++;await this.observe();
 },
 async back(){const history=await page.cdp('Page.getNavigationHistory'),entry=history.entries[history.currentIndex-1];await page.cdp('Page.navigateToHistoryEntry',{entryId:entry.id});calls+=2;await page.waitForFunction(expected=>location.href===expected,entry.url,{timeout:10000});calls++;await this.observe();}
 };
 const result=await runPlan(a,site);result.apiCalls=calls;result.fallbacks=fallbacks;return result;
}

const sourceFiles={};for(const name of ['runtime/electron/agent-browser.mjs','runtime/electron/browser-command-agent.mjs','runtime/electron/agent-session-tools.mjs','lib/agent-session.mjs','runtime/electron/agent-observation-scope.mjs'])sourceFiles[name]=createHash('sha256').update(await readFile(new URL('../'+name,import.meta.url))).digest('hex');
const selectedSites=Object.entries(sites).filter(([name])=>option('--sites','wikipedia,mdn,github').split(',').includes(name));
if(!selectedSites.length)throw new Error("Choose at least one known site");
const results=[];let session;
try{
 if(engine==='brizo')session=await createAgentSession({goal:'Read Wikipedia, MDN and GitHub. Click article section links, search Wikipedia, filter the MDN sidebar and GitHub branch menu, inspect Promise methods and repository releases, and return using history. No account changes.',client:'real-site-benchmark',url:selectedSites[0][1],observe:{format:'text'}},{clientOptions:{directory}});
 for(const [site,url]of selectedSites){
  let result;
  if(engine==='brizo'){
   if(site!==selectedSites[0][0])await session.act({action:'navigate',url});
   let last=session.observation;let calls=0;const fallbacks=[];
   const a={raw:()=>JSON.stringify(last),text:()=>[last?.pageText,last?.controls].filter(Boolean).join('\n'),url:async()=>last?.url||'',save:async name=>{await writeFile(path.join(evidence,`${engine}-${phase}-${site}-${name}.json`),JSON.stringify(last));},
    async act(action){calls++;try{const r=await session.act(action);last=r.observation;return r;}catch(error){if(session.observation)last=session.observation;throw error;}},
    async named(action,role,name,value){if(!String(last.controls).includes(' '+role+' '+JSON.stringify(name))){fallbacks.push({kind:'full-page-observation',target:name});calls++;last=await session.observe({scope:'full_page',maxElements:1000,maxChars:0});}return this.act({action,target:{role,name},...(action==='press'?{key:value}:value!==undefined?{value}:{}),...(action==='press'?{wait:{url:'Machine_learning',timeoutMs:10000}}:name==='main branch'?{wait:{target:{role:'textbox',name:'Filter branches'},timeoutMs:5000}}:{})});},
    async recover(name,error){if(phase!=='recovery'||name!=='filter-sidebar'||error.code!=='CONDITION_TIMEOUT')return false;last=session.observation||await session.observe();const line=String(last.controls).split('\n').find(line=>line.includes('textbox \"Filter sidebar\"'));if(!line||line.includes('value='))return false;fallbacks.push({kind:'explicit-refill-after-observed-blank'});return true;},
    async filterSidebar(value){return this.act({action:'fill',target:{role:'textbox',name:'Filter sidebar'},value,wait:{target:{role:'link',href:'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise'},timeoutMs:5000}});},
    async href(suffix,prefix=false){const find=()=>String(last.controls).split('\n').find(line=>{const h=line.match(/href="([^"]+)"/)?.[1];return h&&(prefix?h.includes(suffix):h.endsWith(suffix));});let line=find();if(!line){fallbacks.push({kind:'full-page-observation',target:suffix});calls++;last=await session.observe({scope:'full_page',maxElements:1000,maxChars:0});line=find();if(!line){calls++;const r=await session.wait({target:{href:suffix,exact:false},timeoutMs:10000,observe:{scope:'full_page',maxElements:1000,maxChars:0}});last=r.observation;line=find();}}if(!line)throw Object.assign(new Error('Target link is absent from current observation: '+suffix),{code:'TARGET_NOT_OBSERVED'});const href=line.match(/href="([^"]+)"/)[1];const unique=String(last.controls).split('\n').filter(row=>row.includes('href='+JSON.stringify(href))).length===1;return this.act({action:'click',...(unique?{target:{role:'link',href}}:{ref:line.match(/^@e\d+/)[0]}),wait:{url:href,timeoutMs:10000}});},
    async back(){return this.act({action:'back'});}};
   result=await runPlan(a,site);result.apiCalls=calls;result.fallbacks=fallbacks;
   if(result.success){
    const probe={viewport:{bytes:Buffer.byteLength(JSON.stringify(last)),counts:last.counts,truncated:last.truncated}};
    const full=await session.observe({scope:'full_page',maxElements:30,maxChars:500});
    probe.full_page={bytes:Buffer.byteLength(JSON.stringify(full)),counts:full.counts,truncated:full.truncated,pagination:full.pagination};
    const main=full.regions?.find(r=>['main','article'].includes(r.role)) || full.regions?.[0];
    if(main){const sub=await session.observe({scope:'subtree',root:main.ref,maxElements:30,maxChars:500});probe.subtree={root:main.role,bytes:Buffer.byteLength(JSON.stringify(sub)),counts:sub.counts,truncated:sub.truncated};}
    result.scopeProbe=probe;await session.observe();
   }
   if(!result.success){try{last=await session.observe();await a.save('recovery');}catch(error){result.recoveryError={code:error.code,message:error.message};throw Object.assign(error,{partial:result});}}
  }else{
   const source=`const runPlan=${runPlan.toString()};const executeEgoPlan=${executeEgoPlan.toString()};console.log('REAL '+JSON.stringify(await executeEgoPlan(${JSON.stringify({space,pageLabel,url,site,evidence,engine,phase})})));`;
   await writeFile(path.join(evidence,`ego-${phase}-${site}-round.mjs`),source);
   const {stdout,stderr}=await new Promise((resolve,reject)=>{const child=execFile('ego-browser',['nodejs'],{timeout:90000,maxBuffer:4*1024*1024},(err,stdout,stderr)=>err?reject(Object.assign(err,{stdout,stderr})):resolve({stdout,stderr}));child.stdin.end(source);});
   const line=(stdout+'\n'+stderr).split('\n').find(line=>line.startsWith('REAL '));if(!line)throw new Error(stdout+'\n'+stderr);result=JSON.parse(line.slice(5));
  }
  results.push(result);await writeFile(output,JSON.stringify({engine,phase,date:new Date().toISOString(),sourceFiles,results},null,2)+'\n');console.log(JSON.stringify(result));
 }
}finally{await session?.finish('Completed read-only real-site comparison',{keep:false}).catch(()=>{});}
