'use strict';
(()=>{
 const {$,esc,path,MISSING,avg,num,table}=T9,p=TOPIC09_DATA.products;
 $('doc-select').innerHTML=p.map((x,i)=>`<option value="${i}">${esc(x.id+' · '+x.title)}</option>`).join('');
 $('doc-select').value='1';
 function doc(){$('doc-view').textContent=JSON.stringify(p[Number($('doc-select').value)],null,2);$('path-result').textContent='Найдите вложенное значение.';}
 $('doc-select').onchange=doc;$('path-run').onclick=()=>{try{const v=path(p[Number($('doc-select').value)],$('path').value.trim());$('path-result').textContent=v===MISSING?'missing: ключ или элемент отсутствует':(v===null?'null':Array.isArray(v)?'array':typeof v)+': '+JSON.stringify(v);}catch(e){$('path-result').textContent=e.message;}};
 document.querySelectorAll('.quiz button').forEach(b=>b.onclick=()=>{const box=b.closest('.quiz');box.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));const a=box.querySelector('.answer');a.className='answer '+(b.dataset.ok==='true'?'ok':'bad');a.textContent=(b.dataset.ok==='true'?'Верно. ':'Пока неверно. ')+b.dataset.explain;});
 function unit(kind){const rows=kind==='products'?p.map(x=>({id:x.id,price:x.price,reviews:x.reviews.length})):p.flatMap(x=>x.reviews.map((r,i)=>({id:x.id,price:x.price,review_index:i,rating:r.rating})));$('unwind-output').textContent=`Строк: ${rows.length}; уникальных товаров: ${new Set(rows.map(r=>r.id)).size}; средняя цена по строкам: ${num(avg(rows.map(r=>r.price)))}.`;$('unwind-table').innerHTML=table(rows);document.querySelectorAll('[data-unit]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.unit===kind)));}
 document.querySelectorAll('[data-unit]').forEach(b=>b.onclick=()=>unit(b.dataset.unit));
 const scenarios={card:'Можно вложить последние пять отзывов вместе с товаром, если они нужны при каждом чтении карточки. Полную историю хранить отдельно; продумать обновление этой копии.',history:'Отдельная коллекция reviews со ссылкой product_id: история растёт, отзывы ищутся и модерируются независимо. Нужно контролировать ссылки на товары.',report:'Считать по products: один товар — одно наблюдение. Подойдут реляционная таблица, коллекция с агрегацией или SQL с JSON. Сравните требования к связям и обновлениям.'};
 $('scenario').onchange=()=>{$('scenario-output').textContent=scenarios[$('scenario').value];};
 doc();unit('products');$('scenario').onchange();
})();
