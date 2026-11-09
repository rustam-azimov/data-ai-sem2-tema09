// Запуск: node scripts/check_page_export.cjs
// API и локальные файлы перехватываются в отдельном браузере; сервер не нужен.
const { chromium } = require(process.env.HOME + '/.npm/_npx/9833c18b2d85bc59/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const root = path.resolve(__dirname, '..');
  const origin = 'http://topic09.test';
  const pageURL = origin + '/' + encodeURI('04_ИНТЕРАКТИВЫ/Тренажер_09_JSON.html');
  const sourceURL = origin + '/' + encodeURI('05_ДАННЫЕ_СТУДЕНТАМ/api_response.json');
  const snapshot = JSON.parse(fs.readFileSync(path.join(root, '05_ДАННЫЕ_СТУДЕНТАМ/api_response.json'), 'utf8'));
  const live = { products: snapshot.products.slice(5, 10), total: 200, limit: 5, skip: 5 };
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const failures = [];
  let checked = 0;
  try {
    const context = await browser.newContext({ acceptDownloads: true, timezoneId: 'Asia/Tokyo' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    let mode = 'abort';
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) {
        const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
        const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.vtt': 'text/vtt' };
        return route.fulfill({ status: 200, contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
      }
      if (url.origin !== 'https://dummyjson.com') return route.abort();
      const headers = { 'access-control-allow-origin': '*' };
      if (mode === 'abort') return route.abort('failed');
      if (mode === 'http-error') return route.fulfill({ status: 503, headers, body: 'Unavailable' });
      if (mode === 'invalid-json') return route.fulfill({ status: 200, headers, contentType: 'application/json', body: '{' });
      if (mode === 'redirect' && !url.searchParams.has('redirected')) {
        return route.fulfill({ status: 302, headers: { ...headers, location: url.href + '&redirected=1' } });
      }
      const body = mode === 'empty' ? { products: [], total: 20, limit: 5, skip: 30 }
        : mode === 'invalid-schema' ? { products: null, total: 20, limit: 5, skip: 5 } : live;
      return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
    });

    async function check(name, fn) {
      checked++;
      try { await fn(); console.log('✓ ' + name); }
      catch (error) { failures.push(name); console.error('FAIL ' + name + ': ' + error.message); }
    }
    async function download(id, filename) {
      // Chrome ограничивает частоту скачиваний; проверяем ручной сценарий без пачки кликов.
      await page.waitForTimeout(250);
      const pending = page.waitForEvent('download');
      await page.click('#' + id);
      const item = await pending;
      assert.equal(item.suggestedFilename(), filename);
      const stream = await item.createReadStream();
      const parts = [];
      for await (const part of stream) parts.push(part);
      assert.equal(await item.failure(), null);
      return JSON.parse(Buffer.concat(parts).toString('utf8'));
    }
    async function exported() {
      return { data: await download('download-page', 'page_response.json'),
        meta: await download('download-page-source', 'page_source.json') };
    }
    function utc(value) {
      assert.equal(typeof value, 'string');
      assert.equal(new Date(value).toISOString(), value);
      assert.ok(Math.abs(Date.now() - Date.parse(value)) < 60000);
    }
    function consistent({ data, meta }) {
      for (const key of ['total', 'limit', 'skip']) assert.equal(meta[key], data[key], key);
      assert.equal(meta.count, data.products.length);
      assert.deepEqual(meta.ids, data.products.map(product => product.id));
      utc(meta.exported_at);
    }
    function samePage(actual, expected) {
      assert.deepEqual(actual.data, expected.data);
      const { exported_at: a, ...am } = actual.meta;
      const { exported_at: b, ...bm } = expected.meta;
      assert.deepEqual(am, bm);
      consistent(actual);
    }
    async function request(nextMode) {
      mode = nextMode;
      await page.click('#live');
      await page.waitForFunction(() => !document.getElementById('live').disabled);
    }
    await page.goto(pageURL);
    await page.waitForFunction(() => document.getElementById('api-json').textContent.length > 0);
    const initial = await exported();
    await check('Снимок: реальные скачивания, источник, неизвестные HTTP/дата', async () => {
      consistent(initial);
      assert.deepEqual(initial.data.products, snapshot.products.slice(0, 10));
      assert.equal(initial.meta.mode, 'snapshot');
      assert.equal(initial.meta.source_url, sourceURL);
      assert.equal(initial.meta.request_url, null);
      assert.equal(initial.meta.http_status, null);
      assert.equal(initial.meta.received_at, null);
      assert.equal(initial.meta.source_total, snapshot.total);
      assert.equal(initial.meta.total, 30);
      assert.equal(initial.meta.example_live_url, 'https://dummyjson.com/products?limit=10&skip=0');
    });
    await page.selectOption('#skip', '10');
    await check('Изменение параметров без запроса не подменяет экспорт', async () => samePage(await exported(), initial));
    for (const failure of ['abort', 'http-error', 'invalid-json', 'invalid-schema']) {
      await request(failure);
      await check('Ошибка live (' + failure + ') сохраняет снимок и его источник', async () => {
        assert.match(await page.locator('#api-status').innerText(), /не выполнен/);
        samePage(await exported(), initial);
      });
    }
    await page.selectOption('#limit', '5');
    await page.selectOption('#skip', '5');
    await request('success');
    const successful = await exported();
    const requestedURL = 'https://dummyjson.com/products?limit=5&skip=5';
    await check('Live: данные, URL, HTTP 200 и время получения в UTC', async () => {
      consistent(successful);
      assert.deepEqual(successful.data, live);
      assert.equal(successful.meta.mode, 'live');
      assert.equal(successful.meta.source_url, requestedURL);
      assert.equal(successful.meta.request_url, requestedURL);
      assert.equal(successful.meta.http_status, 200);
      assert.equal(successful.meta.source_total, live.total);
      utc(successful.meta.received_at);
      assert.ok(Date.parse(successful.meta.exported_at) >= Date.parse(successful.meta.received_at));
    });
    await page.selectOption('#skip', '20');
    await request('http-error');
    await check('После ошибки live сохраняется предыдущий live, включая URL и время', async () => samePage(await exported(), successful));
    await page.selectOption('#skip', '5');
    await request('redirect');
    await check('Перенаправление сохраняет исходный URL запроса отдельно от URL ответа', async () => {
      const actual = await exported();
      consistent(actual);
      assert.equal(actual.meta.source_url, requestedURL + '&redirected=1');
      assert.equal(actual.meta.request_url, requestedURL);
    });
    await page.selectOption('#skip', '30');
    await request('empty');
    await check('Успешная пустая live-страница экспортируется как live', async () => {
      const actual = await exported();
      consistent(actual);
      assert.equal(actual.meta.mode, 'live');
      assert.equal(actual.meta.skip, 30);
      assert.equal(actual.meta.count, 0);
      assert.deepEqual(actual.data.products, []);
      assert.match(await page.locator('#api-status').innerText(), /^Живой API/);
    });
    await page.click('#snapshot');
    await check('Пустая страница снимка не наследует HTTP-статус и время live', async () => {
      const actual = await exported();
      consistent(actual);
      assert.equal(actual.meta.mode, 'snapshot');
      assert.equal(actual.meta.source_url, sourceURL);
      assert.equal(actual.meta.count, 0);
      assert.equal(actual.meta.skip, 30);
      assert.equal(actual.meta.http_status, null);
      assert.equal(actual.meta.received_at, null);
      assert.equal(actual.meta.request_url, null);
    });
    await check('Нет ошибок выполнения JavaScript', async () => assert.deepEqual(errors, []));
    console.log(`Проверено: ${checked}; пройдено: ${checked - failures.length}; ошибок: ${failures.length}`);
    assert.equal(failures.length, 0, failures.join('; '));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
