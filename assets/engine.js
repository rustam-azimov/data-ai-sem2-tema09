/* Ограниченный учебный исполнитель JSON-запросов. Произвольный JS не исполняется. */
window.T9Engine = (() => {
  'use strict';
  const bad = new Set(['__proto__', 'constructor', 'prototype']);

  function field(p) {
    if (typeof p !== 'string' || !/^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*$/.test(p) || p.split('.').some(x =>
        bad.has(x))) throw Error('Недопустимый путь к полю. Числовые индексы здесь не поддерживаются.');
    return p;
  }

  function vals(o, p) {
    const keys = field(p).split('.');

    function walk(v, i) {
      if (i === keys.length) return [v];
      if (Array.isArray(v)) return v.flatMap(x => walk(x, i));
      if (v === null || typeof v !== 'object' || !Object.hasOwn(v, keys[i])) return [];
      return walk(v[keys[i]], i + 1);
    }
    return walk(o, 0);
  }

  function validateFilter(f, depth = 0) {
    if (depth > 8 || !f || typeof f !== 'object' || Array.isArray(f)) throw Error(
      'Фильтр должен быть JSON-объектом; глубина до 8.');
    for (const [k, c] of Object.entries(f)) {
      field(k);
      if (c && typeof c === 'object') {
        if (Array.isArray(c)) throw Error(
          'Равенство массиву не поддерживается. Используйте скаляр или $elemMatch.');
        if (!Object.keys(c).length) throw Error(
          'Равенство вложенному объекту не поддерживается. Укажите путь.');
        for (const [op, v] of Object.entries(c)) {
          if (!['$gte', '$gt', '$lt', '$lte', '$exists', '$elemMatch'].includes(op)) throw Error(
            'Не поддерживается оператор ' + op);
          if (op === '$exists' && typeof v !== 'boolean') throw Error(
          '$exists принимает true или false.');
          if (['$gte', '$gt', '$lt', '$lte'].includes(op) && !Number.isFinite(v)) throw Error(
            'В этом тренажёре сравнение принимает число.');
          if (op === '$elemMatch') validateFilter(v, depth + 1);
        }
      }
    }
  }

  function eq(v, c) {
    return Array.isArray(v) ? v.some(x => eq(x, c)) : v === c;
  }

  function match(o, f) {
    return Object.entries(f).every(([k, c]) => {
      const vs = vals(o, k);
      if (c === null) return !vs.length || vs.some(v => eq(v, null));
      if (typeof c !== 'object') return vs.some(v => eq(v, c));
      return Object.entries(c).every(([op, n]) => {
        if (op === '$exists') return (vs.length > 0) === n;
        if (op === '$elemMatch') return vs.some(v => Array.isArray(v) && v.some(x => x &&
          typeof x === 'object' && !Array.isArray(x) && match(x, n)));
        const numbers = vs.flatMap(v => Array.isArray(v) ? v : [v]).filter(v => typeof v ===
          'number');
        return numbers.some(v => op === '$gte' ? v >= n : op === '$gt' ? v > n : op === '$lt' ?
          v < n : v <= n);
      });
    });
  }

  function one(o, p) {
    let v = o;
    for (const k of field(p).split('.')) {
      if (Array.isArray(v)) throw Error('Сначала раскройте массив через $unwind.');
      if (v === null || typeof v !== 'object' || !Object.hasOwn(v, k)) return null;
      v = v[k];
    }
    if (v !== null && typeof v === 'object') throw Error(
      'Группировка и среднее требуют скалярного поля. Сначала раскройте массив через $unwind.');
    return v;
  }

  function validatePipeline(q) {
    if (!q.length || q.length > 12) throw Error('Pipeline должен содержать от 1 до 12 стадий.');
    for (const s of q) {
      if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).length !== 1) throw Error(
        'В стадии должен быть ровно один оператор.');
      const [op, v] = Object.entries(s)[0];
      if (op === '$match') validateFilter(v);
      else if (op === '$unwind') {
        if (typeof v !== 'string' || !v.startsWith('$')) throw Error('$unwind принимает "$имя_массива".');
        field(v.slice(1));
        if (v.includes('.')) throw Error('Здесь $unwind поддерживает массив верхнего уровня.');
      } else if (op === '$group') {
        if (!v || typeof v !== 'object' || Array.isArray(v) || typeof v._id !== 'string' || !v._id
          .startsWith('$')) throw Error('$group: _id должен быть "$поле".');
        field(v._id.slice(1));
        for (const [k, acc] of Object.entries(v)) {
          if (k === '_id') continue;
          if (!/^\w+$/.test(k) || bad.has(k)) throw Error('Недопустимое имя результата.');
          if (!acc || typeof acc !== 'object' || Array.isArray(acc) || Object.keys(acc).length !== 1)
            throw Error('Нужен один аккумулятор.');
          const [a, b] = Object.entries(acc)[0];
          if (a === '$sum' && b === 1) continue;
          if (a === '$avg' && typeof b === 'string' && b.startsWith('$')) {
            field(b.slice(1));
            continue;
          }
          throw Error('Поддерживаются $sum:1 и $avg:"$поле".');
        }
      } else throw Error('Не поддерживается стадия ' + op);
    }
  }

  function run(data, q) {
    if (JSON.stringify(q).length > 20000) throw Error('Запрос слишком большой.');
    if (!Array.isArray(q)) {
      validateFilter(q);
      return data.filter(o => match(o, q)).map(o => structuredClone(o));
    }
    validatePipeline(q);
    let rows = structuredClone(data);
    for (const stage of q) {
      const [op, arg] = Object.entries(stage)[0];
      if (op === '$match') rows = rows.filter(o => match(o, arg));
      if (op === '$unwind') {
        const k = arg.slice(1);
        rows = rows.flatMap(o => {
          const a = o[k];
          if (a === null || a === undefined) return [];
          if (!Array.isArray(a)) throw Error('В учебном движке $unwind работает только с массивами.');
          return a.map(v => ({
            ...o,
            [k]: v
          }));
        });
      }
      if (op === '$group') {
        const groups = new Map();
        for (const o of rows) {
          const id = one(o, arg._id.slice(1)),
            key = JSON.stringify(id);
          if (!groups.has(key)) groups.set(key, {
            id,
            rows: []
          });
          groups.get(key).rows.push(o);
        }
        rows = [...groups.values()].map(g => {
          const out = {
            _id: g.id
          };
          for (const [k, acc] of Object.entries(arg)) {
            if (k === '_id') continue;
            if (Object.hasOwn(acc, '$sum')) out[k] = g.rows.length;
            else {
              const a = g.rows.map(o => one(o, acc.$avg.slice(1))).filter(v => typeof v ===
                'number' && Number.isFinite(v));
              out[k] = a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
            }
          }
          return out;
        });
      }
    }
    return rows;
  }

  function canonical(rows) {
    const normalize = x => Array.isArray(x) ? x.map(normalize) : x && typeof x === 'object' ? Object
      .fromEntries(Object.keys(x).sort().map(k => [k, normalize(x[k])])) : typeof x === 'number' ? Math
      .round(x * 1e7) / 1e7 : x;
    return rows.map(r => JSON.stringify(normalize(r))).sort().join('\n');
  }
  return {
    run,
    canonical
  };
})();
