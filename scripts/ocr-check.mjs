import {once} from 'node:events';
import {mkdir, readFile, realpath, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {extname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {escapeHTML as h} from '../public/core.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const candidate = resolve(process.argv[2] || root);
const results = resolve(process.env.PULI_OCR_RESULTS || 'qa/ocr-check');
const leetcode = {id: 'lc-array-partition', title: 'Array Partition', platform: 'leetcode'};
const otherProblem = {id: 'lc-two-sum', title: 'Two Sum', platform: 'leetcode'};
const programmers = {id: 'pg-42862', title: '체육복', platform: 'programmers'};
const captures = [
  {id: 'leetcode-light-accepted', label: 'LeetCode 밝은 화면 통과', problem: leetcode, expected: 'match'},
  {id: 'leetcode-dark-accepted', label: 'LeetCode 다크모드 통과', problem: leetcode, expected: 'match'},
  {id: 'leetcode-other-problem', label: 'LeetCode 다른 문제 통과', problem: leetcode, expected: 'mismatch'},
  {id: 'leetcode-wrong-answer', label: 'LeetCode 오답', problem: leetcode, expected: 'mismatch'},
  {id: 'programmers-dark-accepted', label: '프로그래머스 다크모드 통과', problem: programmers, expected: 'match'},
];
const verdicts = {match: '일치', mismatch: '불일치', unclear: '확인 필요', unavailable: '인식 없음', error: '실행 오류'};
const contentTypes = {'.js': 'text/javascript', '.wasm': 'application/wasm', '.gz': 'application/gzip'};
const assetsPrefix = '/vendor/ocr/';

async function serve(source, engine) {
  const sourceRoot = await realpath(source);
  const publicRoot = await realpath(join(sourceRoot, 'public'));
  if (!publicRoot.startsWith(sourceRoot + sep)) throw new Error('PR의 public 폴더가 소스 밖을 가리킵니다.');

  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (path === '/') {
        response.writeHead(200, {'Content-Type': 'text/html'});
        response.end('<!doctype html><meta charset="utf-8"><title>GEUMGYUL OCR check</title>');
        return;
      }
      const directory = path.startsWith(assetsPrefix) ? engine : publicRoot;
      const file = await realpath(join(directory, path.slice(directory === engine ? assetsPrefix.length : 1)));
      if (!file.startsWith(directory + sep)) throw new Error('Outside assets');
      response.writeHead(200, {'Content-Type': contentTypes[extname(file)] || 'application/octet-stream'});
      response.end(await readFile(file));
    } catch {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {server, url: 'http://127.0.0.1:' + server.address().port};
}

async function measure(browser, source, engine, inputs) {
  const {server, url} = await serve(source, engine);
  let context;
  try {
    context = await browser.newContext({serviceWorkers: 'block'});
    await context.route('**/*', route => new URL(route.request().url()).origin === url ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(url);
    const measurements = [];
    for (const {id, problem, image} of inputs) {
      try {
        const result = await page.evaluate(async ({id, problem, image, otherProblem}) => {
          const [{recognizePhoto}, {assessPhotoOCR}] = await Promise.all([import('/ocr.js'), import('/ocr-match.js')]);
          const bytes = Uint8Array.from(atob(image), character => character.charCodeAt(0));
          const file = new File([bytes], id + '.png', {type: 'image/png'});
          const assigned = problem.platform === 'leetcode' ? [problem, otherProblem] : [problem];
          const ocr = await recognizePhoto(file, {problem, assigned});
          const assessment = assessPhotoOCR(problem, ocr, assigned);
          return {
            verdict: assessment.verdict,
            confidence: assessment.confidence,
            reason: String(assessment.reason || '').slice(0, 500),
            text: String(ocr.text || '').slice(0, 6000),
          };
        }, {id, problem, image, otherProblem});
        if (!Object.hasOwn(verdicts, result.verdict)) throw new Error('알 수 없는 판정 값');
        measurements.push(result);
      } catch (error) {
        measurements.push({verdict: 'error', reason: String(error.message).slice(0, 500), text: ''});
      }
    }
    return measurements;
  } finally {
    await context?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

function htmlReport(rows) {
  const details = (version, result) =>
    `<details><summary>${version} OCR 결과와 판정 근거</summary><p>${h(result.reason)}${Number.isFinite(result.confidence) ? ' (점수 ' + result.confidence + ')' : ''}</p><pre>${h(result.text)}</pre></details>`;
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>GEUMGYUL OCR 비교</title><style>
body{font:1rem/1.55 system-ui,sans-serif;margin:2rem auto;padding:0 1rem;max-width:56rem;color:#17212e}
section{border-top:1px solid #dce3e8;padding:1rem 0}img{display:block;max-width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}
summary{cursor:pointer}.changed{font-weight:bold;color:#9b3421}
</style><h1>GEUMGYUL OCR 비교</h1><p>판정이 바뀐 캡처를 위에 표시합니다. 이미지와 두 버전의 OCR 결과를 함께 볼 수 있습니다.</p>
${rows.map(({id, label, expected, base, pr, changed}) => `<section>
<h2>${h(label)}</h2><p class="${changed ? 'changed' : ''}">main ${verdicts[base.verdict]} → PR ${verdicts[pr.verdict]} (기대 ${verdicts[expected]})${changed ? ' / 판정 변경' : ''}</p>
<a href="${id}.png"><img src="${id}.png" alt="${h(label)}"></a>
${details('main', base)}${details('PR', pr)}</section>`).join('\n')}</html>`;
}

await mkdir(results, {recursive: true});
const engine = await realpath(join(root, 'public', assetsPrefix));
const inputs = await Promise.all(captures.map(async sample => {
  const image = await readFile(join(root, 'tests/ocr-captures', sample.id + '.png'));
  await writeFile(join(results, sample.id + '.png'), image);
  return {...sample, image: image.toString('base64')};
}));
const browser = await chromium.launch({executablePath: process.env.PULI_SMOKE_CHROMIUM});
try {
  const base = await measure(browser, root, engine, inputs);
  const pr = await measure(browser, candidate, engine, inputs);
  const rows = captures.map(({id, label, expected}, index) => ({
    id, label, expected, base: base[index], pr: pr[index], changed: base[index].verdict !== pr[index].verdict,
  })).sort((a, b) => Number(b.changed) - Number(a.changed));
  const summary = [
    '# OCR 판정 비교',
    '',
    '판정이 바뀐 캡처 ' + rows.filter(row => row.changed).length + '개. Artifacts의 `ocr-comparison`에서 `report.html`을 열어 캡처와 OCR 근거를 확인할 수 있습니다.',
    '',
    '| 캡처 | main | PR | 기대 | 판정 변경 |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(({label, base, pr, expected, changed}) =>
      `| ${label} | ${verdicts[base.verdict]} | ${verdicts[pr.verdict]} | ${verdicts[expected]} | ${changed ? '변경' : '동일'} |`),
    '',
  ].join('\n');
  await writeFile(join(results, 'summary.md'), summary);
  await writeFile(join(results, 'comparison.json'), JSON.stringify(rows, null, 2) + '\n');
  await writeFile(join(results, 'report.html'), htmlReport(rows));
  console.log(summary);
  if (rows.some(row => row.base.verdict === 'error' || row.pr.verdict !== row.expected)) process.exitCode = 1;
} finally {
  await browser.close();
}
