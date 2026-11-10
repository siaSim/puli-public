import test from 'node:test';import assert from 'node:assert/strict';
import {imageTheme,enhancePixels,criticalRegions,cropRectangle,readableText} from '../public/ocr-image.js';
const pixels=values=>new Uint8ClampedArray(values.flatMap(v=>[...v,255]));
test('dark detection is local: light address bar stays light while dark results invert',()=>{
 const light=pixels(Array.from({length:100},(_,i)=>i<90?[245,245,245]:[30,30,30]));
 const dark=pixels(Array.from({length:100},(_,i)=>i<90?[32,39,48]:[200,200,200]));
 assert.equal(imageTheme(light),'light');assert.equal(imageTheme(dark),'dark');
 assert.equal(enhancePixels(light).data[0],245);assert.ok(enhancePixels(dark).data[0]>210);
 const transparent=new Uint8ClampedArray([0,0,0,0]);assert.equal(imageTheme(transparent),'light');assert.equal(enhancePixels(transparent).data[0],255);
});
test('normalizing a dark low-contrast result preserves red failures as readable dark text',()=>{
 const raw=pixels([...Array(90).fill([30,35,40]),...Array(10).fill([230,45,45])]),r=enhancePixels(raw,{normalize:true});
 assert.equal(r.data[0],255);assert.ok(r.data[90*4]<30);assert.equal(r.data[3],255);
});
test('URL reread crops only the exact supported problem URL, leaving trailing query noise outside',()=>{
 const text='leetcode.com/problems/two-sum/submissions/?noise=1',symbols=[...text].map((text,i)=>({text,bbox:{x0:10+i*5,x1:15+i*5,y0:10,y1:20}}));
 const data={blocks:[{paragraphs:[{lines:[{text,bbox:{y0:10},words:[{text,symbols}]}]}]}]};
 const [box]=criticalRegions(data,{platform:'leetcode'},500);assert.equal(box.kind,'identity');assert.equal(box.x1,10+'leetcode.com/problems/two-sum'.length*5);assert.ok(box.x1<10+text.length*5);
 assert.deepEqual(cropRectangle({x0:0,y0:1,x1:99,y1:100},100,100),{left:0,top:0,width:100,height:100});
});
test('recommendations never become identity regions and partial accepted counts keep their context',()=>{
 const bbox={x0:0,y0:0,x1:100,y1:12},word=text=>({text,bbox,symbols:[...text].map(text=>({text,bbox}))});
 const lines=[{text:'Accepted 2 / 5 testcases passed',bbox,words:['Accepted','2','/','5','testcases','passed'].map(word)},{text:'More challenges',bbox,words:[]},{text:'leetcode.com/problems/two-sum/',bbox,words:[word('leetcode.com/problems/two-sum/')]}];
 const regions=criticalRegions({blocks:[{paragraphs:[{lines}]}]},{platform:'leetcode'},500);assert.equal(regions.length,1);assert.equal(regions[0].kind,'result');
});
test('long OCR keeps failures from the middle and the final result within the bounded text',()=>{
 const text='Title\n'+'source code\n'.repeat(500)+'Wrong Answer\n'+'source code\n'.repeat(500)+'Final result';const result=readableText(text);assert.ok(result.length<=2800);assert.ok(result.includes('Wrong Answer'));assert.ok(result.endsWith('Final result'));
});
