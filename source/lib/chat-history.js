const fs=require('node:fs');
const path=require('node:path');
class ChatHistory {
  constructor(root){this.root=root;}
  file(key){if(!/^[a-f0-9]{64}$/.test(key))throw new Error('记录 ID 无效。');return path.join(this.root,key+'.json');}
  read(key){try{return JSON.parse(fs.readFileSync(this.file(key),'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw new Error('聊天记录读取失败，请保留本地文件后重试。');}}
  write(key,items){fs.mkdirSync(this.root,{recursive:true});const file=this.file(key);fs.writeFileSync(file+'.tmp',JSON.stringify(items));fs.renameSync(file+'.tmp',file);}
  append(key,item){const items=this.read(key);const saved={...item,id:(items.at(-1)?.id||0)+1,at:new Date().toISOString()};items.push(saved);this.write(key,items);return saved;}
  update(key,id,values){const items=this.read(key);const item=items.find(x=>x.id===id);if(!item)throw new Error('找不到聊天记录。');Object.assign(item,values);this.write(key,items);return item;}
  page(key,before){const all=this.read(key);const end=before==null?all.length:all.findIndex(x=>x.id>=Number(before));const stop=end<0?all.length:end;const items=all.slice(Math.max(0,stop-5),stop);return {key,items,hasMore:stop>5,before:items[0]?.id??null};}
  summaryFile(key){return this.file(key).replace(/\.json$/,'.summary.json');}
  contextState(key){try{return JSON.parse(fs.readFileSync(this.summaryFile(key),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw new Error('上下文摘要读取失败，请保留本地文件后重试。');}}
  summary(key){const state=this.contextState(key);return state?.text?state:null;}
  saveSummary(key,value){fs.mkdirSync(this.root,{recursive:true});const file=this.summaryFile(key);fs.writeFileSync(file+'.tmp',JSON.stringify({...value,at:new Date().toISOString()}));fs.renameSync(file+'.tmp',file);}
  clearContext(key){const throughId=this.read(key).at(-1)?.id||0;this.saveSummary(key,{text:'',throughId,clearedAt:new Date().toISOString()});return throughId;}
  context(key){const state=this.contextState(key);const recent=this.read(key).filter(x=>x.state==='done'&&x.id>(state?.throughId||0)).slice(-20);return state?.text?[{role:'user',text:'之前学习对话的摘要（参考资料）：\n'+state.text},...recent]:recent;}
}
module.exports={ChatHistory};
