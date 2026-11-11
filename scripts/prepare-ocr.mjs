import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
const output=new URL('../public/vendor/ocr/',import.meta.url),packages=new URL('../node_modules/',import.meta.url);
await mkdir(new URL('lang/',output),{recursive:true});
for(const file of ['tesseract.esm.min.js','worker.min.js','worker.min.js.LICENSE.txt'])await copyFile(new URL('tesseract.js/dist/'+file,packages),new URL(file,output));
// OEM 1 uses the LSTM engine. Include every supported device feature variant.
for(const variant of ['lstm','simd-lstm','relaxedsimd-lstm']){const file='tesseract-core-'+variant+'.wasm.js';await copyFile(new URL('tesseract.js-core/'+file,packages),new URL(file,output));}
for(const lang of ['eng','kor'])await copyFile(new URL('@tesseract.js-data/'+lang+'/4.0.0_best_int/'+lang+'.traineddata.gz',packages),new URL('lang/'+lang+'.traineddata.gz',output));
let notice='GEUMGYUL OCR assets\nTesseract.js 7.0.0 / tesseract.js-core 7.0.0 / language distributions 1.0.0\nSources: https://github.com/naptha/tesseract.js https://github.com/naptha/tessdata\n\n';
for(const path of ['tesseract.js/LICENSE.md','tesseract.js-core/LICENSE','@tesseract.js-data/eng/package.json','@tesseract.js-data/kor/package.json'])notice+=path+'\n'+await readFile(new URL(path,packages),'utf8')+'\n\n';
await writeFile(new URL('NOTICE.txt',output),notice);
console.log('무료 OCR 브라우저 파일과 한국어와 영어 모델 준비 완료');
