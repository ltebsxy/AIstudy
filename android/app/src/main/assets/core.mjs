// SPDX-License-Identifier: GPL-3.0-only
export const extensions=new Set(['txt','md','markdown','pdf','png','jpg','jpeg','webp','gif','bmp']);
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
  let list,mode='standard';
  if(manifest){
    if(manifest.version!==1)throw Error('仅支持阅读包 version 1');
    if(manifest.title!==undefined&&(typeof manifest.title!=='string'||!manifest.title.trim()||manifest.title.length>80))throw Error('阅读包名称无效');
    mode=manifest.readingMode??mode;if(!['english','standard'].includes(mode))throw Error('阅读模式无效');
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
export function normalizeCourse(raw){
  if(raw?.kind==='programming'||raw?.programming)throw Error('安卓版暂不支持编程课程');
  if(typeof raw?.title!=='string'||!raw.title.trim()||raw.title.length>80||typeof raw.knowledge!=='string'||!raw.knowledge.trim()||raw.knowledge.length>50000)throw Error('课程名称或知识点无效');
  if(!Array.isArray(raw.questions)||!raw.questions.length||raw.questions.length>1000)throw Error('课程题目数量无效');
  const questions=raw.questions.map(q=>{
    const type=q.type??'written';if(!['written','choice','blank'].includes(type))throw Error('不支持的题型');
    if(!q.text&&!q.image)throw Error('题目不能为空');
    if(q.image&&(q.image.length>12000000||!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(q.image)))throw Error('图片格式无效');
    if(type==='choice'&&(!Array.isArray(q.options)||q.options.length<2||q.options.length>26||q.options.some(o=>typeof o!=='string'||!o.trim())||q.multiple!==undefined&&typeof q.multiple!=='boolean'))throw Error('选择题选项无效');
    if(type==='blank'&&q.blanks!==undefined&&(!Array.isArray(q.blanks)||q.blanks.length>20||q.blanks.some(b=>typeof b!=='string'||!b.trim())))throw Error('填空标签无效');
    if(q.grading&&(!q.grading.answer||!q.grading.criteria?.length||q.grading.criteria.some(r=>!r.text||!Number.isFinite(r.points)||r.points<=0)))throw Error('评分依据无效');
    return {id:q.id??crypto.randomUUID(),type,text:String(q.text??''),image:q.image??'',...(type==='choice'?{options:q.options,multiple:q.multiple===true}:{}),...(type==='blank'?{blanks:q.blanks?.length?q.blanks:['答案']}:{}),...(q.grading?{grading:q.grading}:{})};
  });
  return {id:raw.id??crypto.randomUUID(),title:raw.title,knowledge:raw.knowledge,description:raw.description??'',knowledgeFormat:raw.knowledgeFormat,kind:'standard',questions};
}
export function expandBounds({minY,maxY},y,height,tool){
  if(!['pen','marker'].includes(tool))return {minY,maxY,shift:0};
  if(y>maxY-height*.2)return {minY,maxY:maxY+height,shift:0};
  if(y<minY+height*.2)return {minY:minY-height,maxY,shift:height};
  return {minY,maxY,shift:0};
}
export function doubleTap(previous,current){return !!previous&&current.time-previous.time<340&&current.time-previous.time>20&&Math.hypot(current.x-previous.x,current.y-previous.y)<28;}
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
