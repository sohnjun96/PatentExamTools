import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Run before building, including on hosts whose optional packages differ from CI.
const root = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
assert(lock.lockfileVersion >= 2 && lock.packages?.[''], 'A modern package-lock.json with a root package is required.');
for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  assert.deepEqual(lock.packages[''][section] || {}, manifest[section] || {}, `${section} differs between package.json and package-lock.json.`);
}

function findPackage(owner, name) {
  let location = owner;
  while (true) {
    const candidate = `${location ? `${location}/` : ''}node_modules/${name}`;
    if (lock.packages[candidate]) return candidate;
    if (!location) return null;
    const boundary = location.lastIndexOf('/node_modules/');
    location = boundary < 0 ? '' : location.slice(0, boundary);
  }
}

const missing = [];
for (const [owner, entry] of Object.entries(lock.packages)) {
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    // Only the root's devDependencies describe installed project dependencies.
    if (owner && section === 'devDependencies') continue;
    for (const [name, range] of Object.entries(entry[section] || {})) {
      if (section === 'peerDependencies' && entry.peerDependenciesMeta?.[name]?.optional) continue;
      if (!findPackage(owner, name)) missing.push(`${owner || '(root)'} -> ${name}@${range}`);
    }
  }
}
assert.equal(missing.length, 0, `Missing dependency entries in package-lock.json:\n${missing.join('\n')}\nRegenerate the lock in a directory without node_modules using the CI npm version, then verify npm ci.`);
console.log(`Lockfile check passed: manifest and ${Object.keys(lock.packages).length - 1} package entries have complete dependency references.`);
