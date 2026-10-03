// SPDX-License-Identifier: GPL-3.0-only
const pending=new Map();let seq=0;let db;
export const native=!!window.AndroidStudy;
window.nativeResult=(id,value,error)=>{const task=pending.get(id);if(!task)return;pending.delete(id);error?task.reject(Error(error)):task.resolve(value);};
window.nativeEvent=(name,value)=>window.dispatchEvent(new CustomEvent('study:'+name,{detail:value}));
async function database(){if(db)return db;db=await new Promise((resolve,reject)=>{const request=indexedDB.open('AI-StudyDesk-mobile-preview',1);request.onupgradeneeded=()=>request.result.createObjectStore('data');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return db;}
export async function localGet(key){const d=await database();return new Promise((resolve,reject)=>{const tx=d.transaction('data');const request=tx.objectStore('data').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function localPut(key,value){const d=await database();return new Promise((resolve,reject)=>{const tx=d.transaction('data','readwrite');tx.objectStore('data').put(value,key);tx.oncomplete=()=>resolve({ok:true});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('保存已取消'));});}
async function cleanup(){const state=await localGet('state'),d=await database();const keep=new Set([...(state.documents??[]).flatMap(i=>['file:'+i.id,'note:doc-'+i.id]),...(state.courses??[]).flatMap(i=>['file:'+i.id,'note:course-'+i.id])]);return new Promise((resolve,reject)=>{const tx=d.transaction('data','readwrite'),store=tx.objectStore('data'),request=store.getAllKeys();request.onsuccess=()=>{for(const key of request.result)if((key.startsWith('file:')||key.startsWith('note:doc-')||key.startsWith('note:course-'))&&!keep.has(key))store.delete(key);};tx.oncomplete=()=>resolve({ok:true});tx.onerror=()=>reject(tx.error);});}
export function rpc(op,payload={}){
  if(native)return new Promise((resolve,reject)=>{const id=String(++seq);pending.set(id,{resolve,reject});window.AndroidStudy.request(id,op,JSON.stringify(payload));});
  switch(op){case 'load':return localGet('state').then(s=>s??{documents:[],courses:[],folders:[],prefs:{}});case 'save':return localPut('state',payload);case 'note':return localGet('note:'+payload.id).then(n=>n??{});case 'saveNote':return localPut('note:'+payload.id,payload.data);case 'cleanup':return cleanup();case 'systemTheme':return Promise.resolve(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');case 'aiConfig':return localGet('ai-config').then(v=>v??{});case 'saveAi':case 'chat':return Promise.reject(Error('API 密钥和请求只在安卓宿主中启用'));default:return Promise.reject(Error('请在安卓应用中使用系统文件选择器'));}
}
export async function readFile(item){
  if(native){const response=await fetch('data/'+item.file.split('/').map(encodeURIComponent).join('/'));if(!response.ok)throw Error('文件无法读取');return response;}
  const blob=await localGet('file:'+item.id);if(!blob)throw Error('文件无法读取');return new Response(blob);
}
