/* Независимые проверки чисел, пограничных случаев и запрета неподдерживаемых операций. */
const fs = require('fs'),
  path = require('path'),
  vm = require('vm'),
  assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const ctx = {
  window: {},
  structuredClone,
  console
};
vm.createContext(ctx);
for (const f of ['data.js', 'common.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(root,
  'assets', f), 'utf8'), ctx);
const D = JSON.parse(JSON.stringify(ctx.window.TOPIC09_DATA)),
  E = ctx.window.T9Engine,
  T = ctx.window.T9;
const rows = D.products,
  run = q => JSON.parse(JSON.stringify(E.run(rows, q))),
  ids = r => Array.from(r, x => x.id).sort((a, b) => a - b);
assert.equal(rows.length, 12);
assert.equal(rows.reduce((n, p) => n + p.reviews.length, 0), 18);
assert.equal(rows.filter(p => p.reviews.length === 0).length, 3);
assert.equal(T.avg(rows.map(p => p.price)).toFixed(2), '407.24');
assert.equal(T.avg(rows.flatMap(p => p.reviews.map(() => p.price))).toFixed(2), '669.38');
assert.deepEqual(ids(run({
  category: 'fragrances',
  price: {
    $gte: 70
  }
})), [7, 8, 10]);
assert.deepEqual(ids(run({
  'dimensions.width': {
    $gt: 20
  }
})), rows.filter(p => p.dimensions.width > 20).map(p => p.id));
assert.equal(run({
  brand: null
}).length, 8);
assert.equal(run({
  brand: {
    $exists: false
  }
}).length, 4);
assert.equal(run({
  brand: {
    $exists: true
  }
}).length, 8);
assert.deepEqual(ids(run({
  reviews: {
    $elemMatch: {
      rating: {
        $gte: 4
      },
      verified: true
    }
  }
})), [2, 6, 10]);
assert.equal(run({
  'reviews.rating': {
    $gte: 4
  },
  'reviews.verified': true
}).length, 9);
const agg = run([{
  $group: {
    _id: '$category',
    count: {
      $sum: 1
    },
    avg_price: {
      $avg: '$price'
    }
  }
}]);
for (const a of agg) {
  const p = rows.filter(p => p.category === a._id);
  assert.equal(a.count, p.length);
  assert.ok(Math.abs(a.avg_price - p.reduce((s, p) => s + p.price, 0) / p.length) < 1e-9);
}
const unw = run([{
  $unwind: '$reviews'
}, {
  $group: {
    _id: '$id',
    review_count: {
      $sum: 1
    }
  }
}]);
assert.equal(unw.length, 9);
assert.equal(unw.reduce((s, r) => s + r.review_count, 0), 18);
const f = [{
  id: 1,
  x: null,
  a: [{
    x: 1,
    y: 0
  }, {
    x: 0,
    y: 2
  }]
}, {
  id: 2,
  x: 0,
  a: []
}, {
  id: 3,
  x: false
}, {
  id: 4,
  x: ''
}, {
  id: 5
}];
assert.deepEqual(ids(E.run(f, {
  x: null
})), [1, 5]);
assert.deepEqual(ids(E.run(f, {
  x: {
    $exists: false
  }
})), [5]);
assert.equal(E.run(f, {
  'a.x': 1,
  'a.y': 2
}).length, 1);
assert.equal(E.run(f, {
  a: {
    $elemMatch: {
      x: 1,
      y: 2
    }
  }
}).length, 0);
assert.equal(E.run([{
  a: []
}, {
  a: null
}, {}], [{
  $unwind: '$a'
}]).length, 0);
assert.throws(() => E.run(rows, {
  price: {
    $where: 'true'
  }
}));
assert.throws(() => E.run(rows, [{
  $sort: {
    price: 1
  }
}]));
assert.throws(() => E.run(rows, [{
  $group: {
    _id: '$id',
    x: {
      $sum: '$price'
    }
  }
}]));
assert.throws(() => E.run([], {
  'x': {
    $bogus: 1
  }
}));
assert.throws(() => E.run(rows, JSON.parse('{"__proto__":1}')));
assert.throws(() => T.path({}, 'constructor.prototype'));
assert.equal(T.path({
  x: 0
}, 'x'), 0);
assert.equal(T.path({
  x: false
}, 'x'), false);
assert.equal(T.path({
  x: null
}, 'x'), null);
assert.equal(T.path({}, 'x'), T.MISSING);
assert.throws(() => T.validate([{
  id: 1,
  title: 'x',
  category: 'c',
  price: 0
}, {
  id: 1,
  title: 'x',
  category: 'c',
  price: 0
}]));
const tables = T.toTables(rows);
assert.equal(tables.products.length, 12);
assert.equal(tables.reviews.length, 18);
assert.ok(tables.reviews.every(r => tables.products.some(p => p.id === r.product_id)));
assert.ok(T.csv([{
  text: '=1+1'
}]).includes("'=1+1"));
assert.ok(T.csv([{
  text: 'a,"b"\nc'
}]).includes('a,""b""\nc'));
assert.ok(T.csv([{
  n: -5
}]).includes('-5'));
for (let i = 1; i <= 3; i++) {
  const variant = JSON.parse(fs.readFileSync(path.join(root, '05_ДАННЫЕ_СТУДЕНТАМ', `variant_${i}.json`)));
  assert.deepEqual(variant, D.api.products.slice((i - 1) * 10, i * 10));
  const t = T.toTables(variant);
  assert.equal(t.products.length, 10);
  assert.equal(t.reviews.length, variant.reduce((n, p) => n + p.reviews.length, 0));
}
console.log('Данные, числовые эталоны, массивы, null/missing, валидация и CSV: OK');

assert.throws(() => E.run(rows, {
  'reviews.0.rating': 5
}));
assert.throws(() => E.run(rows, [{
  $match: {
    id: 2
  }
}, {
  $group: {
    _id: '$reviews.rating',
    n: {
      $sum: 1
    }
  }
}]));
assert.throws(() => T.validate([{
  id: 1,
  title: 'x',
  category: 'c',
  price: 1,
  brand: {
    x: 1
  }
}]));
assert.throws(() => T.validate([{
  id: 1,
  title: 'x',
  category: 'c',
  price: 1,
  reviews: [{
    rating: 5,
    reviewerName: {
      name: 'x'
    }
  }]
}]));
assert.equal(T.toTables(rows).products[0].dimensions_width, rows[0].dimensions.width);
