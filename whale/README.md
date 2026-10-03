# 누가 — 웨일 웹앱 (NWEC 26 제출판)

> 수업 중 10초 관찰 기록을 피드백과 세특 근거로 바꾸는 웨일 웹앱
> NWEC 26 바이브코딩 공모전 · 분야 2 평가·피드백 혁신 · v0.9.0

제작 문서: [docs/앱제작문서.md](docs/앱제작문서.md). 이 폴더는 저장소의 다른 앱(`apps/`, `android/`)과 독립적이며, 프레임워크·빌드 의존성이 없습니다.

## 바로 쓰기

```bash
python tools/build.py        # src → dist/index.html (한 파일, 약 157KB)
```

`dist/index.html`을 웨일에서 열고 **데모로 바로 써 보기**를 누르면 설치·로그인·키 없이 체험할 수 있습니다(합성 데이터, 번호만).

## 폴더

```
whale/
├─ src/              index.html · style.css · core.js · engine.js · ui1.js · ui2.js
├─ tools/
│   ├─ build.py      src → dist/index.html
│   ├─ test.mjs      규칙 점검 (node tools/test.mjs)
│   └─ dev-server.mjs 누가 서버를 Wrangler 없이 로컬에서 (node tools/dev-server.mjs 8790)
├─ dist/index.html   제출용 앱
├─ server/           누가 서버 (Cloudflare Workers + KV) — server/README.md
└─ docs/앱제작문서.md
```

## 점검

| 명령 | 확인하는 것 |
| --- | --- |
| `node tools/test.mjs` | 나이스 바이트, 조사, 데모 재현·기록 편중, 쉬는 날(개천절·한글날), 교시 시각, 발언 후보(−60초~+15초·카테고리), 놓친 발언 추천, 문장 변환, 세특 정리·점검 6가지, 피드백 카드, 전달함 암호화 |
| `cd server && npm test` | 전달함 평문 미저장·삭제, 토큰, AI 출입·하루 한도, 나이스·학사일정·공휴일 합치기, 웨일 스페이스 로그인(state 재사용·돌아갈 주소·아이디 해시), 피드백 보내기·내 카드만 |
| 브라우저 | 데모 → 기록(클릭·키보드·되돌리기) → [수업 끝내고 자리로] → 정리 팝업(후보·한 번에 저장·번호 고르기·끝) → 정리·반·피드백(보내기 → 학생 화면)·세특(초안·점검)·설정 → 가상 워치 → 한글날 [수업 시작], 420px 폭. 실사용 처음 설정 → 로컬 서버 → 폰(다른 출처 창) 연결 코드 → 폰 기록 암호화 전달 → 본체 수업에 붙음 → 정리 팝업 |

## 제작 문서와 다른 점

- 브라우저 점검은 Python Playwright 스크립트(`flow.py` 등) 대신 위 표의 순서로 직접 확인했습니다. 이 PC에는 Playwright 가 없습니다.
- 시연 영상(`video/`)과 안내 PDF(`guide/`) 도구는 아직 넣지 않았습니다.
- 갤럭시 워치 앱, 데모용 합성 수업 음성, 배포 URL 은 제작 문서 13절 "남은 일" 그대로입니다.
