"""게임 오버뷰 설정의 "NPC" 항목을 만든다: public/data/npc-groups.json

게임의 유형 목록에서 NPC 는 실제 그룹이 아니라 "여러 그룹을 묶은 가상 그룹" 6개(해적, 미션, 경찰, CONCORD, 세관, 팩션 해군)다.
항목을 누르면 묶여 있는 그룹 ID 가 모두 프리셋에 들어가고, 묶음 중 하나라도 들어 있으면 체크된 것으로 보인다.
이 묶음 정의는 클라이언트 코드(carbonui 가 아닌 eve/client/script/parklife/state.py 의 GetNPCGroups)에 하드코딩되어 있으므로,
설치된 EVE 클라이언트의 code.ccp(압축된 Python 2.7 바이트코드)를 읽기만 해서 꺼내고, 이름은 클라이언트의 현지화 파일에서 가져온다.
(클라이언트 파일은 읽기만 하며 복사하지 않는다. 결과는 그룹 ID 와 짧은 이름뿐이다.)

사용: python tools/build-npc-groups.py [EVE 설치 경로, 기본 C:/CCP/EVE]
필요: pip install xdis
"""
import io
import json
import os
import pickle
import re
import sys
import zipfile
import zlib

from xdis import Bytecode, get_opcode
from xdis.load import load_module

ROOT = sys.argv[1] if len(sys.argv) > 1 else 'C:/CCP/EVE'
TMP = os.path.join(os.environ.get('TEMP', '.'), '_npc_tmp.pyc')
LANGS = {'en': 'en-us', 'ko': 'ko', 'ja': 'ja', 'ru': 'ru', 'zh': 'zh'}
ORDER = ['Pirate', 'Mission', 'Police', 'Concord', 'Customs', 'FactionNavy']   # 코드에 나오는 순서
LABEL = 'UI/Services/State/NonPlayerCharacter/'

zf = zipfile.ZipFile(os.path.join(ROOT, 'tq', 'code.ccp'))


def code_of(name):
    """code.ccp 안의 모듈을 바이트코드 객체로 읽는다."""
    with open(TMP, 'wb') as f:
        f.write(zlib.decompress(zf.read(name)))
    res = load_module(TMP)
    return res[0], res[3]


def instructions(version, code):
    return list(Bytecode(code, get_opcode(version, False)).get_instructions(code))


# 1) GetNPCGroups(): 라벨 -> invConst.groupXxx 이름 목록
version, mod = code_of('eve/client/script/parklife/state.pyj')
func = next(c for c in mod.co_consts if hasattr(c, 'co_code') and c.co_name == 'GetNPCGroups')
members, names = {}, []
for ins in instructions(version, func):
    m = re.match(r'group\w+$', ins.argrepr or '')
    if ins.opname == 'LOAD_ATTR' and m:
        names.append(ins.argrepr)
    elif ins.opname == 'LOAD_CONST' and isinstance(ins.argrepr, str) and ins.argrepr.strip('"').startswith(LABEL):
        key = ins.argrepr.strip('"')[len(LABEL):]
        if names:
            members[key] = names
            names = []
assert set(ORDER) <= set(members), f'unexpected NPC groups: {sorted(members)}'

# 2) invConst.groupXxx -> 그룹 ID
version, mod = code_of('inventorycommon/const.pyj')
value, prev = {}, None
for ins in instructions(version, mod):
    if ins.opname == 'LOAD_CONST':
        prev = ins.argrepr
    elif ins.opname == 'STORE_NAME' and ins.argrepr.startswith('group') and str(prev).lstrip('-').isdigit():
        value[ins.argrepr] = int(prev)
ids = {k: sorted({value[n] for n in members[k]}) for k in ORDER}

# 3) 이름 (현지화 파일)
index = {}
for line in open(os.path.join(ROOT, 'tq', 'resfileindex.txt'), encoding='utf-8'):
    parts = line.strip().split(',')
    if len(parts) >= 2 and parts[0].startswith('res:/localizationfsd/'):
        index[parts[0].rsplit('/', 1)[1]] = parts[1]


def load_pickle(fn):
    # 주의: pickle 은 믿을 수 없는 파일에 쓰면 위험하다. 여기서 읽는 것은 사용자가 직접 설치한 EVE 클라이언트의
    # 현지화 파일(ResFiles)뿐이며, 게임이 같은 파일을 그대로 불러 쓴다. 다른 출처의 파일에는 이 도구를 쓰지 말 것.
    with open(os.path.join(ROOT, 'ResFiles', index[fn]), 'rb') as f:
        return pickle.load(f, encoding='utf-8')


main = load_pickle('localization_fsd_main.pickle')
message_of = {f"{e['FullPath']}/{e['label']}": mid for mid, e in main['labels'].items()}
texts = {lang: load_pickle(f'localization_fsd_{code}.pickle')[1] for lang, code in LANGS.items()}


def name(label):
    out = {}
    for lang, table in texts.items():
        v = table.get(message_of[LABEL + label])
        out[lang] = v[0] if isinstance(v, tuple) else v
    return out


result = {
    'source': 'EVE client: GetNPCGroups() in eve/client/script/parklife/state.py and the client localization (read only)',
    'category': name('Generic'),
    'groups': [{'key': k, 'names': name(k), 'ids': ids[k]} for k in ORDER],
}
out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'data', 'npc-groups.json')
with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(result, f, ensure_ascii=False, separators=(',', ':'))
    f.write('\n')
print('saved', {g['key']: len(g['ids']) for g in result['groups']}, 'total', len({i for g in result['groups'] for i in g['ids']}))
try:
    os.remove(TMP)
except OSError:
    pass
