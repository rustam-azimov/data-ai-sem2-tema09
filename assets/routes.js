// Уровни меняют видимость разделов, сохраняя введённые ответы и текущие данные.
'use strict';
(() => {
  const rank = {basic: 0, analysis: 1, advanced: 2};
  const route = document.getElementById('route');
  function show() {
    document.querySelectorAll('[data-level]').forEach(section => {
      section.hidden = rank[section.dataset.level] > rank[route.value];
    });
    document.getElementById('route-description').textContent = {
      basic: 'Открыты шаги 2–3: вложенные поля, пропуски и число строк после раскрытия массива.',
      analysis: 'Открыты шаги 2–4: дополнительно экспорт и связь products.id → reviews.product_id.',
      advanced: 'Открыты шаги 2–5: дополнительно проверка вывода ИИ на фактических числах.'
    }[route.value];
  }
  route.addEventListener('change', show);
  show();
})();
