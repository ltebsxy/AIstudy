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
  const columns=Object.fromEntries(header.map((name,i)=>[name,i])),entries=Object.create(null),extended=Object.create(null),phrases=Object.create(null),exchanges=Object.create(null),phraseRows=[];
  const key=word=>word.trim().toLowerCase().replaceAll('’',"'").replace(/\s+/g,' ');
  const valid=word=>/^[a-z]+(?:['-][a-z]+)*$/.test(word)&&word.length<=64;
  const required=new Set(["can't","don't","isn't","it's","i'm","i've","i'll","you're","they're","we're","doesn't","didn't","won't"]);
  for(const row of iterator){
    const get=name=>row[columns[name]]||'',word=key(get('word'));
    if(!get('translation'))continue;
    const bnc=Number(get('bnc')),frq=Number(get('frq'));
    const common=bnc>0&&bnc<=60000||frq>0&&frq<=60000||get('tag')||get('oxford')==='1'||Number(get('collins'))>0||required.has(word);
    const value=[get('phonetic'),get('translation').replace(/\\n/g,'\n').replace(/\\r/g,''),get('pos')];
    if(/^[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*){1,7}$/.test(word)&&word.length<=160){phraseRows.push({word,value,common,definition:!!get('definition')});continue;}
    if(!valid(word))continue;
    const target=common?entries:get('definition')||/\[计\]/.test(get('translation'))?extended:null;
    if(!target)continue;
    if(!Object.hasOwn(target,word)||get('word')===word){
      target[word]=value;
      exchanges[word]=get('exchange');
    }
  }
  for(const {word,value,common,definition} of phraseRows){
    if(common||definition||word.split(' ').every(item=>Object.hasOwn(entries,item))&&!/\[(医|化|机|法|经|电|生|地质|建|冶|矿)\]/.test(value[1]))phrases[word]=value;
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
  fs.mkdirSync(destination,{recursive:true});
  function pack(name,value){const data=Buffer.from(JSON.stringify(value)),compressed=zlib.gzipSync(data,{level:9});fs.writeFileSync(path.join(destination,name),compressed);return {file:name,entries:Object.keys(value.entries).length,forms:Object.keys(value.forms||{}).length,uncompressedBytes:data.length,compressedBytes:compressed.length,SHA256:crypto.createHash('sha256').update(compressed).digest('hex')};}
  const core=pack('dictionary.json.gz',{entries:sorted(entries),forms:sorted(forms)});
  const extra=pack('extended.json.gz',{entries:sorted(extended)}),phrase=pack('phrases.json.gz',{entries:sorted(phrases)});
  fs.copyFileSync(license,path.join(destination,'LICENSE'));
  const metadata={name:'ECDICT layered English-Chinese dictionary',source:`https://github.com/skywind3000/ECDICT/tree/${REVISION}`,revision:REVISION,
    sourceFile:'ecdict.csv',sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),
    selection:'Core: BNC/COCA <= 60000, exam tags, Oxford, Collins and contractions. Extended: additional single words with English definitions or computer labels. Phrases: ranked/defined expressions or expressions of core words excluding specialist labels. Inflections from exchange.',
    entries:core.entries,forms:core.forms,uncompressedBytes:core.uncompressedBytes,compressedBytes:core.compressedBytes,
    license:'MIT',dictionarySHA256:core.SHA256,parts:[core,extra,phrase],totalEntries:core.entries+extra.entries+phrase.entries,totalCompressedBytes:core.compressedBytes+extra.compressedBytes+phrase.compressedBytes};
  fs.writeFileSync(path.join(destination,'SOURCE.json'),JSON.stringify(metadata,null,2)+'\n');
  return metadata;
}
if(require.main===module){
  const [csv,license,destination]=process.argv.slice(2);
  if(!csv||!license||!destination)throw new Error('Usage: node scripts/build-english-dictionary.js <ecdict.csv> <LICENSE> <output-directory>');
  console.log(JSON.stringify(build(csv,license,destination),null,2));
}
module.exports={build,rows};
