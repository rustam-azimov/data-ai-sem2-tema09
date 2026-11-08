#!/usr/bin/env python3
"""Сохранить raw-вариант DummyJSON и честные метаданные источника (без зависимостей)."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def validate_response(data, count, skip):
    """Проверить оболочку API, пагинацию и последовательность исходных ID."""
    if not isinstance(data, dict) or not isinstance(data.get('products'), list):
        raise ValueError('Ожидается объект API с массивом products')
    for key in ('total', 'skip', 'limit'):
        if type(data.get(key)) is not int:
            raise ValueError(f'Метаданные {key}: ожидается целое число')
    if data['skip'] != skip or data['limit'] != count or data['total'] < skip + count:
        raise ValueError('Метаданные пагинации не соответствуют запросу')
    products = data['products']
    if len(products) != count:
        raise ValueError(f'Ожидается {count} товаров, получено {len(products)}')
    ids = []
    for product in products:
        if not isinstance(product, dict) or type(product.get('id')) is not int:
            raise ValueError('Каждый товар должен быть объектом с целочисленным id')
        ids.append(product['id'])
    if len(set(ids)) != count:
        raise ValueError('Обнаружены повторяющиеся id')
    if ids != list(range(skip + 1, skip + count + 1)):
        raise ValueError('ID или их порядок изменились: используйте сохранённый снимок курса')
    return products


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--variant', type=int, choices=(1, 2, 3), required=True)
    parser.add_argument('--output', type=Path, required=True, help='Новая или пустая папка результата')
    parser.add_argument('--snapshot', type=Path, help='Сохранённый ответ API с 30 товарами (не live)')
    args = parser.parse_args(argv)
    skip = (args.variant - 1) * 10
    url = f'https://dummyjson.com/products?limit=10&skip={skip}'
    try:
        status = None
        if args.snapshot is not None:
            body = args.snapshot.read_bytes()
            data = json.loads(body)
            all_products = validate_response(data, 30, 0)
            products = all_products[skip:skip + 10]
            source_url = 'https://dummyjson.com/products?limit=30&skip=0'
            mode = 'snapshot'
        else:
            request = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'ITMO-Lab09/1.0'})
            with urlopen(request, timeout=20) as response:
                status = response.status
                if status != 200:
                    raise ValueError(f'Ожидается HTTP 200, получен {status}')
                body = response.read()
            data = json.loads(body)
            products = validate_response(data, 10, skip)
            source_url = url
            mode = 'live'
        now = datetime.now(timezone.utc).isoformat()
        metadata = {
            'mode': mode,
            'variant': args.variant,
            'requested_url': url,
            'source_url': source_url,
            'processed_at_utc': now,
            'fetched_at_utc': now if mode == 'live' else None,
            'snapshot_path': str(args.snapshot.resolve()) if args.snapshot else None,
            'snapshot_original_fetched_at_utc': None,
            'http_status': status,
            'response_metadata': {key: data[key] for key in ('total', 'skip', 'limit')},
            'selected_count': len(products),
            'selected_ids': [p['id'] for p in products],
            'source_sha256': hashlib.sha256(body).hexdigest(),
            'note': ('Исходная дата получения снимка неизвестна; processed_at_utc — дата выбора блока.'
                     if mode == 'snapshot' else 'Ответ получен по сети в fetched_at_utc.'),
        }
        if args.output.exists() and (not args.output.is_dir() or any(args.output.iterdir())):
            raise ValueError('Папка результата должна быть новой или пустой: файлы не перезаписываются')
        args.output.mkdir(parents=True, exist_ok=True)
        # Сохраняем исходные байты отдельно: products.json содержит только выбранный массив.
        (args.output / 'api_response.json').write_bytes(body)
        for name, value in (('products.json', products), ('metadata.json', metadata)):
            (args.output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'{mode}: сохранено {len(products)} товаров в {args.output.resolve()}')
        return 0
    except (OSError, ValueError, HTTPError, URLError, TimeoutError) as exc:
        print(f'Ошибка: {exc}. Live не заменяется снимком автоматически. '
              'Для снимка явно укажите --snapshot PATH и новую папку --output.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
