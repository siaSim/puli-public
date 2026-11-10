import { appJWT, base64, unbase64 } from './crypto.js';
import { parseProblemURL } from '../public/core.js';

export class GitHubError extends Error {
 constructor(status,retryAfter=0) { super(status===401?'GitHub 로그인을 다시 해 주세요.':status===403||status===429?'GitHub 요청 한도 또는 권한을 확인해 주세요.':status===404?'저장소 접근 권한을 확인해 주세요.':'GitHub 조회에 실패했어요. 잠시 후 다시 시도해 주세요.');this.status=status;this.retryAfter=retryAfter; }
}
export async function github(path, token, {method='GET',body,fetcher=fetch}={}) {
 if(!path.startsWith('/')||path.startsWith('//')) throw new Error('Invalid API path');
 const response=await fetcher('https://api.github.com'+path,{method,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Puli-Study',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
 if(!response.ok) throw new GitHubError(response.status,Number(response.headers.get('retry-after')||0));
 if(response.status===204)return null;
 return response.json();
}
export async function installationToken(config, repo, fetcher=fetch) {
 const result=await github(`/app/installations/${encodeURIComponent(repo.installation_id)}/access_tokens`,await appJWT(config),{method:'POST',body:{repository_ids:[Number(repo.repo_id)],permissions:{contents:'read',metadata:'read'}},fetcher});
 return result.token;
}
export function sourceFile(file) {
 if(!['added','modified','renamed'].includes(file.status)||file.additions+file.deletions===0) return false;
 if(!/\.(py|js|ts|tsx|jsx|java|cpp|cc|c|cs|go|rs|kt|kts|swift|rb|php|scala|sql|sh|dart|ex|exs|hs|lua|r|m)$/i.test(file.filename))return false;
 return !/(^|\/)(readme|stats?|statistics|review|notes?|test[s]?|__tests__|node_modules|\.github)(\/|\.)/i.test(file.filename);
}
export function pathMatches(file,problem) {
 const parts=file.filename.normalize('NFKC').split('/');
 if(problem.platform==='leetcode') {
  const slug=problem.id.slice(3);
  return parts.slice(0,-1).some(s=>s.toLowerCase().replace(/^\d+[-_. ]+/, '')===slug);
 }
 const id=problem.id.slice(3);
 return parts.slice(0,-1).some(s=>new RegExp('^'+id+'(?:[. _-]|$)').test(s));
}
export function readmeMatches(text, problem) {
 const links=text.match(/https:\/\/(?:www\.)?(?:leetcode\.com|school\.programmers\.co\.kr|programmers\.co\.kr)\/[^\s<>\]"')]+/gi)||[];
 return links.some(link=>{try{return parseProblemURL(link,problem.platform).id===problem.id;}catch{return false;}});
}
export function eligibleCommit(commit, member, round, now=Date.now()) {
 const at=commit.commit?.committer?.date;
 // The GitHub account attached to the author must be the signed-in member.
 return String(commit.author?.id)===String(member.id)&&Array.isArray(commit.parents)&&commit.parents.length<=1&&Number.isFinite(Date.parse(at))&&Date.parse(at)>=Date.parse(round.startDate+'T00:00:00+09:00')&&Date.parse(at)<=now+300000;
}
export async function evidenceForCommit(commit,problem,repo,token,fetcher=fetch) {
 const files=(commit.files||[]).filter(f=>sourceFile(f)&&pathMatches(f,problem));
 if(!files.length)return null;
 // Verify the exact problem URL from the extension's README at this commit.
 const file=files[0]; const folder=file.filename.slice(0,file.filename.lastIndexOf('/'));
 const prefix=`/repos/${repo.full_name.split('/').map(encodeURIComponent).join('/')}`;
 let readme;
 try {readme=await github(`${prefix}/contents/${folder.split('/').map(encodeURIComponent).join('/')}/README.md?ref=${encodeURIComponent(commit.sha)}`,token,{fetcher});}catch(e){if(e.status===404)return null;throw e;}
 if(readme.encoding!=='base64'||readme.size>65536||!readmeMatches(new TextDecoder().decode(unbase64(readme.content.replace(/\s/g,''))),problem))return null;
 return {sha:commit.sha,path:file.filename,repo:repo.full_name,branch:repo.branch,url:`https://github.com/${repo.full_name}/commit/${commit.sha}`,at:commit.commit.committer.date,author:commit.author.login};
}
export {base64};

// Discover free-goal solves from the same source-file + README evidence used for
// assigned problems. A title or a commit message alone never identifies a solve.
export async function discoverCommitProblems(commit,repo,token,fetcher=fetch){
 const files=(commit.files||[]).filter(sourceFile),folders=[...new Set(files.map(f=>f.filename.slice(0,f.filename.lastIndexOf('/'))))];
 if(folders.length>8)throw new Error('문제 폴더가 많은 커밋은 사진으로 인증해 주세요.');
 const result=[],seen=new Set(),prefix='/repos/'+repo.full_name.split('/').map(encodeURIComponent).join('/');
 for(const folder of folders){
  if(!folder||folder.split('/').some(p=>!p||p==='.'||p==='..'))continue;
  let readme;try{readme=await github(`${prefix}/contents/${folder.split('/').map(encodeURIComponent).join('/')}/README.md?ref=${encodeURIComponent(commit.sha)}`,token,{fetcher});}catch(error){if(error.status===404)continue;throw error;}
  if(readme.encoding!=='base64'||typeof readme.content!=='string'||!Number.isInteger(readme.size)||readme.size>65536)continue;
  const text=new TextDecoder().decode(unbase64(readme.content.replace(/\s/g,'')));
  const links=text.match(/https:\/\/(?:www\.)?(?:leetcode\.com|school\.programmers\.co\.kr|programmers\.co\.kr)\/[^\s<>\]"')]+/gi)||[];
  for(const link of links){
   let normalized;try{normalized=parseProblemURL(link,repo.platform);}catch{continue;}
   const problem={...normalized,platform:repo.platform},file=files.find(f=>f.filename.slice(0,f.filename.lastIndexOf('/'))===folder&&pathMatches(f,problem));
   if(!file||seen.has(problem.id))continue;seen.add(problem.id);
   const fallback=folder.split('/').at(-1).normalize('NFKC').replace(/^\d+[. _-]+/,'').replace(/-/g,' ');
   const heading=/^#{1,3}\s+(.+)$/m.exec(text)?.[1]||fallback;
   const title=heading.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/^\[(?:easy|medium|hard|level\s*\d+)\]\s*/i,'').replace(/<[^>]*>/g,'').trim().slice(0,120)||fallback;
   result.push({problem:{...problem,title,difficulty:repo.platform==='leetcode'?'난이도 미정':'레벨 미정',tag:'자율 풀이'},evidence:{sha:commit.sha,path:file.filename,repo:repo.full_name,branch:repo.branch,url:`https://github.com/${repo.full_name}/commit/${commit.sha}`,at:commit.commit.committer.date,author:commit.author.login}});
  }
 }
 return result;
}
