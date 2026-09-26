const {normalize:normalizeBoard}=require('../renderer/board-model');
const fs=require('node:fs');
const path=require('node:path');
const {normalizeWriterDocument}=require('./exercise-session');
const formats={pdf:['pdf','application/pdf'],png:['image','image/png'],jpg:['image','image/jpeg'],jpeg:['image','image/jpeg'],webp:['image','image/webp'],gif:['image','image/gif'],bmp:['image','image/bmp'],txt:['text','text/plain'],md:['text','text/plain'],markdown:['text','text/plain']};
const extensions=Object.keys(formats);
function inspectDocument(file){
  const extension=path.extname(file).slice(1).toLowerCase(),format=formats[extension];
  if(!format)throw new Error('支持 PDF、PNG、JPG、WebP、GIF、BMP、TXT 和 Markdown 文件。');
  const stat=fs.statSync(file),limit=format[0]==='pdf'?100:format[0]==='image'?30:5;
  if(!stat.isFile()||!stat.size||stat.size>limit*1024*1024)throw new Error(`文件为空或过大；此格式上限 ${limit} MB。`);
  return {file,extension,kind:format[0],mime:format[1],size:stat.size};
}
function normalizeReadingAnnotations(raw){
  const pages=normalizeWriterDocument({pages:raw.pages||[]},5000).pages;
  const notes=normalizeWriterDocument({pages:raw.notes||[]},5000).pages;
  const positions={};for(const key of ['document','notes']){const n=raw.positions?.[key]??0;if(!Number.isInteger(n)||n<0||n>=5000)throw new Error('阅读页码无效。');positions[key]=n;}
  if(raw.view!=null&&!['document','notes'].includes(raw.view))throw new Error('阅读视图无效。');
  return {version:raw.workspace?2:1,pages,notes,positions,view:raw.view||'document',...(raw.workspace?{workspace:normalizeBoard(raw.workspace)}:{})};
}
module.exports={extensions,inspectDocument,normalizeReadingAnnotations};
