// Links the local Tide checkout (../design-system) into node_modules.
// Use this when you have no GitHub Packages token yet; `npm install` with a
// token in ~/.npmrc installs the published package instead.
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, '..', 'design-system');
const link = resolve(root, 'node_modules', '@aaronherbert', 'design-system');

if (!existsSync(resolve(target, 'dist', 'index.js'))) {
  console.error(`No built Tide found at ${target}. Run "npm install && npm run build" there first.`);
  process.exit(1);
}
mkdirSync(dirname(link), { recursive: true });
try {
  if (lstatSync(link)) rmSync(link, { recursive: true, force: true });
} catch {
  // nothing to remove
}
symlinkSync(target, link, 'junction');
console.log(`Linked ${link} -> ${target}`);
