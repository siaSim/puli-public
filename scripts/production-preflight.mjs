import {createHash} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {config} from './cloudflare.mjs';

export function validateProductionState(cfg, bindings, approved, actual) {
  if (!Array.isArray(bindings) || !Array.isArray(approved) || !Array.isArray(actual) || !approved.length) throw new Error('운영 설정이나 마이그레이션 기준을 확인하지 못했습니다.');
  const db = bindings.find(x => x.name === 'DB' && x.type === 'd1');
  const owner = bindings.find(x => x.name === 'OWNER_GITHUB_ID' && x.type === 'plain_text');
  const key = bindings.find(x => x.name === 'ENCRYPTION_KEY' && x.type === 'secret_text');
  if (!db || db.id !== cfg.d1_databases[0].database_id) throw new Error('운영 DB가 배포 설정과 다릅니다. 배포를 중단합니다.');
  if (!owner || String(owner.text) !== String(cfg.vars.OWNER_GITHUB_ID)) throw new Error('운영 GitHub 소유자 설정이 다릅니다. 배포를 중단합니다.');
  if (!key) throw new Error('기존 로그인 암호화 키가 확인되지 않아 배포를 중단합니다.');
  const ordered = rows => [...rows].sort((a,b) => a.name.localeCompare(b.name));
  if (JSON.stringify(ordered(approved)) !== JSON.stringify(ordered(actual))) throw new Error('마이그레이션이 확인된 운영 기준과 다릅니다. 백업 및 이전 검사 후 운영자가 기준을 갱신해야 합니다.');
}

export async function migrationManifest() {
  const directory = new URL('../migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(x => x.endsWith('.sql')).sort();
  return Promise.all(files.map(async name => ({name, sha256:createHash('sha256').update(await readFile(new URL(name, directory))).digest('hex')})));
}

export async function preflight() {
  if (!process.env.CLOUDFLARE_API_TOKEN || !/^[a-f0-9]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID || '')) throw new Error('Cloudflare 계정과 배포 토큰이 필요합니다.');
  const cfg = await config();
  const database = cfg.d1_databases[0].database_id;
  if (!/^[0-9a-f-]{36}$/i.test(database) || database.startsWith('00000000')) throw new Error('운영 DB 설정이 올바르지 않습니다.');
  let approved;
  try { approved = JSON.parse(process.env.GEUMGYUL_MIGRATION_MANIFEST || ''); }
  catch { throw new Error('운영자가 확인한 마이그레이션 기준이 필요합니다.'); }
  const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${encodeURIComponent(cfg.name)}/settings`;
  const [response, actual] = await Promise.all([
    fetch(url, {headers:{Authorization:'Bearer ' + process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(30000)}),
    migrationManifest(),
  ]);
  if (!response.ok) throw new Error(`Cloudflare 사전 점검 API 응답 오류 (${response.status}).`);
  const data = await response.json();
  if (!data.success) throw new Error('Cloudflare 사전 점검 API가 실패했습니다.');
  validateProductionState(cfg, data.result.bindings, approved, actual);
  console.log('운영 Worker, 기존 로그인 키, DB 연결과 확인된 마이그레이션 기준을 확인했습니다.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  preflight().catch(error => {console.error(error.message); process.exitCode = 1;});
}
