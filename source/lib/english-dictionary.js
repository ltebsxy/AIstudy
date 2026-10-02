// SPDX-FileCopyrightText: 2026 ltebsxy
// SPDX-License-Identifier: GPL-3.0-only
const fs=require('node:fs/promises'),path=require('node:path'),{promisify}=require('node:util'),{gunzip}=require('node:zlib');
const unzip=promisify(gunzip);
const posNames={n:'名词',v:'动词',vt:'及物动词',vi:'不及物动词',a:'形容词',adj:'形容词',ad:'副词',adv:'副词',pron:'代词',prep:'介词',conj:'连词',num:'数词',art:'冠词',aux:'助动词',int:'感叹词',interj:'感叹词',pl:'复数',det:'限定词'};
function normalizeWord(input){
  if(typeof input!=='string')throw new Error('单词无效。');
  const word=input.trim().replaceAll('’',"'").replace(/[\u2010-\u2013]/g,'-').toLowerCase();
  if(word.length>64||!/^[a-z]+(?:['-][a-z]+)*$/.test(word))throw new Error('请选择一个英语单词。');
  return word;
}
function senses(translation,rawPos){
  const fallback=rawPos.split('/').map(item=>posNames[item.split(':')[0]]).filter(Boolean).join(' / ');
  return translation.split('\n').filter(Boolean).map(line=>{
    const match=/^((?:(?:n|v|vt|vi|a|adj|ad|adv|pron|prep|conj|num|art|aux|interj|int|pl|det)\.\s*)+)(.*)$/i.exec(line.trim());
    const labels=match?[...match[1].matchAll(/([a-z]+)\./gi)].map(item=>`${item[1]}. ${posNames[item[1].toLowerCase()]}`).join(' / '):fallback;
    const meaning=(match?match[2]:line).trim();
    return {pos:labels,meaning};
  }).filter(item=>item.meaning);
}
class EnglishDictionary{
  constructor(file=path.join(__dirname,'vendor','ecdict','dictionary.json.gz')){this.file=file;this.ready=null;}
  async load(){
    if(!this.ready)this.ready=fs.readFile(this.file).then(unzip).then(bytes=>JSON.parse(bytes.toString('utf8'))).catch(()=>{this.ready=null;throw new Error('本地词库无法读取，请检查应用文件。');});
    return this.ready;
  }
  async lookup(input){
    const word=normalizeWord(input),data=await this.load();
    let lemma=Object.hasOwn(data.entries,word)?word:undefined;
    if(!lemma&&Object.hasOwn(data.forms,word))lemma=data.forms[word];
    if(!lemma&&word.endsWith("'s")&&Object.hasOwn(data.entries,word.slice(0,-2)))lemma=word.slice(0,-2);
    if(!lemma)return {word,found:false,source:'ECDICT'};
    const [phonetic,translation,pos]=data.entries[lemma];
    return {word,lemma,phonetic,found:true,senses:senses(translation,pos),source:'ECDICT'};
  }
}
module.exports={EnglishDictionary,normalizeWord};
