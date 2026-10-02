// SPDX-FileCopyrightText: 2026 ltebsxy
// SPDX-License-Identifier: GPL-3.0-only
// Generate a compact offline dictionary from the pinned ECDICT CSV. Not a startup task.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const REVISION='bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b';
function* rows(text){
  let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;
    }else if(ch===','&&!quoted){row.push(field);field='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(field);if(row.some(Boolean))yield row;row=[];field='';
    }else field+=ch;
  }
  if(quoted)throw new Error('CSV has an unclosed quoted field.');
  if(field||row.length){row.push(field);yield row;}
}
function build(csv,license,destination){
  const source=fs.readFileSync(csv),iterator=rows(source.toString('utf8')),header=iterator.next().value;
  const columns=Object.fromEntries(header.map((name,i)=>[name,i])),entries=Object.create(null),exchanges=Object.create(null);
  const key=word=>word.trim().toLowerCase().replaceAll('’',"'");
  const valid=word=>/^[a-z]+(?:['-][a-z]+)*$/.test(word)&&word.length<=64;
  const required=new Set(["can't","don't","isn't","it's","i'm","i've","i'll","you're","they're","we're","doesn't","didn't","won't"]);
  for(const row of iterator){
    const get=name=>row[columns[name]]||'',word=key(get('word'));
    if(!valid(word)||!get('translation'))continue;
    const bnc=Number(get('bnc')),frq=Number(get('frq'));
    if(!(bnc>0&&bnc<=30000||frq>0&&frq<=30000||get('tag')||get('oxford')==='1'||Number(get('collins'))>0||required.has(word)))continue;
    if(!Object.hasOwn(entries,word)||get('word')===word){
      entries[word]=[get('phonetic'),get('translation').replace(/\\n/g,'\n').replace(/\\r/g,''),get('pos')];
      exchanges[word]=get('exchange');
    }
  }
  const forms=Object.create(null);
  for(const [word,exchange] of Object.entries(exchanges))for(const value of exchange.split('/')){
    const [type,...rest]=value.split(':');
    if(!['p','d','i','3','r','t','s'].includes(type))continue;
    for(const form of rest.join(':').split(',')){
      const normalized=key(form);
      if(valid(normalized)&&normalized!==word&&!Object.hasOwn(forms,normalized))forms[normalized]=word;
    }
  }
  const sorted=value=>Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')));
  const data=Buffer.from(JSON.stringify({entries:sorted(entries),forms:sorted(forms)})),compressed=zlib.gzipSync(data,{level:9});
  fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'dictionary.json.gz'),compressed);
  fs.copyFileSync(license,path.join(destination,'LICENSE'));
  const metadata={name:'ECDICT compact core',source:`https://github.com/skywind3000/ECDICT/tree/${REVISION}`,revision:REVISION,
    sourceFile:'ecdict.csv',sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),
    selection:'Single words with BNC/COCA rank <= 30000, exam tags, Oxford flag, Collins stars, and common contractions; inflections from exchange.',
    entries:Object.keys(entries).length,forms:Object.keys(forms).length,uncompressedBytes:data.length,compressedBytes:compressed.length,
    license:'MIT',dictionarySHA256:crypto.createHash('sha256').update(compressed).digest('hex')};
  fs.writeFileSync(path.join(destination,'SOURCE.json'),JSON.stringify(metadata,null,2)+'\n');
  return metadata;
}
if(require.main===module){
  const [csv,license,destination]=process.argv.slice(2);
  if(!csv||!license||!destination)throw new Error('Usage: node scripts/build-english-dictionary.js <ecdict.csv> <LICENSE> <output-directory>');
  console.log(JSON.stringify(build(csv,license,destination),null,2));
}
module.exports={build,rows};
