import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {wrangler,config,configPath,remember} from './cloudflare.mjs';
// Never upgrades plans, enables R2, registers domains, or puts secrets in source.
try {
 const cfg=await config();
 const identity=await wrangler(['whoami'],{capture:true});if(identity.includes('not authenticated'))throw new Error('먼저 npx wrangler login으로 계정을 연결해 주세요.');
 const databases=JSON.parse(await wrangler(['d1','list','--json'],{capture:true}));
 let database=databases.find(d=>d.name===cfg.d1_databases[0].database_name);
 if(!database){
  const output=await wrangler(['d1','create',cfg.d1_databases[0].database_name],{capture:true});
  const match=output.match(/"database_id"\s*:\s*"([a-f0-9-]+)"|database_id\s*=\s*"([a-f0-9-]+)"/i);
  if(!match)throw new Error('DB는 생성됐지만 ID를 읽지 못했어요. 다시 실행하면 생성된 DB를 이어서 사용해요.');
  database={uuid:match[1]||match[2]};
 }
 cfg.d1_databases[0].database_id=database.uuid;
 await writeFile(configPath(),JSON.stringify(cfg,null,2)+'\n');
 await wrangler(['d1','migrations','apply','DB','--remote']);
 const secrets=JSON.parse(await wrangler(['secret','list'],{capture:true}).catch(e=>{if(e.message.includes('10007')||e.message.includes('not found'))return '[]';throw e;}));
 if(!secrets.some(s=>s.name==='ENCRYPTION_KEY'))await wrangler(['secret','put','ENCRYPTION_KEY'],{input:randomBytes(32).toString('base64')+'\n',capture:true});
 await remember({databaseId:database.uuid,worker:cfg.name,configuredAt:new Date().toISOString()});
 console.log('무료 DB와 서버 암호화 키를 준비했어요. npm run deploy로 배포하세요.');
}catch(error){console.error(error.message);process.exitCode=1;}
