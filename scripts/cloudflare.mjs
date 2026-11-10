import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
export const root=fileURLToPath(new URL('../',import.meta.url));
export function configPath(){return resolve(root,process.env.PULI_CONFIG||'wrangler.jsonc');}
export async function wrangler(args,{input,capture=false}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[root+'node_modules/wrangler/bin/wrangler.js',...args,'--config',configPath()],{cwd:root,stdio:['pipe',capture?'pipe':'inherit','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  let out='',err='';if(capture)child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>{err+=x;});
  child.on('error',reject);child.on('exit',code=>code===0?resolve(out):reject(new Error(err||'Cloudflare 명령을 실행하지 못했어요.')));
  child.stdin.end(input||'');
 });
}
export async function config(){
 const cfg=JSON.parse(await readFile(configPath(),'utf8'));
 if(!/^[1-9]\d*$/.test(String(cfg.vars?.OWNER_GITHUB_ID||'')))throw new Error('선택한 설정 파일의 OWNER_GITHUB_ID를 본인 GitHub 숫자 ID로 설정해 주세요.');
 if(!cfg.name||cfg.d1_databases?.[0]?.binding!=='DB'||!cfg.d1_databases[0].database_name)throw new Error('선택한 설정 파일의 Worker 이름과 DB 바인딩을 확인해 주세요.');
 return cfg;
}
export async function remember(value){await mkdir(root+'.deployment',{recursive:true});await writeFile(root+'.deployment/state.json',JSON.stringify(value,null,2));}
