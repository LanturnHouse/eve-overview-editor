"""리전 배경 이미지의 밝기 분포(히스토그램)를 계산해 public/data/bg-luminance.json 으로 저장한다.
앱이 글자색의 가독성(대비 3.0 이상으로 읽히는 픽셀 비율)을 이미지 없이 빠르게 계산하는 데 쓴다.

글자 뒤의 배경은 별 하나가 아니라 주변 평균이므로, 박스 블러(반경 5)를 적용한 뒤 WCAG 상대 휘도를 센다.
사용: python tools/build-bg-luminance.py
"""
import json
import os

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(HERE, '..', 'public', 'img', 'regions')
OUT = os.path.join(HERE, '..', 'public', 'data', 'bg-luminance.json')
IMAGES = {'brown': 'brown.webp', 'blue': 'blue.webp', 'gold': 'gold.webp', 'red': 'red.webp', 'green': 'green.png'}
BINS = 256
BLUR = 5


def lin(c):
    c = c / 255.0
    return np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def luminance(rgb):
    return 0.2126 * lin(rgb[..., 0]) + 0.7152 * lin(rgb[..., 1]) + 0.0722 * lin(rgb[..., 2])


out = {'version': 1, 'blur': BLUR, 'bins': BINS, 'images': {}}
for key, fname in IMAGES.items():
    im = Image.open(os.path.join(IMG_DIR, fname)).convert('RGB').filter(ImageFilter.BoxBlur(BLUR))
    lum = luminance(np.asarray(im).astype(float)).ravel()
    hist, _ = np.histogram(lum, bins=BINS, range=(0.0, 1.0))
    out['images'][key] = [round(float(x), 5) for x in (hist / hist.sum())]
    print(f'{key:6s} p50={np.percentile(lum, 50):.3f} p90={np.percentile(lum, 90):.3f} max={lum.max():.3f}')

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(out, f, separators=(',', ':'))
print('saved', os.path.getsize(OUT), 'bytes')
