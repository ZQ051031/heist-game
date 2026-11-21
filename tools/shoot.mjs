// Takes the screenshots listed in shots.json from the real game in headless Chrome, as JPEGs,
// straight from the browser's renderer: `node tools/shoot.mjs` writes screenshots/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from './cdp.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const page = pathToFileURL(join(root, 'game', 'index.html')).href;
mkdirSync(join(root, 'screenshots'), { recursive: true });
const browser = await launch();
const requests = [];
browser.on((m) => {
  if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  if (m.method === 'Runtime.exceptionThrown') console.error('page error:', m.params.exceptionDetails.exception?.description);
});
await browser.send('Network.enable');
await browser.send('Runtime.enable');
for (const shot of shots) {
  await browser.send('Page.navigate', { url: page + shot.query });
  for (let i = 0; i < 100 && !(await browser.evaluate('window.__shotReady === true')); i += 1) await new Promise((r) => setTimeout(r, 100));
  const { data } = await browser.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  const bytes = Buffer.from(data, 'base64');
  writeFileSync(join(root, 'screenshots', shot.name), bytes);
  console.log(shot.name, bytes.length, 'bytes');
}
const remote = requests.filter((u) => !u.startsWith('file:') && !u.startsWith('data:'));
console.log(remote.length ? `non-local requests: ${remote.join(', ')}` : 'no network requests');
browser.close();
