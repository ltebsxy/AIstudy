// Rasterize the clean vector contours with transparent antialiasing.
// Run from source/: npm run icon
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const assets=path.resolve(__dirname,'../assets');
const scratch=path.resolve(__dirname,'../.tmp/icon-builder');
fs.mkdirSync(scratch,{recursive:true});app.setPath('userData',scratch);
app.whenReady().then(async()=>{
  const svg=fs.readFileSync(path.join(assets,'icon.svg'),'utf8');
  const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await win.loadURL('about:blank');
  const sizes=[16,20,24,32,40,48,64,128,256];
  const rendered=await win.webContents.executeJavaScript(`(async()=>{
    const img=new Image();img.src=${JSON.stringify('data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'))};await img.decode();
    return ${JSON.stringify([...sizes,1254])}.map(size=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
      canvas.getContext('2d').drawImage(img,0,0,size,size);
      return canvas.toDataURL('image/png').split(',')[1];
    });
  })()`);
  const pngs=rendered.slice(0,-1).map(png=>Buffer.from(png,'base64'));
  fs.writeFileSync(path.join(assets,'icon-source.png'),Buffer.from(rendered.at(-1),'base64'));
  const directory=Buffer.alloc(6+16*sizes.length);
  directory.writeUInt16LE(1,2);directory.writeUInt16LE(sizes.length,4);
  let offset=directory.length;
  sizes.forEach((size,i)=>{
    const entry=6+i*16;directory[entry]=directory[entry+1]=size===256?0:size;
    directory.writeUInt16LE(1,entry+4);directory.writeUInt16LE(32,entry+6);
    directory.writeUInt32LE(pngs[i].length,entry+8);directory.writeUInt32LE(offset,entry+12);
    offset+=pngs[i].length;
  });
  fs.writeFileSync(path.join(assets,'icon.ico'),Buffer.concat([directory,...pngs]));
  fs.writeFileSync(path.join(assets,'icon.png'),pngs.at(-1));
  console.log('Generated icon-source.png, icon.png and icon.ico from assets/icon.svg');
  win.destroy();
  app.quit();
}).catch(error=>{console.error(error.message);app.exit(1);});
