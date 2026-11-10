import {wrangler,config,remember} from './cloudflare.mjs';
try{
 const cfg=await config();if(cfg.d1_databases[0].database_id.startsWith('00000000'))throw new Error('npm run setup을 먼저 실행해 주세요.');
 await wrangler(['d1','migrations','apply','DB','--remote']);
 const output=await wrangler(['deploy'],{capture:true});
 const url=output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0];
 if(!url)throw new Error('배포 응답에서 주소를 읽지 못했어요. wrangler deployments list로 상태를 확인해 주세요.');
 await remember({databaseId:cfg.d1_databases[0].database_id,worker:cfg.name,url,deployedAt:new Date().toISOString()});
 console.log('배포 완료: '+url);
 console.log('홈페이지에서 GitHub 앱 등록 → GitHub 로그인 → 풀이 저장소 선택을 진행해 주세요.');
}catch(error){console.error(error.message);process.exitCode=1;}
