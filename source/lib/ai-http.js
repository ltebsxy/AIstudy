const fs=require('node:fs');
const path=require('node:path');
const {API_SYSTEM_PROMPT}=require('./api-system-prompt');
function filePart(file) {
  const ext=path.extname(file).toLowerCase();const mime=ext==='.pdf'?'application/pdf':ext==='.jpg'||ext==='.jpeg'?'image/jpeg':ext==='.webp'?'image/webp':'image/png';
  const bytes=fs.readFileSync(file);const data=`data:${mime};base64,${bytes.toString('base64')}`;
  return ext==='.pdf'?{type:'file',file:{filename:path.basename(file),file_data:data}}:{type:'image_url',image_url:{url:data}};
}
function content(text,files=[]) {return files.length?[{type:'text',text},...files.flatMap(file=>[{type:'text',text:'附件：'+path.basename(file)},filePart(file)])]:text;}
async function askHTTP(config,secret,{message,files=[],history=[],signal,sessionId}) {
  const api=config.mode==='api';
  if(api&&!config.api.model)throw new Error('请在设置中填写 API 模型。');
  if(api&&!secret)throw new Error('请在设置中填写 API Key。');
  const url=api?config.api.baseUrl.replace(/\/chat\/completions$/,'')+'/chat/completions':config.harness.endpoint;
  if(!url)throw new Error('请在设置中填写 Harness 桥接地址。');
  const previous=history.map(x=>({role:x.role,content:content(x.prompt||x.text,(x.files||[]).filter(f=>fs.existsSync(f)))}));
  const body=api?{model:config.api.model,messages:[{role:'system',content:API_SYSTEM_PROMPT},...previous,{role:'user',content:content(message,files)}],stream:false}:{sessionId:sessionId||config.harness.sessionId,message,attachments:files.map(file=>({name:path.basename(file),...filePart(file)})),history:previous};
  let response;
  try {response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(secret?{Authorization:`Bearer ${secret}`}:{})},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(300000)])});}
  catch(e){if(signal?.aborted)throw new Error('已停止等待。');throw new Error(e.name==='TimeoutError'?'接口响应超时。':'无法连接接口，请检查地址、网络及服务状态。');}
  if(!response.ok)throw new Error(`接口返回 HTTP ${response.status}。${response.status===401?'请检查密钥。':response.status===429?'请求过多或额度不足。':'请检查模型名称和图片/PDF 支持情况。'}`);
  let data;try{data=await response.json();}catch{throw new Error(signal?.aborted?'已停止等待。':'接口没有返回有效 JSON。');}
  const answer=api?data.choices?.[0]?.message?.content:data.reply;
  if(typeof answer!=='string'||!answer.trim())throw new Error(api?'接口没有返回文字回复。':'Harness 需返回 {"reply":"回复文本"}。');
  return answer;
}
module.exports={askHTTP,filePart};
