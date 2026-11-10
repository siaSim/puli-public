import {createHash} from 'node:crypto';
import {lstat, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {Miniflare} from 'miniflare';
import {unstable_splitSqlQuery} from 'wrangler';
import {escapeHTML as h} from '../public/core.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const candidate = resolve(process.argv[2] || root);
const results = resolve(process.env.PULI_MIGRATION_RESULTS || 'qa/migration-check');
const tables = {
  members: ['id'],
  studies: ['id'],
  study_memberships: ['study_id', 'member_id'],
  rounds: ['id'],
  certificates: ['round_id', 'member_id', 'problem_id'],
  photos: ['id'],
  photo_submissions: ['id'],
};

async function readMigrations(source) {
  const directory = join(source, 'migrations');
  if (!(await lstat(directory)).isDirectory()) throw new Error('마이그레이션 경로는 일반 폴더여야 합니다.');
  const entries = (await readdir(directory, {withFileTypes: true})).filter(entry => entry.name.endsWith('.sql'));
  for (const entry of entries) {
    if (!entry.isFile()) throw new Error('일반 SQL 파일만 검사할 수 있습니다. ' + entry.name);
  }
  return Promise.all(entries.map(entry => entry.name).sort().map(async name =>
    ({name, bytes: await readFile(join(directory, name))})));
}

function planMigrations(base, pr) {
  const known = new Map(base.map(file => [file.name, file.bytes]));
  const proposed = new Map(pr.map(file => [file.name, file.bytes]));
  const problems = [];
  for (const [name, bytes] of known) {
    if (!proposed.has(name)) problems.push({file: name, reason: '기존 파일 삭제 또는 이름 변경'});
    else if (!bytes.equals(proposed.get(name))) problems.push({file: name, reason: '이미 적용된 SQL 변경'});
  }
  const added = pr.filter(file => !known.has(file.name));
  for (const {name} of added) {
    if (name <= base.at(-1).name) {
      problems.push({file: name, reason: '새 SQL 파일은 기존 파일 뒤에 추가해야 합니다'});
    }
  }
  return {added, problems};
}

async function applySql(db, sql, name) {
  const statements = unstable_splitSqlQuery(sql).filter(statement => statement.trim());
  if (!statements.length) return;
  try {
    await db.batch(statements.map(statement => db.prepare(statement)));
  } catch (error) {
    throw new Error(name + ' 적용 실패: ' + error.message, {cause: error});
  }
}

function normalize(value) {
  if (!Array.isArray(value)) return value;
  const bytes = Buffer.from(value);
  return {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
}

async function snapshot(db) {
  const data = {};
  for (const table of Object.keys(tables)) {
    const {results: info} = await db.prepare(`PRAGMA table_info("${table}")`).all();
    const columns = info.map(column => column.name);
    const {results: rows} = columns.length ? await db.prepare(`SELECT * FROM "${table}"`).all() : {results: []};
    data[table] = {
      columns,
      rows: rows.map(row => Object.fromEntries(columns.map(column => [column, normalize(row[column])]))),
    };
  }
  return data;
}

function indexRows(rows, keys) {
  const index = new Map();
  const duplicates = new Set();
  for (const row of rows) {
    const key = JSON.stringify(keys.map(column => row[column]));
    if (index.has(key)) duplicates.add(key);
    else index.set(key, row);
  }
  return {index, duplicates};
}

function compare(before, after) {
  return Object.entries(tables).map(([table, keys]) => {
    const previous = before[table];
    const current = after[table];
    const addedColumns = current.columns.filter(column => !previous.columns.includes(column));
    const removedColumns = previous.columns.filter(column => !current.columns.includes(column));
    const oldRows = indexRows(previous.rows, keys).index;
    const {index: newRows, duplicates} = indexRows(current.rows, keys);
    const changes = [];
    for (const [key, row] of oldRows) {
      const updated = newRows.get(key);
      if (!updated) {
        changes.push({key, kind: '삭제', before: row});
        continue;
      }
      const fields = previous.columns.filter(column => !isDeepStrictEqual(row[column], updated[column]))
        .map(column => ({column, before: row[column], after: updated[column]}));
      if (fields.length) changes.push({key, kind: '변경', fields});
    }
    for (const [key, row] of newRows) {
      if (!oldRows.has(key)) changes.push({key, kind: '추가', after: row});
    }
    return {table, before: previous.rows.length, after: current.rows.length, addedColumns, removedColumns, duplicates: [...duplicates], changes};
  });
}

function code(value) {
  return '<code>' + h(String(value ?? '없음').replace(/\s+/g, ' ').slice(0, 350)) + '</code>';
}

function summarize(report) {
  const changes = report.tables.flatMap(({table, changes}) => changes.map(change => ({table, ...change})));
  const lines = [
    '# 가상 DB 마이그레이션 비교',
    '',
    report.failed ? '**실패**' : '**통과**',
    '',
    '새 SQL 파일: ' + (report.applied.map(code).join(', ') || '적용된 파일 없음'),
    ...report.planProblems.map(({file, reason}) => '- ' + code(file) + ' ' + reason),
    ...(report.error ? ['- 실행 오류: ' + code(report.error)] : []),
    '',
  ];
  if (report.tables.length) {
    lines.push(
      '| 기록 | 이전 행 수 | 적용 후 행 수 | 변경된 행 |',
      '| --- | --- | --- | --- |',
      ...report.tables.map(table => `| ${table.table} | ${table.before} | ${table.after} | ${table.changes.length} |`),
      '',
    );
  }
  for (const table of report.tables) {
    if (table.addedColumns.length) lines.push('- ' + code(table.table) + ' 추가 열: ' + table.addedColumns.map(code).join(', '));
    if (table.removedColumns.length) lines.push('- ' + code(table.table) + ' 사라진 열: ' + table.removedColumns.map(code).join(', '));
    for (const key of table.duplicates) lines.push('- ' + code(table.table) + ' 중복 키: ' + code(key));
  }
  for (const {table, key, kind, fields} of changes.slice(0, 20)) {
    lines.push('- ' + code(table) + ' ' + code(key) + ' ' + kind);
    for (const {column, before, after} of fields || []) {
      lines.push('  - ' + code(column) + ' ' + code(JSON.stringify(before)) + ' → ' + code(JSON.stringify(after)));
    }
  }
  if (report.foreignKeyViolations.length) lines.push('- 외래 키 위반: ' + report.foreignKeyViolations.length + '건');
  lines.push('', '전체 변경 내역은 Artifacts의 `migration-comparison/comparison.json`에서 볼 수 있습니다.', '');
  return lines.join('\n');
}

await mkdir(results, {recursive: true});
const report = {applied: [], planProblems: [], tables: [], foreignKeyViolations: [], error: null, failed: false};
let worker;
try {
  const [base, pr] = await Promise.all([readMigrations(root), readMigrations(candidate)]);
  if (!base.length) throw new Error('기준 버전의 마이그레이션이 없습니다.');
  const plan = planMigrations(base, pr);
  report.planProblems = plan.problems;
  if (!plan.problems.length) {
    worker = new Miniflare({
      modules: true,
      script: 'export default {fetch() {return new Response(null)}}',
      compatibilityDate: '2026-05-22',
      cf: false,
      d1Databases: ['DB'],
    });
    const db = await worker.getD1Database('DB');
    for (const {name, bytes} of base) await applySql(db, bytes.toString(), name);
    await applySql(db, await readFile(join(root, 'tests/migration-check/seed.sql'), 'utf8'), '가상 데이터 준비');
    const before = await snapshot(db);
    try {
      for (const {name, bytes} of plan.added) {
        await applySql(db, bytes.toString(), name);
        report.applied.push(name);
      }
    } catch (error) {
      report.error = error.message;
    }
    report.tables = compare(before, await snapshot(db));
    report.foreignKeyViolations = (await db.prepare('PRAGMA foreign_key_check').all()).results;
  }
} catch (error) {
  report.error = report.error ? report.error + ' / ' + error.message : error.message;
} finally {
  await worker?.dispose();
}
report.failed = Boolean(report.error || report.planProblems.length || report.foreignKeyViolations.length ||
  report.tables.some(table => table.removedColumns.length || table.duplicates.length ||
    table.changes.some(change => change.kind !== '추가')));
const summary = summarize(report);
await writeFile(join(results, 'summary.md'), summary);
await writeFile(join(results, 'comparison.json'), JSON.stringify(report, null, 2) + '\n');
console.log(summary);
if (report.failed) process.exitCode = 1;
