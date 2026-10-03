// Normalize the Windows AAPT2 asset-entry separator before alignment/signing.
// The byte length is unchanged, so offsets, payload CRCs and compressed data stay intact.
import {readFile,writeFile} from 'node:fs/promises';
const file=process.argv[2];if(!file)throw Error('Provide an unsigned APK path.');
const bytes=await readFile(file);let end=-1;
for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
if(end<0)throw Error('Invalid ZIP end record.');
const count=bytes.readUInt16LE(end+10),names=new Set();let offset=bytes.readUInt32LE(end+16),changed=0;
if(count===65535)throw Error('ZIP64 requires a separate build workflow.');
for(let i=0;i<count;i++){
  if(bytes.readUInt32LE(offset)!==0x02014b50)throw Error('Invalid central entry.');
  const size=bytes.readUInt16LE(offset+28),extra=bytes.readUInt16LE(offset+30),comment=bytes.readUInt16LE(offset+32),local=bytes.readUInt32LE(offset+42);
  const old=bytes.subarray(offset+46,offset+46+size).toString('utf8'),name=old.replaceAll('\\','/');
  if(name.startsWith('/')||name.split('/').some(p=>p==='..')||names.has(name))throw Error('Invalid or duplicate APK entry: '+name);names.add(name);
  if(bytes.readUInt32LE(local)!==0x04034b50||bytes.readUInt16LE(local+26)!==size)throw Error('Invalid local ZIP header.');
  if(old!==name){const encoded=Buffer.from(name);if(encoded.length!==size)throw Error('Entry rename changed byte length.');encoded.copy(bytes,offset+46);encoded.copy(bytes,local+30);changed++;}
  offset+=46+size+extra+comment;
}
for(const expected of ['assets/index.html','assets/vendor/ecdict/dictionary.json.gz','assets/vendor/katex/katex.min.js','assets/vendor/pdfjs/pdf.worker.mjs','classes.dex'])if(!names.has(expected))throw Error('Missing APK resource: '+expected);
await writeFile(file,bytes);console.log('APK resource paths checked; normalized '+changed+' entries.');
