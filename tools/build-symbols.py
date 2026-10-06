"""선택창에 넣을 특수문자 목록을 만든다: 후보 중 EVE 클라이언트 글꼴(EVE Sans Neue + Arial Unicode)에
글리프가 실제로 있는 문자만 public/js/symbols.js 로 내보낸다.
먼저 `python tools/font-coverage.py` 로 tools/_coverage.json 을 만들어 둘 것.
"""
import json
import os

here = os.path.dirname(os.path.abspath(__file__))
cov = json.load(open(os.path.join(here, '_coverage.json')))
OK = set(cov['evesansneue-regular.otf']) | set(cov['arialuni.ttf'])


def rng(a, b):
    return ''.join(chr(c) for c in range(ord(a), ord(b) + 1))


GROUPS = [
    ('shapes', '도형', '■□▪▫▬▮▲△▴▵▶▷►▸▼▽▾▿◀◁◄◂◆◇◈●○◉◎◌◍◐◑◒◓◔◕◖◗◘◙◢◣◤◥◊▰▱▀▄█▌▐▍▎▏░▒▓▨▩▦▧▤▥▣▢'),
    ('stars', '별 · 장식', '★☆✦✧✩✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❄❅❆❇❈❉❊❋✢✣✤✥❖⁂※☸☯☮☼☀☁☂☃☄☾☽♨✇〄'),
    ('arrows', '화살표', '←↑→↓↔↕↖↗↘↙↩↪↶↷⇐⇑⇒⇓⇔⇕⇦⇧⇨⇩➔➘➙➚➛➜➝➞➟➠➡➢➣➤➥➦➧➨➩➪➫➬➭➮➯➱➲➳➵➸➺➻➼➽☜☝☞☟'),
    ('combat', '전투 · 경고', '☠☢☣⚔⚡✖✘✔✓✗☑☒☐✚✜✛✝☦✞✟✠☥✡☪☫☬☭☹☺☻✌✍❤❥♨⌛⌚'),
    ('things', '사물 · 탈것', '✈✉✂✏✎✆☎☏⌂⌘☂⚓⚙♻✇☕✿'),
    ('cards', '카드 · 체스 · 음표', '♠♣♥♦♤♧♡♢♔♕♖♗♘♙♚♛♜♝♞♟♩♪♫♬♀♂☿♁♈♉♊♋♌♍♎♏♐♑♒♓'),
    ('numbers', '숫자 · 문자',
     rng('①', '⑳') + rng('⑴', '⒇') + rng('⒈', '⒛') + rng('➀', '➉') + rng('➊', '➓') + rng('❶', '❿')
     + rng('Ⅰ', 'Ⅻ') + rng('ⅰ', 'ⅻ') + rng('Ⓐ', 'Ⓩ') + rng('ⓐ', 'ⓩ')
     + '¹²³⁰⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉½⅓⅔¼¾'),
    ('dividers', '구분자 · 괄호', '│┃¦‖⁞⋮⋯∷∶⁝·•‣⁃‥…‧«»‹›《》〈〉「」『』【】〔〕〖〗⟨⟩⟦⟧⌈⌉⌊⌋❮❯❰❱❲❳❨❩❪❫❬❭❴❵'),
    ('lines', '선 · 박스', '─━│┃┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬╒╓╕╖╘╙╛╜╞╟╡╢╤╥╧╨╪╫╭╮╯╰╱╲╳'),
    ('math', '수학 · 기타', '∞≈≠≡≤≥±×÷√∑∏∫∂∆∇∈∩∪⊕⊖⊗⊘⊙⊚⊛⊜⊝⊞⊟⊠⊡°′″‰№™©®¤¢£€¥§¶†‡¿¡‼⁇⁈⁉≪≫∴∵∷☰'),
]

out, dropped, seen = [], {}, set()
for gid, label, chars in GROUPS:
    keep = []
    for ch in dict.fromkeys(chars):  # 중복 제거 (순서 유지)
        if ord(ch) in OK and ch not in seen:
            keep.append(ch)
            seen.add(ch)
        elif ord(ch) not in OK:
            dropped.setdefault(gid, []).append(ch)
    out.append({'id': gid, 'label': label, 'chars': ''.join(keep)})

header = '// 자동 생성: tools/build-symbols.py (EVE 클라이언트 글꼴 EVE Sans Neue + Arial Unicode 에 글리프가 있는 문자만)\n'
body = 'export const SYMBOL_GROUPS = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n'
with open(os.path.join(here, '..', 'public', 'js', 'symbols.js'), 'w', encoding='utf-8') as f:
    f.write(header + body)

print('included:', {g['id']: len(g['chars']) for g in out}, 'total', sum(len(g['chars']) for g in out))
print('dropped (not in EVE fonts):')
for k, v in dropped.items():
    print(' ', k, ''.join(v))
