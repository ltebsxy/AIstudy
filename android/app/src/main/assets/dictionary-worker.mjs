// SPDX-License-Identifier: GPL-3.0-only
import {EnglishDictionary} from './dictionary.mjs';
const dictionary=new EnglishDictionary();
self.onmessage=async ({data})=>{try{self.postMessage({id:data.id,result:await dictionary.lookup(data.query)});}catch(error){self.postMessage({id:data.id,error:error.message});}};
