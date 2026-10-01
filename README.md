# EVE 오버뷰 편집기

EVE Online 오버뷰 설정 YAML(`Documents\EVE\Overview\*.yaml`)을 브라우저에서 편하게 편집하는 로컬 웹앱입니다.
의존성 없는 Node.js 서버(`server.mjs`)가 `127.0.0.1` 에서만 동작하며, 외부로 아무것도 전송하지 않습니다.

## 실행

`start.bat` 더블클릭 (또는 `node server.mjs` 후 http://localhost:5173).
Node.js 18 이상이 필요합니다.

## 사용 흐름

1. 게임에서 오버뷰 설정을 **내보내기** → `Documents\EVE\Overview` 에 YAML 저장
2. 편집기에서 파일 선택 → 편집 → **저장** (덮어쓰기 전 `backups/` 에 자동 백업)
3. 게임에서 오버뷰 설정을 **가져오기**

## 기능

- **프리셋**: 그룹을 카테고리 트리에서 검색·체크, 상태 필터(숨김/항상 표시), 프리셋 간 합치기·빼기, 복제/이름 변경(탭 참조 자동 갱신)
- **오버뷰 탭**: 탭 이름 마크업 미리보기, 프리셋/브래킷 지정, 탭별 컬럼
- **깃발 · 배경 색상**: 상태별 우선순위 드래그 정렬, 색상, 깜빡임, 미리보기
- **컬럼**: 표시/순서
- **선박 라벨**: 조각 순서/앞뒤 마크업, 실시간 미리보기
- **파일 · 고급**: 변경 요약, 정리 도구, 백업 복원, YAML 원문 편집
- 되돌리기/다시 실행(Ctrl+Z / Ctrl+Y), 저장 Ctrl+S, YAML 파일 드래그&드롭

## 참고

- 그룹/카테고리 이름은 ESI(영어·한국어)에서 받아 `public/data/groups.json` 에 내장했습니다. 갱신: `node tools/build-data.mjs` (결과는 `public/data/groups.json` 에 저장됨).
- 변환 정확도 확인: `node tools/roundtrip.mjs <파일>` — 읽고 다시 쓴 결과가 원본과 동일한지 비교합니다.
- 상태 ID 이름은 [kormat/eve-overview-tool](https://github.com/kormat/eve-overview-tool) 및 [Z-S Overview Customizer](https://github.com/Arziel1992/Z-S-Overview-Customizer) 의 공개 자료를 참고했습니다. 색 이름의 미리보기 색은 근사값입니다.

## CCP notice

This is an unofficial, free, non-commercial fan tool. This material is used with limited permission of CCP Games hf. No official affiliation or endorsement by CCP Games hf is stated or implied.

© 2014 CCP hf. All rights reserved. "EVE", "EVE Online", "CCP", and all related logos and images are trademarks or registered trademarks of CCP hf.

- `public/img/regions/` 의 배경 이미지는 EVE Online 의 이미지로 CCP hf 의 저작물입니다. 이 저장소의 MIT 라이선스(소스 코드 한정)가 적용되지 않으며, CCP 의 콘텐츠 이용 정책에 따라 무료·비영리 목적(선박 라벨 가독성 미리보기)으로만 사용합니다. CCP 가 요청하면 제거합니다.
- 코드는 MIT 라이선스입니다. 번들된 [js-yaml](https://github.com/nodeca/js-yaml) (MIT) 이 `public/vendor/` 에 포함되어 있습니다.
