let pdfModule;
async function pdfEngine(){
  if(!pdfModule)pdfModule=import('./vendor/pdfjs/pdf.mjs').then(pdfjs=>{pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;return pdfjs;}).catch(e=>{pdfModule=null;throw e;});
  return pdfModule;
}
let pdf=null,picture=null,textPages=[],kind='',loadingTask=null,wordPages=new Map();
function password(){
  return new Promise((resolve,reject)=>{
    const dialog=document.getElementById('pdf-password'),form=dialog.querySelector('form'),input=dialog.querySelector('input');input.value='';
    form.onsubmit=event=>{event.preventDefault();const value=input.value;dialog.close();resolve(value);};
    dialog.querySelector('[data-cancel]').onclick=()=>{dialog.close();reject(new Error('已取消打开加密 PDF。'));};
    dialog.oncancel=()=>reject(new Error('已取消打开加密 PDF。'));dialog.showModal();input.focus();
  });
}
async function paginate(bytes){
  let text;
  if(bytes[0]===255&&bytes[1]===254)text=new TextDecoder('utf-16le').decode(bytes);
  else if(bytes[0]===254&&bytes[1]===255)text=new TextDecoder('utf-16be').decode(bytes);
  else try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('gb18030').decode(bytes);}
  text=text.replace(/\r\n?/g,'\n').replace(/\t/g,'    ').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
  const context=document.createElement('canvas').getContext('2d');context.font='20px "Microsoft YaHei", sans-serif';
  const widths=new Map(),lines=[];let line='',width=0,processed=0;
  // Keep English words together when wrapping, while Chinese text can wrap by character.
  for(const match of text.matchAll(/[A-Za-z]+(?:['’\u2010-\u2013-][A-Za-z]+)*|[\s\S]/g)){
    const token=match[0],chunks=token.length>128||context.measureText(token).width>900?token:[token];
    for(const char of chunks){processed+=char.length;if(processed>=32768){processed=0;await new Promise(resolve=>setTimeout(resolve,0));}if(char==='\n'){lines.push(line);line='';width=0;continue;}
    if(widths.size>2000)widths.clear();
    if(!widths.has(char))widths.set(char,context.measureText(char).width);
    const next=widths.get(char);if(line&&width+next>900){lines.push(line);line='';width=0;}line+=char;width+=next;
    if(lines.length>200000)throw new Error('文本页数过多，请拆分文件。');
    }
  }
  lines.push(line);const pages=[];for(let i=0;i<lines.length;i+=42)pages.push(lines.slice(i,i+42));return pages;
}
window.StudyReader={
  async load(source){
    if(loadingTask){await loadingTask.destroy();loadingTask=null;pdf=null;}if(picture){picture.close();picture=null;}textPages=[];
    wordPages=new Map();kind=source.kind;const bytes=source.bytes instanceof Uint8Array?source.bytes:new Uint8Array(source.bytes);
    if(kind==='pdf'){
      const pdfjs=await pdfEngine();
      loadingTask=pdfjs.getDocument({data:bytes,isEvalSupported:false,cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,wasmUrl:new URL('./vendor/pdfjs/wasm/',import.meta.url).href,iccUrl:new URL('./vendor/pdfjs/iccs/',import.meta.url).href});
      let passwordError;
      loadingTask.onPassword=async update=>{try{update(await password());}catch(e){passwordError=e;loadingTask.destroy();}};
      try{pdf=await loadingTask.promise;}catch(e){throw passwordError||e;}
      if(pdf.numPages>5000)throw new Error('PDF 超过 5000 页，请拆分文件。');return pdf.numPages;
    }
    if(kind==='image'){picture=await createImageBitmap(new Blob([bytes],{type:source.mime}));if(picture.width*picture.height>80000000){picture.close();throw new Error('图片像素过大，请先缩小图片。');}return 1;}
    textPages=await paginate(bytes);return Math.max(1,textPages.length);
  },
  get textSupported(){return kind!=='image';},
  async words(index){
    if(kind==='image')return [];
    if(wordPages.has(index))return wordPages.get(index);
    const store=wordPages,currentPDF=pdf,currentKind=kind,currentText=textPages;
    const promise=(async()=>{
      const ctx=document.createElement('canvas').getContext('2d'),output=[];
      if(currentKind==='pdf'){
        const pdfjs=await pdfEngine(),page=await currentPDF.getPage(index+1);
        const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(1000/base.width,1400/base.height)});
        const content=await page.getTextContent(),items=content.items.filter(item=>typeof item.str==='string');
        const full=items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('');let offset=0;
        for(const item of items){
          const style=content.styles[item.fontName]||{},transform=pdfjs.Util.transform(viewport.transform,item.transform);
          const height=Math.hypot(transform[2],transform[3]),angle=Math.atan2(transform[1],transform[0])+(style.vertical?Math.PI/2:0);
          if(height>0&&item.str){
            ctx.font=`${height}px ${item.fontName}, ${style.fontFamily||'sans-serif'}`;
            output.push(...ReaderWords.words({text:item.str,context:full,offset,x:transform[4]+(1000-Math.ceil(viewport.width))/2,y:transform[5],angle,height,
              ascent:height*(style.ascent??(style.descent!=null?1+style.descent:.8)),width:Math.abs((style.vertical?item.height:item.width)*viewport.scale)},text=>ctx.measureText(text).width));
          }
          offset+=item.str.length+1;
        }
      }else{
        ctx.font='20px "Microsoft YaHei", sans-serif';
        const lines=currentText[index]||[],full=lines.join('\n');let offset=0;
        for(const [line,text] of lines.entries()){
          output.push(...ReaderWords.words({text,context:full,offset,x:50,y:50+line*30,height:24},text=>ctx.measureText(text).width));
          offset+=text.length+1;
        }
      }
      return output;
    })();
    store.set(index,promise);if(store.size>12)store.delete(store.keys().next().value);
    try{return await promise;}catch(e){if(store.get(index)===promise)store.delete(index);throw e;}
  },
  async wordAt(index,x,y){return ReaderWords.hit(await this.words(index),x,y);},
  get kind(){return kind;},
  async render(index,canvas){
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    if(kind==='pdf'){
      const page=await pdf.getPage(index+1),base=page.getViewport({scale:1}),scale=Math.min(1000/base.width,1400/base.height),viewport=page.getViewport({scale});
      const buffer=document.createElement('canvas');buffer.width=Math.ceil(viewport.width);buffer.height=Math.ceil(viewport.height);
      await page.render({canvasContext:buffer.getContext('2d'),viewport}).promise;ctx.drawImage(buffer,(1000-buffer.width)/2,0);page.cleanup();
    }else if(kind==='image'){
      const scale=Math.min(1000/picture.width,1400/picture.height);ctx.drawImage(picture,(1000-picture.width*scale)/2,0,picture.width*scale,picture.height*scale);
    }else{
      ctx.fillStyle='#253445';ctx.font='20px "Microsoft YaHei", sans-serif';ctx.textBaseline='top';
      for(const [line,text] of (textPages[index]||[]).entries())ctx.fillText(text,50,50+line*30);
    }
  }
};
