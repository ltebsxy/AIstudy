// SPDX-FileCopyrightText: 2026 ltebsxy
// SPDX-License-Identifier: GPL-3.0-only
const fs=require('node:fs'),path=require('node:path');
const {extensions,inspectDocument}=require('./reading-document');
const supported=file=>extensions.includes(path.extname(file).slice(1).toLowerCase());
function label(value,max,field){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new Error(`${field}必须为 1–${max} 字。`);return value.trim();}
async function readReadingPack(directory){
  const root=await fs.promises.realpath(directory);
  if(!(await fs.promises.stat(root)).isDirectory())throw new Error('请选择文件夹。');
  const manifest=path.join(root,'reading-pack.json'),documents=[],seen=new Set();let total=0,skipped=0,title=path.basename(root)||'导入文件夹',readingMode='standard';
  async function add(relative,name){
    if(typeof relative!=='string'||!relative||relative.includes('\0')||path.isAbsolute(relative)||/^[a-z]:/i.test(relative))throw new Error('阅读包文件路径无效。');
    const parts=relative.replaceAll('\\','/').split('/');
    if(parts.some(part=>!part||part==='..'||part.startsWith('.')||part.includes(':')))throw new Error('阅读包只能引用包内的非隐藏文件。');
    let file=root;
    for(const part of parts){file=path.join(file,part);if((await fs.promises.lstat(file)).isSymbolicLink())throw new Error('阅读包不能引用符号链接。');}
    if(!supported(file))throw new Error('阅读包包含不支持的文件格式：'+relative);
    const key=file.toLowerCase();if(seen.has(key))throw new Error('阅读包清单重复引用文件：'+relative);seen.add(key);
    const info=inspectDocument(file);total+=info.size;
    if(documents.length>=500||total>500*1024*1024)throw new Error('每次最多导入 500 个文件，总大小不超过 500 MB。');
    documents.push({file,relative:parts.join('/'),name:name===undefined?path.basename(file):label(name,200,'文件名称'),info});
  }
  let stat;
  try{stat=await fs.promises.lstat(manifest);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(stat){
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw new Error('reading-pack.json 必须为不超过 1 MB 的普通文件。');
    let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await fs.promises.readFile(manifest)));}catch{throw new Error('reading-pack.json 不是有效的 UTF-8 JSON。');}
    if(!data||data.version!==1||!Array.isArray(data.documents)||!data.documents.length||data.documents.length>500)throw new Error('阅读包需要 version: 1 和 1–500 个 documents 条目。');
    if(data.title!==undefined)title=label(data.title,80,'阅读包名称');
    readingMode=data.readingMode??'standard';if(!['standard','english'].includes(readingMode))throw new Error('阅读包的 readingMode 必须为 standard 或 english。');
    for(const item of data.documents){if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('阅读包 documents 条目必须包含 file。');await add(item.file,item.name);}
  }else{
    let visited=0;
    async function walk(folder,depth=0){
      if(depth>20)throw new Error('文件夹层级超过 20 层，请选择更具体的目录。');
      const entries=(await fs.promises.readdir(path.join(root,folder),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
      for(const item of entries){
        if(++visited>10000)throw new Error('所选目录内容过多，请选择阅读材料所在的子文件夹。');
        if(item.name.startsWith('.')||item.isSymbolicLink()){skipped++;continue;}
        const relative=path.join(folder,item.name);
        if(item.isDirectory())await walk(relative,depth+1);
        else if(item.isFile()&&supported(item.name))await add(relative);
        else skipped++;
      }
    }
    await walk('');
  }
  if(!documents.length)throw new Error('这个文件夹中没有支持的阅读文件。');
  return {root,title:title.slice(0,80),readingMode,documents,skipped};
}
module.exports={readReadingPack};
