import { app, BrowserWindow } from 'electron';
import { startAgentBridge } from '../runtime/electron/agent-bridge.mjs';
import { assertBrowserNavigationUrl, assertResolvedNavigationAddress } from '../runtime/electron/browser-navigation-policy.mjs';
const option=name=>process.argv.find(v=>v.startsWith(`${name}=`))?.slice(name.length+1);
const directory=option('--directory'),shell=option('--shell');if(!directory||!shell)throw new Error('--directory and --shell are required');
const width=Number(option('--width')||1348),height=Number(option('--height')||802);
app.setPath('userData',`${directory}/profile`);app.commandLine.appendSwitch('disable-renderer-backgrounding');app.commandLine.appendSwitch('disable-background-timer-throttling');
let foregroundCalls=0;
for(const key of ['show','showInactive','focus','moveTop'])BrowserWindow.prototype[key]=()=>{foregroundCalls++;throw new Error('Foreground API forbidden');};app.focus=()=>{foregroundCalls++;throw new Error('Foreground API forbidden');};
const caches=new WeakMap();
async function validateTarget(raw,partition){
 const url=assertBrowserNavigationUrl(raw),host=new URL(url).hostname;let cache=caches.get(partition);if(!cache)caches.set(partition,cache=new Map());if(cache.get(host)>Date.now())return url;
 const resolved=await Promise.allSettled(['A','AAAA'].map(queryType=>partition.resolveHost(host,{queryType,cacheUsage:'disallowed',secureDnsPolicy:'allow',source:'any'})));
 const addresses=[...new Set(resolved.filter(r=>r.status==='fulfilled').flatMap(r=>r.value.endpoints||[]).map(v=>v.address))];if(!addresses.length)throw new Error('No public DNS address');
 for(const address of addresses)assertResolvedNavigationAddress(address);
 cache.set(host,Date.now()+5000);if(cache.size>256)cache.delete(cache.keys().next().value);return url;
}
let bridge;
void app.whenReady().then(async()=>{app.dock?.hide();
const window=new BrowserWindow({width,height,show:false});
await window.loadFile(shell);
bridge=await startAgentBridge({directory,validateTarget,installNetworkPolicy(partition){partition.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>{void validateTarget(details.url,partition).then(()=>callback({cancel:false}),()=>callback({cancel:true}));});},host:{offscreenRendering:true,attachTab({view,shield}){window.contentView.addChildView(view);window.contentView.addChildView(shield);view.setBounds({x:0,y:0,width,height});view.setVisible(true);},detachTab(view){view.webContents.close();},loadRunningEffect:async()=>{},updateTab:()=>{},publish:()=>{}}});
console.log(JSON.stringify({ready:true,electron:process.versions.electron,chromium:process.versions.chrome,width,height}));
}).catch(error=>{console.error(error);app.exit(1);});
process.on('SIGTERM',()=>{void bridge.close().finally(()=>{console.log(JSON.stringify({foregroundCalls}));app.exit(0);});});
