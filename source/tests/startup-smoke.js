const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');
const {_electron}=require('playwright-core');

async function main(){
 const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'study-startup-'));
 const env={...process.env,STUDY_DATA_DIR:data},start=performance.now();let app;
 const executablePath=process.env.STUDY_TEST_EXE||require('electron'),args=process.env.STUDY_TEST_EXE?[]:[root];
 try{
  app=await _electron.launch({executablePath,args,cwd:root,env});
  await app.firstWindow();
  const page=app.windows().find(p=>p.url().endsWith('/index.html'))||await app.waitForEvent('window',{predicate:p=>p.url().endsWith('/index.html')});
  await page.getByText('我的学习空间',{exact:true}).waitFor();
  const homeMs=Math.round(performance.now()-start);
  const initial=await app.evaluate(({BrowserWindow,app})=>{
   const home=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/index.html'));
   globalThis.startupSecondLaunch=new Promise(resolve=>app.once('second-instance',()=>resolve()));
   home.minimize();
   const handle=home.getNativeWindowHandle();
   return {id:home.id,handle:handle.length===8?handle.readBigUInt64LE().toString():handle.readUInt32LE().toString(),mathLoaded:Object.keys(process.mainModule.require('node:module')._cache).some(file=>/[\\/]katex[\\/]/.test(file))};
  });
  assert.equal(initial.mathLoaded,false,'teacher-export math must not be parsed by the main process at startup');
  const child=spawn(executablePath,args,{cwd:root,env,windowsHide:true,stdio:'ignore'});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('duplicate launch did not exit'));},15000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('duplicate launch exit '+code));});});
  await app.evaluate(()=>globalThis.startupSecondLaunch);
  const restored=await app.evaluate(({BrowserWindow},id)=>{const w=BrowserWindow.fromId(id);return {visible:w.isVisible(),minimized:w.isMinimized(),homes:BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().endsWith('/index.html')).length};},initial.id);
  assert.deepEqual(restored,{visible:true,minimized:false,homes:1});
  if(process.platform==='win32'){
   // Read the actual native taskbar/window icon, not just the JS configuration.
   const script=String.raw`
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class StudyWindowIcon {
 [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern uint PrivateExtractIcons(string file,int index,int width,int height,IntPtr[] icons,uint[] ids,uint count,uint flags);
 [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr icon);
}
'@
$handle=[IntPtr]::new([long]$env:STUDY_ICON_HANDLE)
$iconHandle=[StudyWindowIcon]::SendMessage($handle,0x7F,[IntPtr]::new(1),[IntPtr]::Zero)
if($iconHandle -eq [IntPtr]::Zero){throw 'Window has no application icon'}
$actual=[System.Drawing.Icon]::FromHandle($iconHandle).ToBitmap()
$icons=[IntPtr[]]::new(1);$ids=[uint32[]]::new(1)
$count=[StudyWindowIcon]::PrivateExtractIcons($env:STUDY_ICON_PATH,0,$actual.Width,$actual.Height,$icons,$ids,1,0)
if($count -ne 1){throw 'Cannot extract application icon'}
$expected=[System.Drawing.Icon]::FromHandle($icons[0]).ToBitmap()
$different=0
for($y=0;$y -lt $actual.Height;$y++){for($x=0;$x -lt $actual.Width;$x++){if($actual.GetPixel($x,$y).ToArgb() -ne $expected.GetPixel($x,$y).ToArgb()){$different++}}}
$actual.Save($env:STUDY_ICON_OUTPUT)
Write-Output ($different/($actual.Width*$actual.Height))
$actual.Dispose();$expected.Dispose();[void][StudyWindowIcon]::DestroyIcon($icons[0])
`;
   const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,env:{...env,STUDY_ICON_HANDLE:initial.handle,STUDY_ICON_PATH:path.join(root,'assets','icon.ico'),STUDY_ICON_OUTPUT:path.join(data,'actual-icon.png')}});
   assert.equal(result.status,0,result.stderr);const mismatch=Number(result.stdout.trim());
   assert(mismatch<0.1,'native icon differs from application asset: '+mismatch);
  }
  console.log(JSON.stringify({homeMs,duplicateLaunch:'restored the existing window',nativeIcon:'matches application asset',mainMath:'deferred until export'}));
 }finally{if(app)await app.close().catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
