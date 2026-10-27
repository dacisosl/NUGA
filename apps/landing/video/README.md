# 기록 방법 영상 만들기

소개 페이지의 '기록 방법 1 · 수동 기록', '기록 방법 2 · 자동 기록' 화면에 들어가는 영상(`../assets/record-manual.mp4`, `record-auto.mp4`)을 만드는 도구다.
화면은 모두 **실제 앱을 데모 모드로 조작해 찍은 것**이다. 예외는 폰의 안드로이드 알림('오늘 녹음 대기 중' → '녹음 중') 하나로, 웹 앱에는 그 화면이 없어 안드로이드 앱(`RecordingService.kt`)의 실제 문구로 그렸다.
의존성은 없다. Node 22+, Chrome(또는 Edge · Chromium, 다른 곳에 있으면 `CHROME_PATH` 로 지정), ffmpeg 만 있으면 된다.

## 순서

```bash
npm run dev -w @nuga/desktop                 # 1) 앱 개발 서버 (http://localhost:1420)
node apps/landing/video/capture.mjs          # 2) 실제 앱 화면 찍기 → video/shots/*.png + manifest.json
node apps/landing/video/render.mjs manual --poster 3.6          # 3) 영상 → video/out/record-manual.mp4 + 포스터
node apps/landing/video/render.mjs auto --crf 25 --poster 9.3
cp apps/landing/video/out/record-*.mp4 apps/landing/video/out/record-*-poster.jpg apps/landing/assets/
```

- 장면만 빠르게 보기: `node apps/landing/video/render.mjs manual --stills 2,9,19.5` → `video/out/manual-t2.0.jpg` …
- 브라우저로 보기: 저장소 맨 위에서 정적 서버를 띄우고 `apps/landing/video/manual.html?play` (스크럽바, 스페이스로 멈춤)
- `shots/`, `out/` 은 다시 만들 수 있어 git 에 넣지 않는다.
- 영상은 TV 색 범위(BT.709)로 인코딩한다. 포스터는 재생 전에 보이는 첫 단계 장면으로, 영상과 같은 1280×720.

## 파일

| 파일 | 하는 일 |
| --- | --- |
| `cdp.mjs` | 헤드리스 Chrome 을 DevTools 프로토콜로 다루는 작은 도우미. 빈 포트·임시 프로필로 띄우고 끝나면 지운다 |
| `capture.mjs` | 앱을 데모 모드로 열어 클릭·입력·Enter 로 조작하며 화면을 찍는다. 시계를 2026-10-28(수) 10:05 로 고정해 언제 찍어도 같은 화면('지금 수업 2-3 · 2교시')이 나온다 |
| `engine.js` | 시간 t 로 장면을 그리는 엔진 (`window.renderAt(t)`) |
| `film.js` | 두 영상이 함께 쓰는 '세계'(왼쪽 폰, 오른쪽 모니터)와 카메라, 겹쳐 바꾸기, 누름·커서 표시 |
| `manual.html` · `manual.js` | 방법 1: 폰 번호 릴 → `저장 · 14번` → 그 기록이 PC에 도착한 순간 계단 한 칸(14 설유진, 출발선 → 2건 이하, 앱은 보완 전 기록도 센다) → '쉬는 시간 기록' 창에 한 줄 → 학생 카드에 그 한 줄 |
| `auto.html` · `auto.js` | 방법 2: 녹음 사용 조건 확인 → 하루 대기 → 폰 '오늘 녹음 대기 중' → 수업 시간 '녹음 중' → 화자만 구분된 스크립트 → 추천 발언 → 학생 지정 → 계단 한 칸 (24 손시우, 2건 이하 → 3건 이상) |
| `render.mjs` | 장면을 프레임마다 찍어 ffmpeg 로 1280×720 MP4 와 포스터를 만든다 |

## 고칠 때

- 앱 화면이 바뀌면 `capture.mjs` 를 다시 돌린다. 요소 위치는 `shots/manifest.json` 에 함께 적혀 장면이 따라간다.
- 장면 시각을 바꾸면 소개 페이지 `index.html` 의 단계 `data-at`(초)도 같이 바꾼다. 방법 1: 0 · 5.4 · 11 · 20.6, 방법 2: 0 · 10.5 · 15.3 · 18.4.
- 영상 속 단계 칩 문구와 소개 페이지 단계 문구는 같게 둔다.
- 앱 동작과 다르게 보이는 연출은 넣지 않는다 (예: 기록이 계단에 반영되는 시점, 녹음 시작에 필요한 아침 1탭).
