async function readPart(url){const response=await fetch(url);if(!response.ok)throw new Error("词库读取失败");return response.json();}
// SPDX-FileCopyrightText: 2026 ltebsxy
// SPDX-License-Identifier: GPL-3.0-only
const posNames={n:'名词',v:'动词',vt:'及物动词',vi:'不及物动词',a:'形容词',adj:'形容词',ad:'副词',adv:'副词',pron:'代词',prep:'介词',conj:'连词',num:'数词',art:'冠词',aux:'助动词',int:'感叹词',interj:'感叹词',pl:'复数',det:'限定词'};
function normalizeWord(input){
  if(typeof input!=='string')throw new Error('单词无效。');
  const word=input.trim().replaceAll('’',"'").replace(/[\u2010-\u2013]/g,'-').toLowerCase();
  if(word.length>64||!/^[a-z]+(?:['-][a-z]+)*$/.test(word))throw new Error('请选择一个英语单词。');
  return word;
}
function normalizeQuery(input){
  if(typeof input!=='string')throw new Error('请选择英语单词或短语。');
  const text=input.trim().replaceAll('’',"'").replace(/[\u2010-\u2013]/g,'-').replace(/\s+/g,' ').toLowerCase();
  if(text.length>200||text.split(' ').length>12||!/^[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*)*$/.test(text))throw new Error('请选择不超过 12 个词的英语短语，不包含句号等标点。');
  return text;
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
  constructor(file="vendor/ecdict/dictionary.json"){this.file=file;this.ready=null;this.parts=new Map();this.results=new Map();}
  async load(){
    if(!this.ready)this.ready=readPart(this.file).catch(()=>{this.ready=null;throw new Error('本地词库无法读取，请检查应用文件。');});
    return this.ready;
  }
  async part(name){
    if(!this.parts.has(name))this.parts.set(name,readPart("vendor/ecdict/"+name+".json").catch(()=>{this.parts.delete(name);throw new Error('扩展词库无法读取，请检查应用文件。');}));
    return this.parts.get(name);
  }
  result(word,lemma,value,kind='word'){
    const [phonetic,translation,pos]=value;
    return {word,lemma,phonetic,kind,found:true,senses:senses(translation,pos),source:'ECDICT'};
  }
  async word(word,core){
    let lemma=Object.hasOwn(core.entries,word)?word:Object.hasOwn(core.forms,word)?core.forms[word]:null;
    if(!lemma&&word.endsWith("'s")&&Object.hasOwn(core.entries,word.slice(0,-2)))lemma=word.slice(0,-2);
    if(lemma&&Object.hasOwn(core.entries,lemma))return this.result(word,lemma,core.entries[lemma]);
    const extra=await this.part('extended');
    if(Object.hasOwn(extra.entries,word))return this.result(word,word,extra.entries[word]);
    if(lemma&&Object.hasOwn(extra.entries,lemma))return this.result(word,lemma,extra.entries[lemma]);
    if(word.endsWith("'s")&&Object.hasOwn(extra.entries,word.slice(0,-2)))return this.result(word,word.slice(0,-2),extra.entries[word.slice(0,-2)]);
    return {word,found:false,source:'ECDICT',suggestions:this.suggestions(word,core)};
  }
  suggestions(word,core){
    if(word.length>24)return [];
    const candidates=new Set(),add=value=>{if(Object.hasOwn(core.entries,value))candidates.add(value);};
    for(let i=0;i<=word.length;i++){
      add(word.slice(0,i)+word.slice(i+1));
      if(i+1<word.length)add(word.slice(0,i)+word[i+1]+word[i]+word.slice(i+2));
      for(const ch of 'abcdefghijklmnopqrstuvwxyz'){add(word.slice(0,i)+ch+word.slice(i));if(i<word.length)add(word.slice(0,i)+ch+word.slice(i+1));}
    }
    return [...candidates].slice(0,4);
  }
  async lookup(input){
    const word=normalizeQuery(input);if(this.results.has(word))return this.results.get(word);
    const core=await this.load();let result;
    if(!word.includes(' '))result=await this.word(word,core);
    else{
      const phrases=(await this.part('phrases')).entries,tokens=word.split(' ');
      let lemma=Object.hasOwn(phrases,word)?word:null;
      // Try the recorded lemma of each inflected word, without guessing translations.
      if(!lemma)for(let i=0;i<tokens.length;i++){
        if(!Object.hasOwn(core.forms,tokens[i]))continue;const variant=[...tokens];variant[i]=core.forms[tokens[i]];
        if(Object.hasOwn(phrases,variant.join(' '))){lemma=variant.join(' ');break;}
      }
      if(lemma)result=this.result(word,lemma,phrases[lemma],'phrase');
      else{
        const parts=[];
        for(let i=0;i<tokens.length;){
          let match;
          for(let end=Math.min(tokens.length,i+8);end>i+1;end--){const text=tokens.slice(i,end).join(' ');if(Object.hasOwn(phrases,text)){match={end,result:this.result(text,text,phrases[text],'phrase')};break;}}
          if(match){parts.push(match.result);i=match.end;}else{parts.push(await this.word(tokens[i],core));i++;}
        }
        result={word,kind:'phrase',found:false,parts,source:'ECDICT'};
      }
    }
    this.results.set(word,result);if(this.results.size>256)this.results.delete(this.results.keys().next().value);
    return result;
  }
}
export {EnglishDictionary,normalizeWord,normalizeQuery};
