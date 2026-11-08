'use strict';
(() => {
  const {
    $,
    esc,
    table,
    download
  } = T9, E = T9Engine, data = TOPIC09_DATA.products;
  const tasks = [{
    id: 1,
    title: 'Категория и цена',
    ask: 'Найдите все товары fragrances с ценой не меньше 70. Верните полные документы.',
    type: 'filter',
    solution: {
      category: 'fragrances',
      price: {
        $gte: 70
      }
    },
    hint: 'В одном объекте условия по разным полям соединяются через И.',
    explain: 'Должны остаться три товара: id 7, 8, 10. Цена 69,99 не проходит порог 70.',
    builder: 'filter'
  }, {
    id: 2,
    title: 'Вложенное поле',
    ask: 'Найдите товары с dimensions.width > 20. Верните полные документы.',
    type: 'filter',
    solution: {
      'dimensions.width': {
        $gt: 20
      }
    },
    hint: 'Поле width находится внутри dimensions: путь записывается через точку.',
    explain: 'Сравниваем число внутри вложенного объекта, а не весь объект dimensions.',
    builder: 'nested'
  }, {
    id: 3,
    title: 'null и отсутствующее поле',
    ask: 'Найдите товары, у которых brand равен null или ключ brand отсутствует. Здесь работает семантика MongoDB: {brand:null} включает оба случая.',
    type: 'filter',
    solution: {
      brand: null
    },
    hint: 'Равенство null в MongoDB также находит документы без поля.',
    explain: 'В учебной выборке 4 missing и 4 null, вместе 8 документов. Пустая строка и отсутствие ключа — разные состояния.',
    builder: 'null'
  }, {
    id: 4,
    title: 'Только отсутствующее поле',
    ask: 'Найдите товары, где самого ключа brand нет. Не включайте явный brand:null.',
    type: 'filter',
    solution: {
      brand: {
        $exists: false
      }
    },
    hint: '$exists проверяет наличие ключа, а не значение.',
    explain: '4 документа без ключа. $exists:true включил бы также документы с brand:null.',
    builder: 'exists'
  }, {
    id: 5,
    title: 'Условия в одном отзыве',
    ask: 'Найдите товары, у которых есть один и тот же отзыв с rating >= 4 и verified:true. Поле verified добавлено в учебную выборку специально для этой задачи.',
    type: 'filter',
    solution: {
      reviews: {
        $elemMatch: {
          rating: {
            $gte: 4
          },
          verified: true
        }
      }
    },
    hint: 'Два условия по путям reviews.rating и reviews.verified могут совпасть в разных элементах.',
    explain: 'Три товара с одним отзывом подходят: id 2, 6, 10. У товара с несколькими отзывами первый verified, а высокий рейтинг — у последнего: это разные элементы. Нужен $elemMatch.',
    builder: 'array'
  }, {
    id: 6,
    title: 'Сводка по категориям',
    ask: 'Получите по каждой категории _id, count (число товаров) и avg_price (средняя цена). Не раскрывайте reviews.',
    type: 'pipeline',
    solution: [{
      $group: {
        _id: '$category',
        count: {
          $sum: 1
        },
        avg_price: {
          $avg: '$price'
        }
      }
    }],
    hint: 'Одна входная строка сейчас — товар. Группируем по category.',
    explain: 'Агрегат считается по товарам. Отзывы не влияют на вес цены.',
    builder: 'group'
  }, {
    id: 7,
    title: 'Отзывы после $unwind',
    ask: 'Раскройте reviews и получите по каждому товару с отзывами _id и review_count. Товары без отзывов в этом запросе отсутствуют.',
    type: 'pipeline',
    solution: [{
      $unwind: '$reviews'
    }, {
      $group: {
        _id: '$id',
        review_count: {
          $sum: 1
        }
      }
    }],
    hint: '$unwind создаёт строку на каждый элемент массива. Затем $group по id.',
    explain: '18 отзывов распределены между 9 товарами. Три товара с [] не попадают в этот результат. Основной список товаров надо сохранять отдельно.',
    builder: 'unwind'
  }, {
    id: 8,
    title: 'Аудит запроса ИИ',
    ask: 'ИИ предлагает считать среднюю цену категорий после $unwind reviews. Исправьте pipeline: нужны _id, count и avg_price по ВСЕМ товарам, а не по отзывам.',
    type: 'pipeline',
    solution: [{
      $group: {
        _id: '$category',
        count: {
          $sum: 1
        },
        avg_price: {
          $avg: '$price'
        }
      }
    }],
    starter: [{
      $unwind: '$reviews'
    }, {
      $group: {
        _id: '$category',
        count: {
          $sum: 1
        },
        avg_price: {
          $avg: '$price'
        }
      }
    }],
    hint: 'Если вопрос о товарах, массив отзывов не нужно раскрывать.',
    explain: 'Удаление $unwind возвращает исходную единицу наблюдения и одинаковый вес каждому товару.',
    builder: 'ai'
  }, {
    id: 9,
    title: 'Выбор модели хранения',
    model: true,
    ask: 'У каталога две задачи. А: показывать карточку с последними пятью отзывами. Б: хранить всю постоянно растущую историю отзывов и независимо модерировать их. Какую структуру предложите?',
    choices: ['В обоих случаях всегда вкладывать всю историю в товар',
      'Для А можно вложить ограниченный набор последних отзывов; для Б — отдельная коллекция reviews со ссылкой product_id',
      'Во всех случаях хранить JSON как одну строку CSV'
    ],
    answer: 1,
    explain: 'Выбор зависит от чтения, обновлений и роста данных. Ограниченное вложение удобно для карточки; неограниченная история и независимая модерация — доводы за отдельную коллекцию. SQL тоже может хранить JSON; NoSQL не означает отсутствие схемы или проверок.'
  }];
  let current = 0,
    mode = 'builder',
    lastQuery = null;
  const drafts = new Map(),
    builderValues = new Map();

  function remember() {
    if (!tasks[current].model) {
      if (mode === 'code' || drafts.has(current)) drafts.set(current, $('query').value);
      builderValues.set(current, [...document.querySelectorAll('#builder input,#builder select')].map(e => [
        e.id, e.value
      ]));
    }
  }
  const KEY = 'topic09-documents-v1';
  let progress = {};
  try {
    progress = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (!progress || typeof progress !== 'object' || Array.isArray(progress)) progress = {};
  } catch {};
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(progress));
    } catch {}
    updateProgress();
  };

  function updateProgress() {
    $('progress').textContent =
      `Решено ${tasks.filter(t=>progress[t.id]?.passed).length} из ${tasks.length}. Прогресс хранится только в этом браузере.`;
    document.querySelectorAll('#tasks button').forEach((b, i) => {
      b.classList.toggle('active', i === current);
      b.textContent = (progress[tasks[i].id]?.passed ? '✓ ' : '') + tasks[i].id + '. ' + tasks[i].title;
    });
  }

  function opts(values) {
    return values.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  }

  function builder(t) {
    if (t.model) return '';
    if (t.builder === 'filter') return '<label>Категория <select id="b-category">' + opts([
        ['beauty', 'beauty'],
        ['fragrances', 'fragrances'],
        ['furniture', 'furniture']
      ]) +
      '</select></label><label>Минимальная цена <input id="b-price" type="number" value="20" min="0" step="0.01"></label>';
    if (t.builder === 'nested') return '<label>Путь <select id="b-path">' + opts([
        ['dimensions.height', 'dimensions.height'],
        ['dimensions.width', 'dimensions.width']
      ]) +
      '</select></label><label>Строго больше <input id="b-threshold" type="number" value="10"></label>';
    if (t.builder === 'null') return '<label>Условие <select id="b-null">' + opts([
      ['empty', 'brand равен пустой строке'],
      ['null', 'brand: null'],
      ['missing', 'brand: {$exists:false}']
    ]) + '</select></label>';
    if (t.builder === 'exists') return '<label>Ключ brand <select id="b-exists">' + opts([
      ['true', 'есть'],
      ['false', 'отсутствует']
    ]) + '</select></label>';
    if (t.builder === 'array') return '<label>Как связать условия? <select id="b-array">' + opts([
      ['separate', 'два условия по путям (возможно, разные отзывы)'],
      ['elem', 'оба условия в одном элементе ($elemMatch)']
    ]) + '</select></label>';
    if (t.builder === 'group' || t.builder === 'ai')
    return '<label>Раскрывать reviews перед группировкой? <select id="b-unwind">' + opts([
        ['yes', 'да'],
        ['no', 'нет']
      ]) + '</select></label>';
    return '<label>Первый шаг <select id="b-first">' + opts([
      ['none', 'сразу группировать товары'],
      ['unwind', 'раскрыть reviews']
    ]) + '</select></label>';
  }

  function fromBuilder() {
    const t = tasks[current];
    switch (t.builder) {
      case 'filter':
        return {
          category: $('b-category').value, price: {
            $gte: Number($('b-price').value)
          }
        };
      case 'nested':
        return {
          [$('b-path').value]: {
            $gt: Number($('b-threshold').value)
          }
        };
      case 'null':
        return $('b-null').value === 'null' ? {
          brand: null
        } : $('b-null').value === 'missing' ? {
          brand: {
            $exists: false
          }
        } : {
          brand: ''
        };
      case 'exists':
        return {
          brand: {
            $exists: $('b-exists').value === 'true'
          }
        };
      case 'array':
        return $('b-array').value === 'elem' ? {
          reviews: {
            $elemMatch: {
              rating: {
                $gte: 4
              },
              verified: true
            }
          }
        } : {
          'reviews.rating': {
            $gte: 4
          },
          'reviews.verified': true
        };
      case 'group':
      case 'ai':
        return [...($('b-unwind').value === 'yes' ? [{
          $unwind: '$reviews'
        }] : []), {
          $group: {
            _id: '$category',
            count: {
              $sum: 1
            },
            avg_price: {
              $avg: '$price'
            }
          }
        }];
      case 'unwind':
        return [...($('b-first').value === 'unwind' ? [{
          $unwind: '$reviews'
        }] : []), {
          $group: {
            _id: '$id',
            review_count: {
              $sum: 1
            }
          }
        }];
    }
  }

  function mongo(q) {
    return 'db.collection.' + (Array.isArray(q) ? 'aggregate' : 'find') + '(' + JSON.stringify(q, null, 2) +
      ')';
  }

  function show() {
    const t = tasks[current];
    lastQuery = null;
    $('task').innerHTML = '<div class="exercise-label">Задание ' + t.id + ' из ' + tasks.length +
      '</div><h2>' + esc(t.title) + '</h2><p>' + esc(t.ask) + '</p>';
    $('feedback').textContent = 'Сначала попробуйте решить самостоятельно.';
    $('result').innerHTML = '';
    $('result-count').textContent = '';
    $('builder').innerHTML = builder(t);
    $('query').value = drafts.get(current) ?? JSON.stringify(t.starter || (t.type === 'pipeline' ? [] : {}),
      null, 2);
    for (const [id, v] of builderValues.get(current) || [])
      if ($(id)) $(id).value = v;
    $('mongo-query').textContent = 'Выполните запрос, чтобы увидеть его запись для MongoDB.';
    for (const id of ['mode-builder', 'mode-code', 'run', 'check', 'hint', 'solution']) $(id).hidden = !!t
      .model;
    $('code-panel').hidden = t.model || mode !== 'code';
    $('builder').hidden = t.model || mode !== 'builder';
    if (t.model) {
      $('builder').hidden = false;
      $('builder').innerHTML = '<fieldset><legend>Выберите структуру</legend>' + t.choices.map((s, i) =>
        `<button data-model="${i}">${esc(s)}</button>`).join('') + '</fieldset>';
      document.querySelectorAll('[data-model]').forEach(b => b.onclick = () => {
        const ok = Number(b.dataset.model) === t.answer;
        record(ok);
        $('feedback').innerHTML =
          `<span class="${ok?'ok':'bad'}">${ok?'Верно. ':'Пока неверно. '}${esc(t.explain)}</span>`;
      });
    }
    updateProgress();
  }

  function record(ok) {
    const id = tasks[current].id;
    const p = progress[id] || {
      attempts: 0,
      passed: false
    };
    p.attempts++;
    p.passed = p.passed || ok;
    progress[id] = p;
    save();
  }

  function perform(check) {
    try {
      const t = tasks[current],
        q = mode === 'builder' ? fromBuilder() : JSON.parse($('query').value);
      if ((t.type === 'pipeline') !== Array.isArray(q)) throw Error(t.type === 'pipeline' ?
        'Для этого задания нужен массив стадий pipeline.' : 'Для этого задания нужен объект фильтра.');
      const rows = E.run(data, q);
      lastQuery = q;
      $('result').innerHTML = table(rows);
      $('result-count').textContent =
        `Результат: ${rows.length} ${t.type==='pipeline'?'строк':'документов'}.`;
      $('mongo-query').textContent = mongo(q);
      if (check) {
        const expected = E.run(data, t.solution),
          ok = E.canonical(rows) === E.canonical(expected);
        record(ok);
        $('feedback').innerHTML =
          `<span class="${ok?'ok':'bad'}">${ok?'Верно: результат совпадает с ожидаемым.':'Результат пока отличается. Проверьте условия, единицу наблюдения и названия полей.'}</span>`;
      } else $('feedback').textContent = 'Запрос выполнен. Для оценки решения нажмите «Проверить решение».';
    } catch (e) {
      $('feedback').textContent = 'Запрос не выполнен: ' + e.message;
      $('result-count').textContent = '';
      $('result').innerHTML = '';
      lastQuery = null;
      $('mongo-query').textContent = 'Исправьте запрос.';
    }
  }
  $('tasks').innerHTML = '<h2>Задания</h2>' + tasks.map((t, i) =>
    `<button data-task="${i}">${t.id}. ${esc(t.title)}</button>`).join('');
  document.querySelectorAll('[data-task]').forEach(b => b.onclick = () => {
    remember();
    current = Number(b.dataset.task);
    show();
  });
  $('mode-builder').onclick = () => {
    drafts.set(current, $('query').value);
    mode = 'builder';
    $('builder').hidden = false;
    $('code-panel').hidden = true;
    $('mode-builder').setAttribute('aria-pressed', 'true');
    $('mode-code').setAttribute('aria-pressed', 'false');
  };
  $('mode-code').onclick = () => {
    if (mode === 'builder' && !drafts.has(current)) $('query').value = JSON.stringify(fromBuilder(), null,
      2);
    mode = 'code';
    drafts.set(current, $('query').value);
    $('builder').hidden = true;
    $('code-panel').hidden = false;
    $('mode-builder').setAttribute('aria-pressed', 'false');
    $('mode-code').setAttribute('aria-pressed', 'true');
  };
  $('query').oninput = () => drafts.set(current, $('query').value);
  $('run').onclick = () => perform(false);
  $('check').onclick = () => perform(true);
  $('hint').onclick = () => {
    $('feedback').textContent = tasks[current].hint;
  };
  $('solution').onclick = () => {
    const t = tasks[current];
    mode = 'code';
    $('builder').hidden = true;
    $('code-panel').hidden = false;
    $('mode-builder').setAttribute('aria-pressed', 'false');
    $('mode-code').setAttribute('aria-pressed', 'true');
    $('query').value = JSON.stringify(t.solution, null, 2);
    drafts.set(current, $('query').value);
    perform(false);
    $('feedback').textContent = t.explain +
      ' Разбор показан; отметка о решении появится только после проверки.';
    progress[t.id] = {
      ...(progress[t.id] || {}),
      viewedSolution: true
    };
    save();
  };
  $('download-query').onclick = () => {
    if (lastQuery === null) {
      $('feedback').textContent = 'Сначала выполните корректный запрос.';
      return;
    }
    download('query09_' + tasks[current].id + '.js',
      '// Данные: products_training.json, учебная выборка, 12 товаров.\n' + mongo(lastQuery) + ';\n');
  };
  $('download-progress').onclick = () => download('practice09_2.txt',
    'Практика 09·2\nУчебная выборка: 12 товаров\n' + tasks.map(t =>
      `${t.id}. ${t.title}: ${progress[t.id]?.passed?'решено':'не решено'}; попыток ${progress[t.id]?.attempts||0}; разбор ${progress[t.id]?.viewedSolution?'просмотрен':'не просмотрен'}`
      ).join('\n'));
  $('reset-progress').onclick = () => {
    if (confirm('Сбросить прогресс тренажёра 09·2?')) {
      progress = {};
      save();
    }
  };
  window.TOPIC09_TASKS = tasks;
  show();
  document.addEventListener('click', event => {
    const button=event.target.closest('button');
    if (!button || !( ['run','check','hint','solution'].includes(button.id) || button.hasAttribute('data-model'))) return;
    const output=$('feedback'), rect=output.getBoundingClientRect();
    if(rect.top<24 || rect.bottom>innerHeight-24) output.scrollIntoView({block:'center',behavior:'smooth'});
  });
})();
