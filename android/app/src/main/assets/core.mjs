// SPDX-License-Identifier: GPL-3.0-only
export const extensions=new Set(['txt','md','markdown','pdf']);
export const extension=name=>name.split('.').at(-1).toLowerCase();
export function safePath(value){
  if(typeof value!=='string')throw Error('文件路径无效');
  const path=value.replaceAll('\\','/');
  if(!path||path.startsWith('/')||/[:\0]/.test(path)||path.split('/').some(p=>!p||p==='..'||p.startsWith('.')))throw Error('不允许越界或隐藏路径');
  return path;
}
export function readingPlan(files,manifest){
  const byPath=new Map(files.map(f=>[safePath(f.path),f]));
  if(byPath.size!==files.length)throw Error('重复文件路径');
  let list,mode='english';
  if(manifest){
    if(manifest.version!==1)throw Error('仅支持阅读包 version 1');
    if(manifest.title!==undefined&&(typeof manifest.title!=='string'||!manifest.title.trim()||manifest.title.length>80))throw Error('阅读包名称无效');
    if(!['english','standard'].includes(manifest.readingMode??mode))throw Error('阅读模式无效');
    if(!Array.isArray(manifest.documents))throw Error('清单无效');
    const seen=new Set();list=manifest.documents.map(item=>{
      const path=safePath(item.file);if(seen.has(path))throw Error('清单包含重复文件');seen.add(path);
      const file=byPath.get(path);if(!file||!extensions.has(extension(path)))throw Error('清单文件不存在或不支持：'+path);
      if(item.name!==undefined&&(typeof item.name!=='string'||!item.name.trim()||item.name.length>200))throw Error('文档名称无效');
      return {...file,name:item.name??path.split('/').at(-1),readingMode:mode};
    });
  }else list=files.filter(f=>extensions.has(extension(f.path))).map(f=>({...f,name:f.path.split('/').at(-1),readingMode:mode}));
  if(!list.length||list.length>500)throw Error('正文数量应为 1–500');
  let total=0;for(const file of list){const ext=extension(file.path),limit=(ext==='pdf'?100:['txt','md','markdown'].includes(ext)?5:30)*1024**2;if(file.size<=0||file.size>limit)throw Error('文件为空或超过大小限制');total+=file.size;}
  if(total>500*1024**2)throw Error('阅读包超过 500 MB');return list;
}
export function doubleTap(previous,current){return !!previous&&current.time-previous.time<340&&current.time-previous.time>20&&Math.hypot(current.x-previous.x,current.y-previous.y)<28;}
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
