/* Общие операции: вывод текста, валидация документов и выгрузка таблиц. */
window.T9 = (() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  } [c]));
  const MISSING = Symbol('missing');

  function path(obj, p) {
    if (!/^[a-zA-Z_][\w]*(?:(?:\.[a-zA-Z_][\w]*)|(?:\[\d+\]))*$/.test(p)) throw Error(
      'Путь: имя поля, точки и индексы [0].');
    const keys = p.replace(/\[(\d+)\]/g, '.$1').split('.');
    let v = obj;
    for (const k of keys) {
      if (['__proto__', 'constructor', 'prototype'].includes(k)) throw Error('Недопустимый путь.');
      if (v === null || typeof v !== 'object' || !Object.hasOwn(v, k)) return MISSING;
      v = v[k];
    }
    return v;
  }
  const state = (o, k) => !Object.hasOwn(o, k) ? 'missing' : o[k] === null ? 'null' : 'value';

  function table(rows) {
    if (!rows.length) return '<p>Нет строк. Пустой результат тоже может быть правильным.</p>';
    const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
    return '<table><thead><tr>' + keys.map(k => '<th>' + esc(k) + '</th>').join('') +
      '</tr></thead><tbody>' + rows.slice(0, 100).map(r => '<tr>' + keys.map(k => '<td>' + esc(!Object
        .hasOwn(r, k) ? '—' : typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]) + '</td>').join(
        '') + '</tr>').join('') + '</tbody></table>';
  }

  function download(name, text, type = 'text/plain;charset=utf-8') {
    const u = URL.createObjectURL(new Blob([text], {
      type
    }));
    const a = document.createElement('a');
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  }

  function csv(rows, columns) {
    const keys = columns || Object.keys(rows[0] || {});
    const cell = v => {
      let text = String(v ?? '');
      if (typeof v === 'string' && /^[=+@\-\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    return '\uFEFF' + [keys, ...rows.map(r => keys.map(k => r[k]))].map(r => r.map(cell).join(',')).join(
      '\r\n');
  }

  function validate(input) {
    const p = Array.isArray(input) ? input : input?.products;
    if (!Array.isArray(p) || p.length === 0 || p.length > 1000) throw Error(
      'Нужен непустой массив товаров (до 1000) или ответ {products:[…]}.');
    const ids = new Set();
    for (const x of p) {
      if (!x || typeof x !== 'object' || !Number.isSafeInteger(x.id) || ids.has(x.id) || typeof x
        .title !== 'string' || typeof x.category !== 'string' || !Number.isFinite(x.price) || x.price < 0)
        throw Error(
          'Каждый товар: уникальный целый id, title и category — строки, price — неотрицательное число.'
          );
      ids.add(x.id);
      const fail = k => {
        throw Error('Товар ' + x.id + ': неверный тип ' + k);
      };
      for (const k of ['brand'])
        if (x[k] !== undefined && x[k] !== null && typeof x[k] !== 'string') fail(k);
      if (x.stock !== undefined && x.stock !== null && (!Number.isSafeInteger(x.stock) || x.stock < 0))
        fail('stock');
      if (x.tags !== undefined && x.tags !== null && (!Array.isArray(x.tags) || x.tags.some(t =>
          typeof t !== 'string'))) fail('tags');
      if (x.dimensions !== undefined && x.dimensions !== null) {
        if (typeof x.dimensions !== 'object' || Array.isArray(x.dimensions)) fail('dimensions');
        for (const v of Object.values(x.dimensions))
          if (!Number.isFinite(v)) fail('dimensions');
      }
      if (Array.isArray(x.reviews))
        for (const [i, r] of x.reviews.entries()) {
          if (!r || typeof r !== 'object' || Array.isArray(r)) fail('reviews[' + i + ']');
          for (const k of ['comment', 'date', 'reviewerName'])
            if (r[k] !== undefined && r[k] !== null && typeof r[k] !== 'string') fail('reviews[' + i +
              '].' + k);
          if (r.verified !== undefined && r.verified !== null && typeof r.verified !== 'boolean') fail(
            'reviews[' + i + '].verified');
        }
      if (x.reviews !== undefined && x.reviews !== null && (!Array.isArray(x.reviews) || x.reviews.some(
          r => !r || typeof r !== 'object' || !Number.isFinite(r.rating)))) throw Error(
        'reviews: массив объектов с числовым rating, null или отсутствующее поле.');
    }
    return structuredClone(p);
  }

  function toTables(p) {
    return {
      products: p.map(x => ({
        id: x.id,
        title: x.title,
        category: x.category,
        price: x.price,
        stock: x.stock ?? '',
        dimensions_width: x.dimensions?.width ?? '',
        brand: x.brand ?? '',
        brand_state: state(x, 'brand'),
        tags_json: JSON.stringify(x.tags ?? null),
        dimensions_json: JSON.stringify(x.dimensions ?? null)
      })),
      reviews: p.flatMap(x => (x.reviews || []).map((r, i) => ({
        product_id: x.id,
        review_index: i,
        rating: r.rating,
        comment: r.comment ?? '',
        date: r.date ?? '',
        reviewerName: r.reviewerName ?? '',
        verified: r.verified ?? '',
        verified_state: state(r, 'verified')
      })))
    };
  }
  const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  const num = n => n === null ? 'нет значений' : n.toLocaleString('ru-RU', {
    maximumFractionDigits: 2
  });
  return {
    $,
    esc,
    MISSING,
    path,
    state,
    table,
    download,
    csv,
    validate,
    toTables,
    avg,
    num
  };
})();
