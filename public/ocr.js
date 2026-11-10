import {imageTheme,enhancePixels,criticalRegions,cropRectangle,readableText} from './ocr-image.js';
import {assessPhotoOCR} from './ocr-match.js';

// Every pass runs on this device using same-origin OCR assets. The saved photo stays unchanged.
export async function recognizePhoto(file,{signal,onProgress=()=>{},problem,assigned=[]}={}){
 let worker,bitmap,timedOut=false,rejectStop,stage='원본 읽기',canvas;
 const stopped=new Promise((_,reject)=>{rejectStop=reject;});
 const stop=()=>{if(worker)void worker.terminate().catch(()=>{});};
 const abort=()=>{stop();rejectStop(new Error('인식을 중지했어요.'));};
 const timeout=setTimeout(()=>{timedOut=true;abort();},75000);
 signal?.addEventListener('abort',abort,{once:true});
 const check=()=>{if(signal?.aborted||timedOut)throw new Error('인식을 중지했어요.');};
 try{
  const {default:Tesseract}=await Promise.race([import('./vendor/ocr/tesseract.esm.min.js'),stopped]);check();
  bitmap=await createImageBitmap(file);check();
  if(bitmap.width*bitmap.height>40000000)throw new Error('사진 크기를 줄여 다시 올려 주세요.');
  const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height),Math.sqrt(3000000/(bitmap.width*bitmap.height)));
  canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();bitmap=null;
  const theme=imageTheme(ctx.getImageData(0,0,canvas.width,canvas.height).data),base=new URL('./vendor/ocr/',import.meta.url).href;
  const creating=Tesseract.createWorker(problem?.platform==='leetcode'?'eng':['kor','eng'],1,{workerPath:base+'worker.min.js',corePath:base,langPath:base+'lang',workerBlobURL:false,logger:message=>{
   if(!signal?.aborted)onProgress(message.status==='recognizing text'?`${stage} · ${Math.round((message.progress||0)*100)}%`:'인식 준비 중 · 처음에는 조금 걸릴 수 있어요.');
  }}).then(created=>{worker=created;if(signal?.aborted||timedOut)stop();return created;});
  await Promise.race([creating,stopped]);check();await worker.setParameters({user_defined_dpi:'300'});
  const runs=[];
  const read=async(image,kind,label,psm='6')=>{
   check();stage=label;onProgress(stage);await worker.setParameters({tessedit_pageseg_mode:psm});
   const {data}=await Promise.race([worker.recognize(image,{}, {blocks:kind==='original'}),stopped]);check();
   runs.push({kind,text:readableText(data.text),confidence:data.confidence});return data;
  };
  const original=await read(canvas,'original','원본 읽기');
  const finish=()=>{const text=readableText(runs.map(r=>`[${r.kind==='original'?'원본':r.kind==='enhanced'?'밝기 보정':r.kind==='identity'?'문제 식별 확대':'통과 결과 확대'}]\n${r.text}`).join('\n\n'),6000);return {engine:'tesseract.js-7',text,confidence:runs[0].confidence,runs,theme};};
  if(theme==='dark'){
   const corrected=document.createElement('canvas'),factor=Math.min(2,2600/Math.max(canvas.width,canvas.height),Math.sqrt(4000000/(canvas.width*canvas.height)));
   const data=ctx.getImageData(0,0,canvas.width,canvas.height),enhanced=enhancePixels(data.data);data.data.set(enhanced.data);
   const pixels=document.createElement('canvas');pixels.width=canvas.width;pixels.height=canvas.height;pixels.getContext('2d').putImageData(data,0,0);
   corrected.width=Math.round(canvas.width*factor);corrected.height=Math.round(canvas.height*factor);corrected.getContext('2d').drawImage(pixels,0,0,corrected.width,corrected.height);
   try{await read(corrected,'enhanced','다크 화면 밝기 보정');}finally{corrected.width=pixels.width=1;corrected.height=pixels.height=1;}
  }
  // Re-read only real text boxes; never replace an OCR title with the selected problem's title.
  if(problem&&assessPhotoOCR(problem,finish(),assigned).verdict==='unclear'){
   for(const box of criticalRegions(original,problem,canvas.height)){
    const rect=cropRectangle(box,canvas.width,canvas.height);if(!rect)continue;
    const source=document.createElement('canvas');source.width=rect.width;source.height=rect.height;
    const data=ctx.getImageData(rect.left,rect.top,rect.width,rect.height),enhanced=imageTheme(data.data)==='dark'?enhancePixels(data.data,{normalize:true}):{data:data.data};data.data.set(enhanced.data);source.getContext('2d').putImageData(data,0,0);
    const factor=Math.min(3,2000/rect.width,Math.sqrt(1000000/(rect.width*rect.height))),crop=document.createElement('canvas');crop.width=Math.ceil(rect.width*factor)+30;crop.height=Math.ceil(rect.height*factor)+30;
    const c=crop.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,crop.width,crop.height);c.drawImage(source,15,15,crop.width-30,crop.height-30);
    try{await read(crop,box.kind,box.kind==='identity'?'문제 이름·주소 확대 확인':'통과 결과 확대 확인','7');}finally{source.width=crop.width=1;source.height=crop.height=1;}
   }
  }
  return finish();
 }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);bitmap?.close();if(canvas)canvas.width=canvas.height=1;if(worker)await worker.terminate().catch(()=>{});}
}
