import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {EXAMPLES} from '../public/core.js';
import {createBrowserStudy, openStudyPage} from './browser-fixture.mjs';

const source = resolve(process.argv[2] || '.');
const results = resolve(process.env.PULI_SMOKE_RESULTS || 'qa/smoke');
const problem = EXAMPLES[0];
const title = '가상 스터디 스모크 회차';
const completed = [];
let worker, browser, page;
let step = '가상 스터디 준비';

async function openBrowserPage(origin, session) {
  const tab = await openStudyPage(browser, origin, session);
  // This scenario exercises review of an ambiguous photo, independently of OCR quality.
  await tab.route(origin + '/vendor/ocr/tesseract.esm.min.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: 'export default {createWorker: async () => {throw new Error("Synthetic photo needs review")}};',
  }));
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
  const {worker: fixture, origin, sessions} = await createBrowserStudy(source);
  worker = fixture;
  const repositories = await worker.dispatchFetch(origin + '/api/repositories', {
    headers: {Cookie: 'puli_session=' + sessions[0].raw},
  });
  assert.equal(repositories.status, 200, '가상 GitHub 앱의 저장소 연결 상태를 읽어야 합니다.');
  assert.equal((await repositories.json()).installURL, 'https://github.com/apps/geumgyul-smoke/installations/new');
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
