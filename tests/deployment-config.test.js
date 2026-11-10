import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {config,configPath,root} from '../scripts/cloudflare.mjs';

async function withConfig(value,run){
 const folder=await mkdtemp(join(tmpdir(),'puli-config-')),file=join(folder,'custom.json');
 const previous=process.env.PULI_CONFIG;
 try{await writeFile(file,JSON.stringify(value));process.env.PULI_CONFIG=file;await run(file);}
 finally{if(previous===undefined)delete process.env.PULI_CONFIG;else process.env.PULI_CONFIG=previous;await rm(folder,{recursive:true,force:true});}
}
const sample=JSON.parse(await readFile(new URL('../wrangler.example.jsonc',import.meta.url),'utf8'));

test('explicit config retains an independent owner and database without modifying the default',async()=>{
 const before=await readFile(root+'wrangler.jsonc');
 const custom={...sample,vars:{OWNER_GITHUB_ID:'808'},d1_databases:[{...sample.d1_databases[0],database_name:'independent-db'}]};
 await withConfig(custom,async file=>{assert.equal(configPath(),file);assert.deepEqual(await config(),custom);});
 assert.deepEqual(await readFile(root+'wrangler.jsonc'),before);
});
test('remote configuration requires a real numeric owner before any setup operation',async()=>{
 for(const owner of ['YOUR_GITHUB_NUMERIC_ID','',0,'alice','-1'])await withConfig({...sample,vars:{OWNER_GITHUB_ID:owner}},async()=>assert.rejects(config(),/OWNER_GITHUB_ID/));
});
test('remote configuration rejects a missing database binding',async()=>{
 await withConfig({...sample,vars:{OWNER_GITHUB_ID:'808'},d1_databases:[]},async()=>assert.rejects(config(),/DB/));
});
test('setup and deploy refuse the unconfigured template before contacting Cloudflare',()=>{
 const env={...process.env};delete env.PULI_CONFIG;
 for(const script of ['setup-cloudflare.mjs','deploy.mjs']){
  const result=spawnSync(process.execPath,[root+'scripts/'+script],{env,encoding:'utf8',timeout:10000});
  assert.equal(result.status,1);assert.match(result.stderr,/OWNER_GITHUB_ID/);assert.ok(!result.stdout.includes('wrangler'));
 }
});
