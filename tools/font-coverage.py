"""EVE 클라이언트 리소스의 글꼴이 지원하는 유니코드 코드포인트를 뽑는다. (글꼴 파일은 읽기만 하고 복사하지 않음)
사용: python tools/font-coverage.py [EVE 설치 경로, 기본 C:/CCP/EVE]  ->  표준 출력에 요약, tools/_coverage.json 생성(커밋 안 함)
"""
import sys, json, os
from fontTools.ttLib import TTFont, TTCollection
root = sys.argv[1] if len(sys.argv) > 1 else 'C:/CCP/EVE'
index = {}
for line in open(os.path.join(root, 'tq', 'resfileindex.txt'), encoding='utf-8'):
    parts = line.strip().split(',')
    if len(parts) >= 2 and parts[0].startswith('res:/ui/fonts/'):
        index[parts[0]] = os.path.join(root, 'ResFiles', parts[1])
FONTS = ['evesansneue-regular.otf', 'evesansneue-bold.otf', 'arialuni.ttf', 'notosans-regular.ttf', 'nanumgothic.ttf']
cov = {}
for f in FONTS:
    p = index.get('res:/ui/fonts/' + f)
    if not p or not os.path.exists(p):
        print('missing', f); continue
    cmap = TTFont(p, lazy=True).getBestCmap()
    cov[f] = sorted(cmap.keys())
    print(f'{f:28s} {len(cmap):6d} codepoints')
json.dump(cov, open(os.path.join(os.path.dirname(__file__), '_coverage.json'), 'w'))
