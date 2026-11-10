import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {addDays, escapeHTML as h, EXAMPLES, kstDate} from '../public/core.js';
import {createBrowserStudy, openStudyPage} from './browser-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const candidate = resolve(process.argv[2] || root);
const results = resolve(process.env.PULI_PREVIEW_RESULTS || 'qa/preview');
const time = new Date();
const devices = [
  {id: 'pc', label: 'PC', viewport: {width: 1280, height: 900}},
  {id: 'mobile', label: '모바일', viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true},
];
const views = [
  {id: 'home', label: '문제와 인증 현황', route: 'home'},
  {id: 'register', label: '문제 등록', route: 'register'},
  {id: 'photo', label: '사진 인증', route: 'verify/' + EXAMPLES[0].id, photo: true},
];

async function seedPreview(db) {
  const today = kstDate(time);
  const at = time.toISOString();
  await db.batch([
    db.prepare("UPDATE studies SET name = ?, description = ?, created_by = '1' WHERE id = 'study'")
      .bind('푸리 미리보기 스터디', '같은 문제를 풀고 인증 결과를 공유하는 가상 스터디입니다.'),
    db.prepare(`INSERT INTO rounds
      (id, number, title, start_date, deadline_date, setter, problems, created_at, registered_by)
      VALUES (?, ?, ?, ?, ?, '1', ?, ?, '1')`)
      .bind('preview-round', 1, '가상 스터디 첫 회차', addDays(today, -1), addDays(today, 4), JSON.stringify(EXAMPLES), at),
    db.prepare(`INSERT INTO certificates (round_id, member_id, problem_id, method, at, observed_at, evidence)
      VALUES ('preview-round', '2', ?, 'github', ?, ?, ?)`)
      .bind(EXAMPLES[0].id, at, at, JSON.stringify({sha: 'preview-fixture', url: 'https://github.com/example/solutions'})),
  ]);
}

async function capture(browser, source, version) {
  const {worker, db, origin, sessions} = await createBrowserStudy(source);
  const screenshots = new Map();
  try {
    await seedPreview(db);
    for (const {id, label, ...options} of devices) {
      const page = await openStudyPage(browser, origin, sessions[0], {
        ...options,
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      });
      try {
        await page.clock.setFixedTime(time);
        for (const view of views) {
          try {
            const state = page.waitForResponse(response =>
              new URL(response.url()).pathname === '/api/state' && response.ok());
            await Promise.all([state, page.goto(origin + '/?preview=' + view.id + '#' + view.route, {waitUntil: 'networkidle'})]);
            await page.locator('#app main').waitFor();
            if (view.photo) await page.locator('#photo-tab').click();
            await page.evaluate(() => document.fonts.ready);
            const key = id + '-' + view.id;
            const file = key + '-' + version + '.png';
            const image = await page.screenshot({fullPage: true, animations: 'disabled', caret: 'hide'});
            await writeFile(join(results, file), image);
            screenshots.set(key, {file, image});
          } catch (error) {
            await page.screenshot({path: join(results, version + '-' + id + '-' + view.id + '-failure.png'), timeout: 4_000}).catch(() => {});
            throw new Error(`${version} ${label} ${view.label}: ${error.message}`, {cause: error});
          }
        }
      } finally {
        await page.context().close();
      }
    }
    return screenshots;
  } finally {
    await worker.dispose();
  }
}

async function compareImages(base, pr, file) {
  const [before, after] = await Promise.all([sharp(base).metadata(), sharp(pr).metadata()]);
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  if (width * height > 12_000_000) throw new Error('비교할 화면이 너무 큽니다.');
  const pad = (image, info) => sharp(image).toColourspace('srgb').removeAlpha()
    .extend({top: 0, left: 0, right: width - info.width, bottom: height - info.height, background: '#fff'})
    .raw().toBuffer();
  const [beforePixels, afterPixels] = await Promise.all([pad(base, before), pad(pr, after)]);
  const overlay = Buffer.alloc(afterPixels.length);
  let changed = 0;
  for (let i = 0; i < width * height; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const offset = i * 3;
    const sameBounds = (x < before.width && y < before.height) === (x < after.width && y < after.height);
    const difference = Math.max(
      Math.abs(beforePixels[offset] - afterPixels[offset]),
      Math.abs(beforePixels[offset + 1] - afterPixels[offset + 1]),
      Math.abs(beforePixels[offset + 2] - afterPixels[offset + 2]),
    );
    if (!sameBounds || difference > 12) {
      changed++;
      overlay.set([210, 30, 95], offset);
    } else {
      for (let channel = 0; channel < 3; channel++) {
        overlay[offset + channel] = Math.round(afterPixels[offset + channel] * 0.35 + 255 * 0.65);
      }
    }
  }
  await sharp(overlay, {raw: {width, height, channels: 3}}).png().toFile(join(results, file));
  return {
    changed,
    percentage: (100 * changed / (width * height)).toFixed(2),
    beforeSize: `${before.width}×${before.height}`,
    afterSize: `${after.width}×${after.height}`,
  };
}

function htmlReport(rows) {
  const figure = (label, file) => `<figure><figcaption>${label}</figcaption><a href="${file}"><img loading="lazy" src="${file}" alt="${label} 화면"></a></figure>`;
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>푸리 PR 화면 비교</title><style>
body{font:1rem/1.55 system-ui,sans-serif;margin:2rem auto;padding:0 1rem;max-width:100rem;color:#17212e;background:#f7f9fc}
section{margin-block:2rem;padding:1rem;border:1px solid #dbe2ea;border-radius:10px;background:white}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;align-items:start}
figure{margin:0;min-width:0}figcaption{margin-bottom:.5rem;font-weight:650}
img{display:block;width:100%;height:auto;border:1px solid #dbe2ea}a{color:#175873}
@media(max-width:700px){.grid{grid-template-columns:1fr}}
</style><h1>푸리 PR 화면 비교</h1>
<p>같은 가상 스터디를 PC와 모바일에서 캡처했습니다. 변경 비교에서 분홍색은 달라진 픽셀입니다. 이미지를 누르면 원본 PNG를 열 수 있습니다.</p>
<nav>${rows.map(row => `<a href="#${row.id}">${h(row.device + ' ' + row.view)}</a>`).join(' / ')}</nav>
${rows.map(row => `<section id="${row.id}"><h2>${h(row.device + ' ' + row.view)}</h2>
<p>변경 픽셀 ${row.percentage}% (main ${row.beforeSize}, PR ${row.afterSize})</p>
<div class="grid">${figure('main', row.base)}${figure('PR', row.pr)}${figure('변경 비교', row.diff)}</div></section>`).join('\n')}</html>`;
}

await mkdir(results, {recursive: true});
const browser = await chromium.launch({executablePath: process.env.PULI_SMOKE_CHROMIUM});
try {
  const base = await capture(browser, root, 'main');
  const pr = await capture(browser, candidate, 'pr');
  const rows = [];
  for (const device of devices) {
    for (const view of views) {
      const id = device.id + '-' + view.id;
      const before = base.get(id);
      const after = pr.get(id);
      const diff = id + '-diff.png';
      rows.push({
        id, device: device.label, view: view.label, base: before.file, pr: after.file, diff,
        ...await compareImages(before.image, after.image, diff),
      });
    }
  }
  const summary = [
    '# 가상 스터디 화면 미리보기',
    '',
    'Artifacts의 `preview-comparison`을 내려받아 `report.html`에서 main, PR, 변경 비교를 나란히 볼 수 있습니다.',
    '',
    '| 기기 | 화면 | 변경 픽셀 |',
    '| --- | --- | --- |',
    ...rows.map(({device, view, percentage}) => `| ${device} | ${view} | ${percentage}% |`),
    '',
  ].join('\n');
  await writeFile(join(results, 'summary.md'), summary);
  await writeFile(join(results, 'comparison.json'), JSON.stringify(rows, null, 2) + '\n');
  await writeFile(join(results, 'report.html'), htmlReport(rows));
  console.log(summary);
} catch (error) {
  await writeFile(join(results, 'summary.md'), '# 미리보기 실패\n\n<code>' + h(error.message.slice(0, 500)) + '</code>\n');
  throw error;
} finally {
  await browser.close();
}
