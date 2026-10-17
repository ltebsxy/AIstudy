// SPDX-License-Identifier: GPL-3.0-only
const fs=require('node:fs'),path=require('node:path');
const owned=/^documents\/[0-9a-f-]{36}\.[a-z]+$/i;
const MAX_VERSIONS=5,MAX_BYTES=20*1024*1024;
function plan(root,item){
  const original=item.originalVersion||{relativeFile:item.relativeFile,size:item.size,updatedAt:item.updatedAt};
  const candidates=[...(item.managedCurrent?[{relativeFile:item.relativeFile,size:item.size,updatedAt:item.updatedAt}]:[]),...(item.history||[])];
  const history=[],obsolete=[...(item.obsoleteVersions||[])];let bytes=0,full=false;
  for(const version of candidates){
    if(!owned.test(version.relativeFile)||version.relativeFile===original.relativeFile)continue;
    if(history.some(v=>v.relativeFile===version.relativeFile))continue;
    if(!full&&history.length<MAX_VERSIONS&&bytes+version.size<=MAX_BYTES){history.push(version);bytes+=version.size;}else{full=true;obsolete.push(version.relativeFile);}
  }
  return {originalVersion:original,managedCurrent:true,history,obsoleteVersions:[...new Set(obsolete)].filter(file=>owned.test(file)&&file!==original.relativeFile&&!history.some(v=>v.relativeFile===file)&&fs.existsSync(path.join(root,file)))};
}
function clean(root,item){
  // Only paths explicitly enrolled by this version manager may be removed.
  for(const file of item.obsoleteVersions||[]){if(!owned.test(file)||file===item.relativeFile||file===item.originalVersion?.relativeFile||item.history?.some(v=>v.relativeFile===file))continue;try{fs.unlinkSync(path.join(root,file));}catch(error){if(error.code!=='ENOENT')console.warn('历史副本清理暂未完成，将在下次保存重试。');}}
}
module.exports={plan,clean,owned,MAX_VERSIONS,MAX_BYTES};
