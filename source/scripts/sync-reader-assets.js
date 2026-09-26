const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=path.join(root,'node_modules','pdfjs-dist'),target=path.join(root,'renderer','vendor','pdfjs');
fs.mkdirSync(target,{recursive:true});
for(const file of ['pdf.mjs','pdf.worker.mjs'])fs.copyFileSync(path.join(source,'build',file),path.join(target,file));
for(const folder of ['cmaps','standard_fonts','wasm','iccs'])fs.cpSync(path.join(source,folder),path.join(target,folder),{recursive:true});
fs.copyFileSync(path.join(source,'LICENSE'),path.join(target,'LICENSE'));
