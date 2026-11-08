/* Проверка пользовательских действий, загрузки файлов, экспорта, ссылок и мобильного экрана. */
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict');
const {
  chromium
} = require(process.env.PLAYWRIGHT_MODULE || process.env.HOME +
  '/.npm/_npx/9833c18b2d85bc59/node_modules/playwright');
const root = path.resolve(__dirname, '..'),
  base = process.argv[2] || 'http://localhost:8009';
(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true
  });
  const page = await browser.newPage({
    viewport: {
      width: 1280,
      height: 900
    },
    acceptDownloads: true
  });
  let assertions = 0;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => {
    if (r.status() >= 400 && new URL(r.url()).origin === new URL(base).origin) errors.push(r
    .status() + ' ' + r.url());
  });
  const check = (x, msg) => {
    assert.ok(x, msg);
    assertions++;
  };
  const text = id => page.locator('#' + id).innerText();
  const pages = ['index.html', 'read/09.html', '09_ПРЕЗЕНТАЦИИ/Тема_09.html',
    '03_ЛАБОРАТОРНЫЕ/ЛР_09.html', '04_ИНТЕРАКТИВЫ/Тренажер_09_JSON.html',
    '04_ИНТЕРАКТИВЫ/Тренажер_09_документы.html'
  ];
  for (const pg of pages) {
    await page.goto(base + '/' + encodeURI(pg));
    for (const href of await page.locator('a[href]').evaluateAll(es => es.map(e => e.getAttribute(
        'href')))) {
      if (/^(https?:|mailto:)/.test(href)) continue;
      const [file, anchor] = href.split('#');
      const target = path.resolve(root, path.dirname(pg), decodeURI(file || path.basename(pg)));
      check(fs.existsSync(target), 'Missing ' + pg + ' -> ' + href);
      if (anchor) check(fs.readFileSync(target, 'utf8').includes('id="' + anchor + '"'),
        'Missing anchor ' + href);
    }
    await page.setViewportSize({
      width: 390,
      height: 844
    });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Overflow ' +
      pg);
    await page.setViewportSize({
      width: 1280,
      height: 900
    });
  }
  await page.goto(base + '/' + encodeURI(pages[4]));
  check((await text('api-status')).includes('На странице: 10'), 'snapshot page');
  await page.fill('#page-count', '194');
  await page.click('#check-page');
  check((await text('page-feedback')).includes('Посчитайте'), 'total confusion');
  await page.fill('#page-count', '10');
  await page.click('#check-page');
  check((await text('page-feedback')).includes('Верно'), 'page check');
  await page.selectOption('#skip', '30');
  await page.click('#snapshot');
  await page.fill('#page-count', '0');
  await page.click('#check-page');
  check((await text('page-feedback')).includes('Верно'), 'empty page');
  await page.fill('#json-path', 'brand');
  await page.click('#inspect');
  check((await text('path-output')).includes('missing'), 'missing');
  await page.selectOption('#product-picker', '1');
  await page.click('#inspect');
  check((await text('path-output')).includes('null'), 'null');
  await page.fill('#json-path', 'reviews[0].rating');
  await page.click('#inspect');
  check((await text('path-output')).includes('5'), 'array path');
  await page.fill('#json-path', 'constructor.prototype');
  await page.click('#inspect');
  check((await text('path-output')).includes('Недопустимый'), 'unsafe path');
  await page.fill('#flat-count', '18');
  await page.click('#check-flat');
  check((await text('flat-feedback')).includes('Верно'), 'unfold count');
  await page.click('#unfold');
  check((await text('flat-stats')).includes('669,38'), 'biased mean');
  check((await text('flat-stats')).includes('9 из 12'), 'lost parents');
  await page.click('[data-answer="missing"][data-correct="false"]');
  check((await text('missing-feedback')).includes('Пока неверно'), 'wrong choice');
  await page.click('[data-answer="missing"][data-correct="true"]');
  await page.click('[data-answer="ai"][data-correct="true"]');
  check((await text('ai-feedback')).includes('Верно'), 'AI check');
  const dlPromise = page.waitForEvent('download');
  await page.click('#download-products');
  const dl = await dlPromise;
  const contents = fs.readFileSync(await dl.path(), 'utf8');
  check(contents.includes('brand_state'), 'CSV fields');
  check(contents.split('\r\n').length === 13, 'CSV rows');
  await page.setInputFiles('#upload', path.join(root, '05_ДАННЫЕ_СТУДЕНТАМ/variant_2.json'));
  check((await text('tables-stats')).includes('products: 10 строк; reviews: 30'), 'upload variant');
  await page.setInputFiles('#upload', {
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('[{"id":1}]')
  });
  check((await text('upload-status')).includes('Файл не принят'), 'reject upload');
  check((await text('tables-stats')).includes('products: 10'), 'preserve valid upload');
  await page.click('#reset-data');
  check((await text('tables-stats')).includes('products: 12'), 'reset data');
  await page.goto(base + '/' + encodeURI(pages[5]));
  for (let i = 0; i < 8; i++) {
    await page.click(`[data-task="${i}"]`);
    await page.click('#mode-code');
    await page.fill('#query', i === 0 ? '{"price":{"$where":"true"}}' : i >= 5 ? '[]' : '{}');
    await page.click('#check');
    check(!(await text('feedback')).includes('Верно: результат'), 'wrong task ' + i);
    const sol = await page.evaluate(i => JSON.stringify(window.TOPIC09_TASKS[i].solution), i);
    await page.fill('#query', sol);
    await page.click('#check');
    check((await text('feedback')).includes('Верно: результат'), 'correct task ' + i);
  }
  await page.click('[data-task="0"]');
  await page.click('#mode-code');
  const custom = '{"price":{"$gte":100}}';
  await page.fill('#query', custom);
  await page.click('#mode-builder');
  await page.click('#mode-code');
  check(await page.inputValue('#query') === custom, 'keep code after mode switch');
  await page.click('[data-task="1"]');
  await page.click('[data-task="0"]');
  check(await page.inputValue('#query') === custom, 'keep draft after task switch');
  await page.click('[data-task="8"]');
  await page.click('[data-model="0"]');
  check((await text('feedback')).includes('Пока неверно'), 'model wrong');
  await page.click('[data-model="1"]');
  check((await text('progress')).includes('9 из 9'), 'model right');
  await page.reload();
  check((await text('progress')).includes('9 из 9'), 'saved progress');
  await page.click('[data-task="4"]');
  await page.click('#mode-builder');
  await page.selectOption('#b-array', 'separate');
  await page.click('#check');
  check(!(await text('feedback')).includes('Верно: результат'), 'separate elements wrong');
  await page.selectOption('#b-array', 'elem');
  await page.click('#check');
  check((await text('feedback')).includes('Верно: результат'), 'builder elemMatch');
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'mobile after result');
  await page.goto(base + '/' + encodeURI(pages[3]));
  for (const [isu, n] of [
      ['123456', 1],
      ['123457', 2],
      ['123458', 3]
    ]) {
    await page.fill('#isu', isu);
    await page.click('#variant-form button');
    check((await text('variant-result')).includes('Ваш вариант: ' + n), 'variant ' + n);
  }
  check(errors.length === 0, 'Browser errors ' + JSON.stringify(errors));
  if (process.env.SCREENSHOTS) {
    fs.mkdirSync(process.env.SCREENSHOTS, {
      recursive: true
    });
    for (const [i, name] of [
        [0, 'index'],
        [4, 'json'],
        [5, 'documents'],
        [3, 'lab']
      ]) {
      await page.setViewportSize({
        width: 1280,
        height: 900
      });
      await page.goto(base + '/' + encodeURI(pages[i]));
      await page.screenshot({
        path: path.join(process.env.SCREENSHOTS, name + '.png'),
        fullPage: true
      });
    }
  }
  await browser.close();
  console.log('Браузер: ' + assertions + ' проверок пройдено. Ошибок JS/загрузки: 0.');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
