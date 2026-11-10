// Pixel-only helpers are shared by the browser and the real-capture benchmark.
export function imageTheme(rgba){
 let dark=0,total=0;const step=Math.max(4,Math.floor(rgba.length/16000/4)*4);
 for(let i=0;i<rgba.length;i+=step){const a=rgba[i+3]/255,l=(.299*rgba[i]+.587*rgba[i+1]+.114*rgba[i+2])*a+255*(1-a);dark+=l<110;total++;}
 return total&&dark/total>.6?'dark':'light';
}
export function enhancePixels(rgba,{normalize=false}={}){
 const theme=imageTheme(rgba),out=new Uint8ClampedArray(rgba.length),hist=new Uint32Array(256);
 for(let i=0;i<rgba.length;i+=4){const a=rgba[i+3]/255,l=Math.round((.299*rgba[i]+.587*rgba[i+1]+.114*rgba[i+2])*a+255*(1-a)),v=theme==='dark'?255-l:l;out[i]=v;hist[v]++;}
 let lo=0,hi=255;
 if(normalize){const n=rgba.length/4;let sum=0;for(let i=0;i<256;i++){sum+=hist[i];if(sum>=n*.01){lo=i;break;}}sum=0;for(let i=0;i<256;i++){sum+=hist[i];if(sum>=n*.99){hi=i;break;}}if(hi-lo<24){lo=0;hi=255;}}
 for(let i=0;i<out.length;i+=4){const v=Math.round(Math.max(0,Math.min(255,(out[i]-lo)*255/(hi-lo))));out[i]=out[i+1]=out[i+2]=v;out[i+3]=255;}
 return {data:out,theme};
}
const compact=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const urlPattern=/(?:https?:\/\/)?(?:www\.)?(?:leetcode\.com\/problems\/[a-z0-9-]+|(?:school\.)?programmers\.co\.kr\/learn\/courses\/\d+\/lessons\/\d+)/i;
function bounds(parts){if(!parts.length)return null;return {x0:Math.min(...parts.map(p=>p.bbox.x0)),y0:Math.min(...parts.map(p=>p.bbox.y0)),x1:Math.max(...parts.map(p=>p.bbox.x1)),y1:Math.max(...parts.map(p=>p.bbox.y1))};}
export function criticalRegions(data,problem,height){
 const lines=(data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[])),regions=[];let identity=null,result=null,recommendations=false;
 for(const line of lines){
  if(/(?:more|next|related)\s+challenges|추천\s*문제|다음\s*문제/i.test(line.text))recommendations=true;
  if(!recommendations&&!identity){
   for(const word of line.words||[]){
    const symbols=word.symbols||[],joined=symbols.map(s=>s.text).join(''),match=joined.match(urlPattern);
    if(match){let offset=0;const selected=symbols.filter(s=>{const start=offset;offset+=s.text.length;return offset>match.index&&start<match.index+match[0].length;});identity=bounds(selected);break;}
   }
   // A Korean problem heading may share a row with the editor's English controls.
   if(!identity&&problem?.platform==='programmers'&&line.bbox?.y0<height*.25&&!/[〉>]/.test(line.text)){
    const words=line.words||[],head=[];for(const word of words){if(!/^[가-힣0-9()[\]·:.,_-]+$/.test(word.text.trim()))break;head.push(word);}
    if(head.length&&head.length<=12&&compact(head.map(w=>w.text).join('')).length>=3&&!/문제설명|코딩테스트|입출력|제한사항/.test(compact(head.map(w=>w.text).join(''))))identity=bounds(head);
   }
  }
  if(!result){
   const text=line.text||'',accepted=text.match(/^\s*[^\p{L}\p{N}]*accepted(?:\s*$|\s*[\[|©@])/iu);
   if(accepted){const word=(line.words||[]).find(w=>/^accepted$/i.test(w.text.trim()));if(word)result=bounds([word]);}
   else if(/^\s*[^\p{L}\p{N}]*accepted\s+\d+\s*\/\s*\d+\s+test\s*cases?\s+passed/i.test(text)||/합\s*계|정\s*답\s*입\s*니\s*다/.test(text))result=bounds(line.words||[]);
  }
 }
 if(identity)regions.push({kind:'identity',...identity});if(result)regions.push({kind:'result',...result});return regions;
}
export function cropRectangle(box,width,height){
 const left=Math.max(0,Math.floor(box.x0)-3),top=Math.max(0,Math.floor(box.y0)-3),right=Math.min(width,Math.ceil(box.x1)+3),bottom=Math.min(height,Math.ceil(box.y1)+3);
 return right>left&&bottom>top?{left,top,width:right-left,height:bottom-top}:null;
}
export function readableText(text,max=2800){
 const s=String(text||'').replace(/[^\S\r\n]+/g,' ').trim();if(s.length<=max)return s;
 // Preserve the end of result panes even when the middle contains long source code.
 const important=s.split(/\r?\n/).filter(l=>/wrong\s*answer|runtime\s*error|limit\s*exceeded|compil\w*\s*error|실\s*패|오답|기\s*댓|개\s*중|accepted\s+\d+\s*\//i.test(l)).join('\n').slice(0,Math.floor(max/3));
 const room=max-important.length-8;return important+'\n…\n'+s.slice(0,Math.floor(room/2))+'\n…\n'+s.slice(-Math.floor(room/2));
}
