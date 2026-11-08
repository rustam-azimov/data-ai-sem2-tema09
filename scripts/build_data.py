"""Подготовка явно изменённой учебной выборки и трёх вариантов из исходного API."""
import copy, csv, datetime, io, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
D=ROOT/'05_ДАННЫЕ_СТУДЕНТАМ'
raw=json.loads((D/'api_response.json').read_text())
assert len(raw['products'])==30 and len({p['id'] for p in raw['products']})==30
products=[]
counts=[0,1,2,3,0,1,2,3,0,1,2,3]
for i, src in enumerate(raw['products'][:12]):
    p={k:copy.deepcopy(src[k]) for k in ['id','title','category','price','stock','tags','dimensions','reviews']}
    p['brand']=src.get('brand')
    # Разное число отзывов нужно для опыта с весами после раскрытия массива.
    p['reviews']=p['reviews'][:counts[i]]
    for j,r in enumerate(p['reviews']):
        r.pop('reviewerEmail',None)
        r['verified']=j==0
        r['rating']=5 if j==len(p['reviews'])-1 else 2
    if i%3==0: p.pop('brand',None)
    elif i%3==1: p['brand']=None
    products.append(p)
def save(name,obj): (D/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
save('products_training.json',products)
(D/'products_training.jsonl').write_text(''.join(json.dumps(p,ensure_ascii=False)+'\n' for p in products))
# Встроенные данные позволяют работать без сети и без fetch локального файла.
(ROOT/'assets/data.js').write_text('window.TOPIC09_DATA='+json.dumps({'products':products,'api':raw},ensure_ascii=False)+';\n')
for i in range(3):
    block=raw['products'][i*10:(i+1)*10]
    save(f'variant_{i+1}.json',block)
# Эталонные таблицы отдельно не публикуются: их создаёт студент в тренажёре.
print('Учебные документы:',len(products),'отзывы:',sum(len(p['reviews']) for p in products))
print('Средняя цена:',sum(p['price'] for p in products)/len(products))
print('Средняя после раскрытия:',sum(p['price']*len(p['reviews']) for p in products)/sum(len(p['reviews']) for p in products))
