import {randomBytes} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {unstable_splitSqlQuery} from 'wrangler';
import {seal} from '../server/crypto.js';
import {createSession} from '../server/session.js';
import {seedLegacyMemberships} from '../tests/fixtures.js';

export async function createBrowserStudy(source) {
  const secret = randomBytes(32).toString('base64');
  const bundle = await build({
    entryPoints: [join(source, 'server/index.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
  });
  const worker = new Miniflare({
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
      return new Response('외부 요청은 가상 스터디에서 사용할 수 없습니다.', {status: 503});
    },
  });
  try {
    const db = await worker.getD1Database('DB');
    const migrations = join(source, 'migrations');
    for (const file of (await readdir(migrations)).filter(file => file.endsWith('.sql')).sort()) {
      const sql = await readFile(join(migrations, file), 'utf8');
      const statements = unstable_splitSqlQuery(sql).filter(text => text.trim());
      if (statements.length) await db.batch(statements.map(statement => db.prepare(statement)));
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
    return {worker, db, origin: (await worker.ready).origin, sessions};
  } catch (error) {
    await worker.dispose();
    throw error;
  }
}

export async function openStudyPage(browser, origin, session, options = {}) {
  const context = await browser.newContext({
    viewport: {width: 1280, height: 900},
    serviceWorkers: 'block',
    ...options,
  });
  await context.addCookies([{name: 'puli_session', value: session.raw, url: origin, httpOnly: true}]);
  await context.route('**/*', route =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  return page;
}
