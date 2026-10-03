const test=require('node:test'),assert=require('node:assert/strict');
const {EnglishDictionary,normalizeWord,normalizeQuery}=require('../lib/english-dictionary');
const {normalizeReadingAnnotations}=require('../lib/reading-document');
const Words=require('../renderer/reader-words');
const {rows}=require('../scripts/build-english-dictionary');

test('offline dictionary loads on demand and handles case, inflections and missing words',async()=>{
  const dictionary=new EnglishDictionary();assert.equal(dictionary.ready,null);
  const hello=await dictionary.lookup('Hello');assert(hello.found);assert(hello.phonetic);assert(hello.senses.some(s=>/喂|你好/.test(s.meaning)));
  const ready=dictionary.ready;
  const went=await dictionary.lookup('went');assert(went.found);assert(went.senses.length>0);
  const books=await dictionary.lookup('books');assert(books.found);assert(books.senses.some(s=>/书/.test(s.meaning)));
  const possessive=await dictionary.lookup('reader’s');assert(possessive.found);assert.equal(possessive.lemma,'reader');
  assert.equal((await dictionary.lookup('zzqxyzunlistedword')).found,false);assert.equal(dictionary.ready,ready);
  assert.throws(()=>normalizeWord('../secret'),/英语单词/);assert.throws(()=>normalizeWord('two words'),/英语单词/);
});
test('layered dictionary supports phrases, technical words, word forms and bounded fallback',async()=>{
  const dictionary=new EnglishDictionary();await dictionary.lookup('book');assert.equal(dictionary.parts.size,0);
  const phrase=await dictionary.lookup('  In   order to  ');assert.equal(phrase.kind,'phrase');assert(phrase.senses.some(s=>/为了/.test(s.meaning)));
  assert(dictionary.parts.has('phrases'));assert(!dictionary.parts.has('extended'));
  const inflected=await dictionary.lookup('looks forward to');assert.equal(inflected.lemma,'look forward to');
  const technical=await dictionary.lookup('decompiler');assert(technical.found);assert(technical.senses.some(s=>/反编译/.test(s.meaning)));assert(dictionary.parts.has('extended'));
  assert((await dictionary.lookup('artificial intelligence')).senses.some(s=>/人工智能/.test(s.meaning)));
  const fallback=await dictionary.lookup('bright curious learners');assert(!fallback.found);assert.equal(fallback.parts.length,3);assert(fallback.parts.every(part=>part.found));
  assert((await dictionary.lookup('langauge')).suggestions.includes('language'));
  assert.equal(await dictionary.lookup('in order to'),phrase,'repeat lookups reuse the cached result');
  assert.equal(normalizeQuery('LOOK   FORWARD TO'),'look forward to');
  assert.throws(()=>normalizeQuery('hello. Goodbye'),/标点/);assert.throws(()=>normalizeQuery('word '.repeat(13)),/12/);
  await dictionary.lookup('constructor'); // Inherited object keys must never be treated as recorded forms.
});
test('phrase selection follows reading order across wrapped lines and reverse drags',()=>{
  const source='In order\nto learn';
  const items=[...Words.words({text:'In order',context:source,offset:0,x:50,y:50,height:24},s=>s.length*10),
    ...Words.words({text:'to learn',context:source,offset:9,x:50,y:80,height:24},s=>s.length*10)];
  assert.equal(Words.range(items,0,2).word,'In order to');assert.equal(Words.range(items,2,0).word,'In order to');
  assert.equal(Words.nearest(items,72,92),2);assert.equal(Words.nearest(items,900,900),-1);
  assert.equal(Words.range(items,-1,2),null);assert.equal(Words.range(items,3,3).word,'learn');
});
test('word hit regions ignore punctuation and spaces, and follow scaled and rotated text',()=>{
  const items=Words.words({text:"Hello, don't worry!",x:50,y:70,height:20,ascent:15,width:180},s=>s.length*10);
  assert.equal(Words.hit(items,65,60).word,'Hello');assert.equal(Words.hit(items,115,60),null);
  assert.equal(Words.hit(items,135,60).word,"don't");assert.equal(Words.hit(items,65,35),null);
  const rotated=Words.words({text:'Reading',x:80,y:100,angle:Math.PI/2,height:20,ascent:15,width:140},s=>s.length*10);
  assert.equal(Words.hit(rotated,90,160).word,'Reading');assert.equal(Words.hit(rotated,120,160),null);
  assert.equal(Words.words({text:'English 中文 123',x:0,y:0,height:20},s=>s.length*10).length,1);
});
test('reading mode persists independently of ink and CSV conversion preserves quoted definitions',()=>{
  assert.equal(normalizeReadingAnnotations({}).readingMode,'standard');
  assert.equal(normalizeReadingAnnotations({readingMode:'english'}).readingMode,'english');
  assert.throws(()=>normalizeReadingAnnotations({readingMode:'unknown'}),/阅读模式/);
  assert.deepEqual([...rows('word,translation\r\nhello,"喂，你好\n""招呼"""\r\n')],[['word','translation'],['hello','喂，你好\n"招呼"']]);
});
