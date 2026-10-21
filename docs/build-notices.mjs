import { copyFileSync } from 'node:fs';
for (const file of ['PHASER-LICENSE.txt', 'EVENTEMITTER3-LICENSE.txt']) {
  copyFileSync(new URL('./' + file, import.meta.url), new URL('../dist/' + file, import.meta.url));
}
