"""Проверка трёх вариантов, отказа от перезаписи и ошибок входа без сети."""
import importlib.util, json, subprocess, sys, tempfile
from pathlib import Path
R=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('download_api', R/'scripts/download_api.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
raw=json.loads((R/'05_ДАННЫЕ_СТУДЕНТАМ/api_response.json').read_text())
assert len(m.validate_response(raw,30,0))==30
for field in ['total','limit','skip']:
    bad={**raw,field:'30'}
    try: m.validate_response(bad,30,0)
    except ValueError: pass
    else: raise AssertionError(field)
with tempfile.TemporaryDirectory() as td:
    for i in range(1,4):
        out=Path(td)/str(i)
        cmd=[sys.executable,str(R/'scripts/download_api.py'),'--variant',str(i),'--snapshot',str(R/'05_ДАННЫЕ_СТУДЕНТАМ/api_response.json'),'--output',str(out)]
        assert subprocess.run(cmd,capture_output=True).returncode==0
        p=json.loads((out/'products.json').read_text());meta=json.loads((out/'metadata.json').read_text())
        assert p==raw['products'][(i-1)*10:i*10]
        assert meta['mode']=='snapshot' and meta['http_status'] is None and meta['fetched_at_utc'] is None
        assert subprocess.run(cmd,capture_output=True).returncode!=0
print('Загрузчик: три snapshot-варианта, метаданные, типы пагинации и запрет перезаписи: OK')
