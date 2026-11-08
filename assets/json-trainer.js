'use strict';
(() => {
  const {
    $,
    esc,
    path,
    MISSING,
    state,
    table,
    download,
    csv,
    validate,
    toTables,
    avg,
    num
  } = T9;
  let products = structuredClone(TOPIC09_DATA.products),
    source = 'Учебная выборка · 12 товаров',
    pageData = null,
    flat = [];
  const checks = {};
  function reveal(id) {
    const el = $(id), box = el.getBoundingClientRect();
    if (box.top < 24 || box.bottom > innerHeight - 24) el.scrollIntoView({block:'center',behavior:'smooth'});
  }

  $('original-total').textContent = TOPIC09_DATA.api.total;

  function showPage(data, label) {
    pageData = data;
    checks.page = false;
    $('api-status').textContent =
      `${label}. На странице: ${data.products.length}; total: ${data.total}; limit: ${data.limit}; skip: ${data.skip}.`;
    $('api-json').textContent = JSON.stringify(data, null, 2);
    $('api-search-result').textContent='';
    $('page-feedback').textContent = '';
  }

  function requestURL() {
    return `https://dummyjson.com/products?limit=${$('limit').value}&skip=${$('skip').value}`;
  }

  function snapshot() {
    const skip = Number($('skip').value),
      limit = Number($('limit').value);
    $('request-url').textContent = 'Страницы локального снимка: limit=' + limit + '&skip=' + skip +
      '\nАналогичный запрос к живому API: ' + requestURL();
    showPage({
      products: TOPIC09_DATA.api.products.slice(skip, skip + limit),
      total: 30,
      skip,
      limit
    }, 'Снимок первых 30 товаров; это отдельный учебный каталог');
  }
  $('snapshot').onclick = snapshot;
  $('live').onclick = async () => {
    const b = $('live');
    b.disabled = true;
    $('api-status').textContent = 'Запрос к DummyJSON…';
    $('request-url').textContent = requestURL();
    try {
      const r = await fetch(requestURL(), {
        signal: AbortSignal.timeout(12000)
      });
      if (!r.ok) throw Error('HTTP ' + r.status);
      const d = await r.json();
      validate(d);
      if (!Number.isSafeInteger(d.total) || !Number.isSafeInteger(d.skip) || !Number.isSafeInteger(d
          .limit)) throw Error('Неожиданная структура ответа');
      showPage(d, 'Живой API · ' + new Date().toLocaleString('ru-RU'));
    } catch (e) {
      $('api-status').textContent = 'Живой запрос не выполнен: ' + e.message +
        '. Последний успешный ответ остаётся ниже. Можно запросить снимок.';
    } finally {
      b.disabled = false;
    }
  };
  $('check-page').onclick = () => {
    const v = $('page-count').value;
    checks.page = v !== '' && Number(v) === pageData.products.length;
    $('page-feedback').innerHTML = checks.page ?
      '<span class="ok">Верно. total описывает каталог, products.length — эту страницу.</span>' :
      '<span class="bad">Посчитайте элементы products. total — не число элементов на странице.</span>';
  };

  function current() {
    return products[Number($('product-picker').value) || 0];
  }

  function documentView() {
    $('document').textContent = JSON.stringify(current(), null, 2);
    $('path-output').textContent = 'Введите путь к полю.';
    $('doc-search-result').textContent='';
  }

  function resetView() {
    flat = [];
    $('product-picker').innerHTML = products.map((p, i) =>
      `<option value="${i}">${esc(p.id+' · '+p.title)}</option>`).join('');
    documentView();
    $('dataset-label').textContent = source;
    $('flat-table').innerHTML = '';
    $('flat-stats').textContent = 'До раскрытия: ' + products.length + ' товаров.';
    $('flat-feedback').textContent = '';
    $('flat-count').value = '';
    const reviewCounts=products.map(p=>({id:p.id,reviews_count:(p.reviews||[]).length}));
    const totalReviews=reviewCounts.reduce((n,p)=>n+p.reviews_count,0);
    $('review-count-table').innerHTML=table(reviewCounts.length<100?reviewCounts.concat([{id:'Сумма',reviews_count:totalReviews}]):reviewCounts)+(reviewCounts.length>=100?`<p>Показаны первые 100 из ${reviewCounts.length} товаров. Сумма отзывов по ВСЕМ товарам: ${totalReviews}.</p>`:'');
    checks.flat = false;
    checks.ai = false;
    $('ai-feedback').textContent = 'Выберите ответ для текущего набора данных.';
    const t = toTables(products);
    $('tables-stats').textContent =
      `products: ${t.products.length} строк; reviews: ${t.reviews.length} строк. Уникальных товаров: ${new Set(t.products.map(p=>p.id)).size}. Отзывов без родительского товара: ${t.reviews.filter(r=>!t.products.some(p=>p.id===r.product_id)).length}. Средняя цена по товарам: ${num(avg(products.map(p=>p.price)))}.`;
  }
  $('product-picker').onchange = documentView;
  $('inspect').onclick = () => {
    try {
      const v = path(current(), $('json-path').value.trim());
      const type = v === MISSING ? 'missing' : v === null ? 'null' : Array.isArray(v) ? 'array' :
      typeof v;
      $('path-output').textContent =
        `Тип/состояние: ${type}. Значение: ${v===MISSING?'ключ отсутствует':JSON.stringify(v)}. ${v===MISSING?'Это не null: самого ключа или элемента нет.':''}`;
      checks.path = true;
    } catch (e) {
      $('path-output').textContent = e.message;
    }
  };

  function unfold() {
    flat = products.flatMap(p => (p.reviews || []).map((r, i) => ({
      product_id: p.id,
      title: p.title,
      price: p.price,
      review_index: i,
      rating: r.rating
    })));
    const noReviews = products.filter(p => !(p.reviews || []).length);
    $('flat-stats').textContent =
      `Строк после раскрытия: ${flat.length}. Уникальных товаров осталось: ${new Set(flat.map(r=>r.product_id)).size} из ${products.length}. Без отзывов: ${noReviews.length} — они исчезли. Средняя по товарам: ${num(avg(products.map(p=>p.price)))}; по строкам отзывов: ${num(avg(flat.map(r=>r.price)))}.`;
    $('flat-table').innerHTML = table(flat);
    reveal('flat-stats');
  }
  $('unfold').onclick = unfold;
  $('check-flat').onclick = () => {
    const expected = products.reduce((s, p) => s + (p.reviews || []).length, 0);
    checks.flat = $('flat-count').value !== '' && Number($('flat-count').value) === expected;
    $('flat-feedback').innerHTML = checks.flat ?
      '<span class="ok">Верно: по одной строке на каждый отзыв.</span>' :
      '<span class="bad">Сложите длины массивов reviews. Товар с [] даёт ноль строк.</span>';
  };
  for (const kind of ['products', 'reviews']) $('download-' + kind).onclick = () => {
    const t = toTables(products);
    download(kind + '.csv', csv(t[kind], kind === 'reviews' ? ['product_id', 'review_index', 'rating',
      'comment', 'date', 'reviewerName', 'verified', 'verified_state'
    ] : undefined), 'text/csv;charset=utf-8');
  };
  $('upload').onchange = async () => {
    const f = $('upload').files[0];
    if (!f) return;
    try {
      if (f.size > 2 * 1024 * 1024) throw Error('Файл больше 2 МБ.');
      products = validate(JSON.parse(await f.text()));
      source = 'Загруженный файл: ' + f.name;
      resetView();
      $('upload-status').textContent =
        'Файл проверен. Просмотр документов, раскрытие и скачивание таблиц теперь работают на вашем наборе.';
    } catch (e) {
      $('upload-status').textContent = 'Файл не принят: ' + e.message;
    } finally {
      $('upload').value = '';
    }
  };
  $('reset-data').onclick = () => {
    products = structuredClone(TOPIC09_DATA.products);
    source = 'Учебная выборка · 12 товаров';
    resetView();
    $('upload-status').textContent = 'Учебная выборка восстановлена.';
  };
  document.querySelectorAll('[data-answer]').forEach(b => b.onclick = () => {
    const k = b.dataset.answer,
      ok = b.dataset.correct === 'true';
    checks[k] = ok;
    $(k + '-feedback').innerHTML = ok ? '<span class="ok">Верно. ' + (k === 'missing' ?
        'null — явное значение существующего поля; missing — отсутствие ключа.' :
        `Итог для текущего набора: ${products.length} товаров и ${toTables(products).reviews.length} отзывов. При раскрытии исчезают ${products.filter(p=>!(p.reviews||[]).length).length} товаров без отзывов. Средняя цена всех товаров — ${num(avg(products.map(p=>p.price)))}; её нужно считать по products, а не по строкам отзывов.`) + '</span>' :
      '<span class="bad">Пока неверно. ' + (k === 'missing' ? 'Сравните наличие самого ключа в JSON.' :
        'Раскрытие может удалить родителей и повторить цену несколько раз.') + '</span>';
  });
  for (const id of ['check-page','inspect','check-flat']) {
    const handler = $(id).onclick;
    const output = {'check-page':'page-feedback','inspect':'path-output','check-flat':'flat-feedback'}[id];
    $(id).onclick = (...args) => { handler(...args); reveal(output); };
  }
  document.querySelectorAll('[data-answer]').forEach(button => {
    const handler=button.onclick;
    button.onclick=(...args)=>{handler(...args);reveal(button.dataset.answer+'-feedback');};
  });
  $('protocol').onclick = () => download('practice09_1.txt', 'Практика 09·1\nНабор: ' + source +
    '\nПроверки: ' + JSON.stringify(checks, null, 2) + '\nТоваров: ' + products.length + '\nОтзывов: ' +
    toTables(products).reviews.length + '\nОбъяснение: ' + $('reflection').value);
  function addSearch(prefix, viewer) {
    let previous='', index=-1, saved='';
    $(prefix+'-search-next').onclick=()=>{
      const pre=$(viewer), text=pre.textContent, term=$(prefix+'-search').value;
      if (!term) {$(prefix+'-search-result').textContent='Введите слово или ключ.';return;}
      const positions=[];let from=0;while(from<=text.length){const pos=text.toLowerCase().indexOf(term.toLowerCase(),from);if(pos<0)break;positions.push(pos);from=pos+term.length;}
      index=(term===previous&&saved===text)?(index+1)%Math.max(1,positions.length):0;previous=term;saved=text;
      if(!positions.length){pre.textContent=text;$(prefix+'-search-result').textContent='Совпадений нет: проверьте весь документ и выбранный товар.';return;}
      const at=positions[index];const mark=document.createElement('mark');mark.textContent=text.slice(at,at+term.length);pre.replaceChildren(document.createTextNode(text.slice(0,at)),mark,document.createTextNode(text.slice(at+term.length)));
      $(prefix+'-search-result').textContent=`Совпадение ${index+1} из ${positions.length}.`;
      pre.scrollTop+=mark.getBoundingClientRect().top-pre.getBoundingClientRect().top-pre.clientHeight/2;
      reveal(viewer);
    };
  }
  addSearch('api','api-json');addSearch('doc','document');
  snapshot();
  resetView();
})();
