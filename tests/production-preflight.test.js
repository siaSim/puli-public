import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProductionState} from '../scripts/production-preflight.mjs';

const cfg = {vars:{OWNER_GITHUB_ID:'1'}, d1_databases:[{database_id:'db-1'}]};
const bindings = [{name:'DB', type:'d1', id:'db-1'}, {name:'OWNER_GITHUB_ID', type:'plain_text', text:'1'}, {name:'ENCRYPTION_KEY', type:'secret_text'}];
const migrations = [{name:'0001.sql',sha256:'a'}, {name:'0002.sql',sha256:'b'}];
const applied = [...migrations];

test('production preflight accepts matching bindings and migration history', () => {
  assert.doesNotThrow(() => validateProductionState(cfg, bindings, migrations, applied));
});
test('production preflight refuses a different DB, owner or missing encryption key', () => {
  for (const invalid of [
    bindings.map(b => b.name === 'DB' ? {...b,id:'other-db'} : b),
    bindings.map(b => b.name === 'OWNER_GITHUB_ID' ? {...b,text:'2'} : b),
    bindings.filter(b => b.name !== 'ENCRYPTION_KEY'),
  ]) assert.throws(() => validateProductionState(cfg, invalid, migrations, applied));
});
test('production preflight blocks both unapplied and missing migration files', () => {
  assert.throws(() => validateProductionState(cfg, bindings, [...migrations, {name:'0003.sql',sha256:'c'}], applied));
  assert.throws(() => validateProductionState(cfg, bindings, [{name:'0001.sql',sha256:'a'}], applied));
});
