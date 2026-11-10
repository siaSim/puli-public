import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {EXAMPLES} from '../public/core.js';
import {seal} from '../server/crypto.js';
import {createSession} from '../server/session.js';
import {seedLegacyMemberships} from '../tests/fixtures.js';

const source = resolve(process.argv[2] || '.');
const results = resolve(process.env.PULI_SMOKE_RESULTS || 'qa/smoke');
const problem = EXAMPLES[0];
const title = '가상 스터디 스모크 회차';
const completed = [];
let worker, browser, page;
let step = '가상 스터디 준비';

async function prepareStudy() {
  const secret = randomBytes(32).toString('base64');
  const bundle = await build({
    entryPoints: [join(source, 'server/index.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
  });
  worker = new Miniflare({
    host: '127.0.0.1',
    port: 0,
    cf: false,
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-05-22',
    d1Databases: ['DB'],
    assets: {
      directory: join(source, 'public'),
      binding: 'ASSETS',
      routerConfig: {has_user_worker: true, invoke_user_worker_ahead_of_assets: true},
    },
    bindings: {ENCRYPTION_KEY: secret, OWNER_GITHUB_ID: '1'},
    outboundService: request => {
      if (request.url.startsWith('https://api.github.com/user/installations?')) {
        return Response.json({installations: [], total_count: 0});
      }
      return new Response('외부 요청은 스모크 테스트에서 사용할 수 없습니다.', {status: 503});
    },
  });
  const db = await worker.getD1Database('DB');
  const migrations = join(source, 'migrations');
  for (const file of (await readdir(migrations)).filter(file => file.endsWith('.sql')).sort()) {
    const sql = await readFile(join(migrations, file), 'utf8');
    for (const statement of sql.split(';').filter(text => text.trim())) {
      await db.prepare(statement).run();
    }
  }
  const github = await seal({id: 1, slug: 'puli-smoke'}, secret);
  await db.prepare('INSERT INTO config VALUES (?,?)').bind('github', github).run();
  const sessions = [];
  const env = {DB: db, ENCRYPTION_KEY: secret};
  for (const [id, role, name, slot] of [['1', 'owner', '가상 운영자', 0], ['2', 'member', '가상 팀원', 1]]) {
    await db.prepare('INSERT INTO members(id,login,name,role,slot) VALUES (?,?,?,?,?)')
      .bind(id, 'smoke-' + id, name, role, slot).run();
    sessions.push(await createSession(env, id, {access_token: 'fixture-token'}, false));
  }
  await seedLegacyMemberships(db);
  return {origin: (await worker.ready).origin, sessions};
}

async function openBrowserPage(origin, session) {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}});
  await context.addCookies([{name: 'puli_session', value: session.raw, url: origin, httpOnly: true}]);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    // This scenario exercises review of an ambiguous photo, independently of OCR quality.
    if (url.pathname === '/vendor/ocr/tesseract.esm.min.js') {
      return route.fulfill({
        contentType: 'text/javascript',
        body: 'export default {createWorker: async () => {throw new Error("Synthetic photo needs review")}};',
      });
    }
    return route.continue();
  });
  const tab = await context.newPage();
  tab.setDefaultTimeout(8_000);
  return tab;
}

async function post(tab, pathname, click) {
  const [response] = await Promise.all([
    tab.waitForResponse(res => res.request().method() === 'POST' && new URL(res.url()).pathname === pathname),
    click(),
  ]);
  if (!response.ok()) {
    throw new Error(`${pathname} 응답 ${response.status()}: ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
}

await mkdir(results, {recursive: true});
try {
  const {origin, sessions} = await prepareStudy();
  browser = await chromium.launch({executablePath: process.env.PULI_SMOKE_CHROMIUM});
  const owner = await openBrowserPage(origin, sessions[0]);
  const reviewer = await openBrowserPage(origin, sessions[1]);
  completed.push(step);

  step = '문제 등록과 회차 공개';
  page = owner;
  await owner.goto(origin + '/#register');
  await owner.locator('#title').fill(title);
  await owner.getByRole('button', {name: '예시로 채우기'}).click();
  await owner.getByRole('button', {name: '등록 내용 확인'}).click();
  await post(owner, '/api/rounds', () => owner.getByRole('button', {name: '회차 공개하기'}).click());
  await owner.getByRole('heading', {name: title}).waitFor();
  completed.push(step);

  step = '사진 첨부와 확인 대기';
  await owner.goto(origin + '/#verify/' + problem.id);
  await owner.getByRole('tab', {name: '사진 인증'}).click();
  const photo = await sharp({create: {width: 240, height: 120, channels: 3, background: '#eef2f6'}}).png().toBuffer();
  await owner.getByLabel('인증 사진 선택').setInputFiles({name: 'smoke.png', mimeType: 'image/png', buffer: photo});
  await owner.locator('input[name="confirmed"]').check();
  const submission = await post(owner, '/api/photo', () => owner.locator('#submit-photo').click());
  assert.equal(submission.status, 'pending', '가상 사진은 팀원 확인 대기 상태여야 합니다.');
  await owner.getByText('팀원 확인 대기', {exact: true}).waitFor();
  completed.push(step);

  step = '다른 팀원의 원본 사진 확인과 승인';
  page = reviewer;
  await reviewer.goto(origin + '/#home');
  await reviewer.getByRole('button', {name: `가상 운영자, ${problem.title}, 사진 확인 대기`}).click();
  await reviewer.getByRole('img', {name: `${problem.title} 제출 원본 사진`}).waitFor();
  await post(reviewer, '/api/photo-submissions/' + submission.id + '/review', () =>
    reviewer.getByRole('button', {name: '문제와 통과 결과 확인 후 승인'}).click());
  completed.push(step);

  step = '인증 현황에 승인 결과 반영';
  await reviewer.getByRole('button', {name: `가상 운영자, ${problem.title}, 인증 완료, 사진`}).waitFor();
  completed.push(step);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  await page?.screenshot({path: join(results, 'failure.png'), timeout: 4_000}).catch(() => {});
} finally {
  const failed = process.exitCode === 1;
  const summary = [
    '# 가상 스터디 스모크 테스트',
    '',
    ...completed.map(name => '- 통과: ' + name),
    ...(failed ? ['- 실패: ' + step] : []),
    '',
  ].join('\n');
  await writeFile(join(results, 'summary.md'), summary);
  console.log(summary);
  await browser?.close();
  await worker?.dispose();
}
