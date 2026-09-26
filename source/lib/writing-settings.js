const {normalizeWorkTarget}=require('./model');
function validateDefaultWriter(raw={type:'builtin'}) {
  if(!raw||!['builtin','app','onenote'].includes(raw.type))throw new Error('请选择有效的写字程序。');
  const target=normalizeWorkTarget({workTarget:raw});
  if(target.type==='app') {if(!target.appPath)throw new Error('请选择写字程序。');delete target.filePath;}
  if(target.type==='onenote'&&!target.url)throw new Error('请填写 OneNote 页面链接。');
  return target;
}
function resolveWorkTarget(course,setting) {
  const target=normalizeWorkTarget(course);
  const empty=target.type==='file'&&!target.filePath||target.type==='app'&&!target.appPath||target.type==='onenote'&&!target.url;
  return target.type==='default'||empty?validateDefaultWriter(setting):target;
}
module.exports={validateDefaultWriter,resolveWorkTarget};
