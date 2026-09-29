# 누가 — 생기부 누가기록 앱

**웹 데모(GitHub Pages):** https://dacisosl.github.io/NUGA/ · **저장소:** https://github.com/dacisosl/NUGA · 설치 파일·APK는 `v*` 태그를 푸시하면 Actions가 빌드해 Releases에 올린다.

수업 중 워치·위젯으로 학생 행동을 10초 안에 기록하고, 수업 후 PC에서 1~2분 안에 보완하며, 학기 말에 그 기록을 근거로 세특 초안을 만들고 검토하는 앱.
기획서: [누가_앱_제작_기획서.md](누가_앱_제작_기획서.md) · 프로토콜: [docs/PROTOCOL.md](docs/PROTOCOL.md) · 디자인 토큰: [docs/DESIGN.md](docs/DESIGN.md) · 기획서 대비 개선점: [docs/UPGRADES.md](docs/UPGRADES.md)

## 구성

| 폴더 | 내용 | 스택 |
| --- | --- | --- |
| `packages/core` | 공통 로직: 데이터 모델, AES-GCM 동기화 암호화, 시간표 판별, 검토 규칙(금지어·유사도·어체·글자수), 규칙 기반 초안 생성기, AI 요청 익명화, 엑셀 행 파서, 샘플 데이터 | TypeScript, vitest |
| `apps/desktop` | PC 앱: 설정 마법사 · 1p 누가기록 · 보완 모달 · 2p 초안(개별 대화형/일괄) · 3p 검토 · 동기화 · 백업 · 엑셀/JSON | React + Vite, Tauri 2 (브라우저에서도 그대로 동작) |
| `apps/relay` | E2E 릴레이 서버: 암호문만 24시간 보관, 롱폴링, 속도 제한, SQLite 옵션 | Node 24, 의존성 없음 |
| `android/mobile` | 폰 앱: 홈·번호 입력 시트·기록·설정, 4×2 위젯, QR 페어링, 워치 브리지, 수업 시작 알림 | Kotlin, Compose, Glance, Room, WorkManager |
| `android/wear` | 워치 앱: 카테고리 2×2 → 번호 릴(베젤) → 저장 완료(취소 5초·음성 메모), 자동 실행 | Compose for Wear OS, Data Layer |
| `tools/phone-sim.mjs` | 폰 없이 동기화 프로토콜을 검증하는 시뮬레이터 | Node |

## 빠른 시작

```bash
npm install
npm run dev          # PC 앱 (브라우저) http://localhost:1420
npm run relay        # 릴레이 서버 http://localhost:8787  (같은 Wi-Fi 직접 전송용)
npm test             # core 단위 테스트 + relay 통합 테스트
```

첫 화면에서 **샘플 데이터로 둘러보기**를 누르면 화학Ⅰ · 2개 반 · 기록·수행평가가 채워진 상태로 모든 화면을 볼 수 있다.

### PC 앱을 네이티브(Tauri)로

```bash
npm run tauri -- dev     # 개발 실행
npm run tauri -- build   # Windows 설치 파일 (apps/desktop/src-tauri/target/release/bundle)
```
필요: Rust 1.77+, Visual Studio C++ Build Tools, WebView2(Windows 11 기본 포함). 데이터는 `%APPDATA%\kr.nuga.desktop\nuga-data.json` 에 저장된다.

### 안드로이드 (폰 + 워치)

```bash
cd android
gradlew.bat :mobile:installDebug   # 폰
gradlew.bat :wear:installDebug     # 갤럭시 워치 (Wear OS)
```
자세한 내용은 [android/README.md](android/README.md).

## 동기화 흐름 (검증 방법)

1. PC 앱 → 설정 → 동기화 → 릴레이 URL 입력(같은 Wi-Fi면 `http://<PC IP>:8787`) → **동기화 키 생성** → QR 표시.
2. 폰 앱 → 설정 → QR 스캔. 폰이 `ping`을 보내면 PC "연결 기기"에 표시되고 시간표·진도·카테고리가 폰으로 내려간다.
3. 폰/워치/위젯에서 기록 → 폰이 AES-256-GCM 으로 암호화해 릴레이에 올림 → PC가 5초마다 폴링해 복호화 → 우측 하단 알림 → **보완하기**.
4. 폰 없이 검증하려면:
   ```bash
   node tools/phone-sim.mjs "<QR의 nuga://pair?... 문자열>" ping
   node tools/phone-sim.mjs "<...>" record 2-3 5 1 "메모"
   node tools/phone-sim.mjs "<...>" pull      # PC가 내려보낸 config 확인
   ```

## 개인정보 원칙 (구현 상태)

- 학생 이름은 PC 로컬 JSON에만 있다. 폰은 PC에서 "폰에 이름 표시"를 켠 경우에만 명렬을 받고, 워치에는 어떤 경우에도 보내지 않는다.
- 릴레이 서버는 `keyId`·암호문·수신 시각만 저장하고 24시간 뒤 지운다. 키는 QR로만 전달된다.
- AI 초안 요청에는 반·번호·이름이 없다(`설정 → AI → 전송 내용 미리보기`에서 실제 전송 본문 확인). AI를 끄면 규칙 기반 로컬 생성기가 대신 동작한다.
- JSON 내보내기에는 API 키가 포함되지 않는다. 암호화 백업은 PBKDF2 + AES-GCM.

## 빌드 결과물과 검증 상태 (2026-09-30)

| 항목 | 결과 |
| --- | --- |
| `packages/core` 단위 테스트 | 21개 통과 (암호화·페어링·글자수·어체·검토 규칙·로컬 초안·시간표·병합·가져오기) |
| `apps/relay` 테스트 | 21개 통과 (API·TTL·롱폴링·속도 제한·SQLite) |
| `android/shared` 테스트 | 25개 통과 (Kotlin 암호화·페어링·시간표 + **TS가 만든 봉투를 Kotlin이 복호화하는 교차 검증**) |
| PC ↔ 폰 종단간 | 폰 시뮬레이터 → 릴레이 → PC 수신·알림·보완, PC 설정 → 폰 수신 확인 |
| Windows 설치 파일 | `apps/desktop/src-tauri/target/release/bundle/nsis/Nuga_0.1.0_x64-setup.exe`, `…/msi/Nuga_0.1.0_x64_en-US.msi` |
| 안드로이드 APK | `android/mobile/build/outputs/apk/debug/mobile-debug.apk`, `android/wear/build/outputs/apk/debug/wear-debug.apk` (컴파일 검증, 실기기 미실행) |

## 라이선스
MIT
