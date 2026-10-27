import assert from 'node:assert/strict';
import { BUREAUS, parseBureau, parseBureauRoute, bureauPath, evaluationApiUrl } from '../app/lib/bureaus.ts';

for (const bureau of BUREAUS) {
  assert.equal(parseBureau(bureau), bureau);
  assert.equal(parseBureauRoute(bureau), bureau);
  assert.equal(parseBureauRoute(encodeURIComponent(bureau)), bureau);
  assert.equal(parseBureauRoute(encodeURIComponent(encodeURIComponent(bureau))), null);
  assert.equal(bureauPath(bureau), `/${bureau}`);
  assert.equal(bureauPath(bureau, true), `/${bureau}/rhksfl`);
  const admin = new URL(evaluationApiUrl(bureau, true), 'http://localhost');
  assert.equal(admin.searchParams.get('bureau'), bureau);
  assert.equal(admin.searchParams.get('admin'), '1');
  const user = new URL(evaluationApiUrl(bureau, false, 'user with&special?chars'), 'http://localhost');
  assert.equal(user.searchParams.get('bureau'), bureau);
  assert.equal(user.searchParams.get('userId'), 'user with&special?chars');
  assert.equal(user.searchParams.has('admin'), false);
}
for (const value of ['', '없는국', '../admin', '%EA%B8%B0%ED%9A%8D%EA%B5%AD', null, undefined, 1]) {
  assert.equal(parseBureau(value), null);
}
assert.equal(bureauPath(), '/');
assert.equal(parseBureauRoute('%ZZ'), null);
assert.equal(parseBureauRoute('../기획국'), null);
assert.equal(bureauPath(undefined, true), '/admin');
assert.equal(new URL(evaluationApiUrl(), 'http://localhost').searchParams.has('bureau'), false);
console.log('Bureau routes: six exact paths, /rhksfl administration, encoded query values and legacy compatibility passed.');
