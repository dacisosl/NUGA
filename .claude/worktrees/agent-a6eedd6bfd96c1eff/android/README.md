# 누가 — Android (폰 앱 · 위젯 · 워치 앱)

`docs/PROTOCOL.md` · `docs/DESIGN.md` · `누가_앱_제작_기획서.md` 8·9·13·15장을 그대로 구현한 Gradle 프로젝트.

## 모듈

| 모듈 | 내용 |
| --- | --- |
| `:shared` | 순수 Kotlin(JVM). Record/Config/Envelope/Message 모델(kotlinx.serialization), `SyncCrypto`(AES-256-GCM, keyId), `PairingUri`(QR 파서), `TimetableResolver`, `DemoConfig`, Data Layer 경로 상수. JVM 단위 테스트 포함. |
| `:mobile` | `kr.nuga.app`. Jetpack Compose(Material3) + Room + DataStore + WorkManager + Glance 위젯 + Play Services Wearable + ZXing(QR). minSdk 26 / target 35. |
| `:wear` | `kr.nuga.app`(폰과 같은 applicationId — Data Layer 필수). Compose for Wear OS. minSdk 30. |

## 빌드 환경

- JDK 17 이상(Android Studio JBR 21로 확인), Android SDK platform 35.
- Gradle 8.11.1(wrapper) · AGP 8.10.1 · Kotlin 2.1.21 · Compose BOM 2025.05.01 · Wear Compose 1.4.1.
- `local.properties`에 `sdk.dir=C:/…/Android/Sdk` (슬래시 사용). 없으면 `ANDROID_HOME`을 읽는다.

```bat
cd android
gradlew.bat :shared:test
gradlew.bat :mobile:assembleDebug :wear:assembleDebug
gradlew.bat :mobile:installDebug        REM 폰(USB 디버깅)
gradlew.bat :wear:installDebug          REM 워치(adb 연결 후)
```

APK: `mobile/build/outputs/apk/debug/mobile-debug.apk`, `wear/build/outputs/apk/debug/wear-debug.apk`.

워치 adb 연결(Wi-Fi 디버깅) 예: `adb connect 192.168.0.xx:5555` 후 `gradlew :wear:installDebug`. 두 APK가 같은 디버그 키로 서명되어야 Data Layer가 연결된다(같은 PC에서 빌드하면 동일).

## 페어링 (폰 ↔ PC)

1. PC 앱 설정에서 동기화 키 생성 → QR 표시 (`nuga://pair?v=1&k=…&r=…&n=…`).
2. 폰 앱 **설정 → QR 스캔**. 키 32바이트·keyId(SHA-256 앞 8바이트 hex)·릴레이 URL·PC 이름을 EncryptedSharedPreferences에 저장한다. 서버로 키를 보내지 않는다.
3. 즉시 `ping` 봉투를 올리고 `GET /box/{keyId}?for=phone`으로 config를 받는다. 이후 15분 주기(WorkManager) + 기록 저장 시 + 네트워크 복귀 시 + [지금 동기화].
4. 기록은 outbox → `records`/`tombstones` 메시지 → AES-GCM 봉투(AAD=keyId) → `POST /box/{keyId}`. 받은 항목은 처리 후 `DELETE /box/{keyId}/{id}`.
5. **연결 해제**: 키 삭제, 릴레이 박스 비우기(`DELETE /box/{keyId}`), PC에서 온 config 삭제. 기록은 폰에 남는다.
6. PC 없이 써 보려면 설정(미연결 상태)에서 **샘플 설정 불러오기**: 2-3(28명)·2-5(27명), 7교시, 월–금 시간표, 진도 3건.

폰 → 워치: config에서 `roster`를 제거해 DataClient `/nuga/config`로 전달. 워치 → 폰: MessageClient `/nuga/record`, 폰이 `/nuga/ack`로 응답하면 워치 큐에서 제거.

## 위젯 추가 (4×2)

홈 화면 빈 곳 길게 누르기 → **위젯** → **누가** → 4×2 배치(세로로 늘리면 번호 줄이 더 보인다).

- **머리**: 현재 반·교시·단원·차시(수업 시간이 아니면 다음 수업), 녹음 버튼(녹음을 켰을 때), 오늘 기록 수.
- **번호 칸**(아래 왼쪽): 그 반 1..N을 3명씩, 두 줄쯤 보이고 나머지는 위아래 스크롤(Glance `LazyVerticalGrid`). 번호는 두 자리("05"), 앱에서 **이름 표시**를 켜고 명렬표가 있으면 번호 밑에 이름. 누르면 고르고(밝은 유리), 다시 누르면 푼다.
- **[기록]**(아래 오른쪽): 번호를 골랐으면 "05번 기록" — 누르면 바로 저장(지금 시각 · 미정 0 · 메모 없음 · `source: widget`, 번호 시트와 같은 `RecordRepository.create` → outbox → PC). 머리 둘째 줄에 "✓ 05번 기록" + [취소] 5초. 고르지 않았으면 `nuga://record?class=…&src=widget` 딥링크로 그 반의 기록 시트(번호 릴)를 연다.
- **반**: 지금 수업 → 다음 수업 → 첫 반(기록 시트와 같은 기본값). 고른 번호는 위젯마다 Glance 상태에 수업 key(날짜|교시|반)와 함께 두고, 수업이 바뀌면 버린다. 누르는 순간 수업이 바뀌어 있으면 다른 반에 저장하지 않는다.
- **갱신**: 교시 시작·끝(깨우지 않는 알람), 기록 저장·설정 변경·동기화·이름 표시 변경 시, 그리고 30분마다 시스템 갱신.

## 폰 앱 화면

- **홈**: 날짜, 현재 수업 카드(카테고리 4버튼), 오늘 시간표(기록 수·지금·예정), 최근 기록.
- **번호 입력 시트**: 반 선택, 카테고리 칩, 1..N 6열 그리드, 메모 + 마이크(SpeechRecognizer), 저장. 저장 시 진동 1회, 5초 **취소** 스낵바.
- **기록**: 날짜별 그룹, 카테고리 필터, 항목 탭 → 메모 수정/삭제(삭제는 tombstone으로 PC에 전파).
- **설정**: 동기화 상태(PC 이름·키 앞 8자·최근 동기화·대기 건수), QR 스캔, 지금 동기화, 시간표(읽기 전용), 이름 표시(명렬표가 있을 때만), 수업 시작 알림, 위젯 안내, 연결 해제.

수업 시작 알림: 시간표 기준 정확 알람(AlarmManager) → "2-3 · 3교시 시작" 알림 + 카테고리 액션. 알림 액션은 시스템이 최대 3개까지만 표시할 수 있다(4번째는 본문 탭으로 대체).

## 워치 앱

1. **카테고리**: 상단 반·교시(없으면 "수업 없음" + 다음 수업), 2×2 버튼, 하단 오늘 기록 수·대기 수, 설정 아이콘.
2. **번호 릴**: 베젤(로터리) + 세로 스와이프, 가운데 64sp, 범위 1..그 반 인원. 시작 위치 `options.reelStart`(`one`=1, `last`=그 반 마지막 저장 번호). 저장 버튼.
3. **저장 완료**: 체크 아이콘, "2-3 · 5번", 카테고리, [메모](음성 인식 → `voiceMemo.transcript`), [취소 N] 5초 카운트다운. 진동 1회. 카운트다운이 끝나면 폰으로 전송하고 1번 화면으로 복귀.
4. **설정**: 자동 실행 토글(기본값은 config의 `autoLaunchWatch`), 폰 연결 상태, 대기 재전송.

기록은 DataStore 큐에 저장되고 ack가 올 때까지 남는다(앱 실행·폰 연결 감지 시 재전송). 자동 실행은 수업 시작 시각 알람 → 전체화면 알림(탭하면 열림) + 액티비티 시작 시도.

## 개인정보

- 폰·워치는 학생 이름을 저장하지 않는다. PC가 `roster`를 포함해 보낸 경우에만 폰에서 "이름 표시"를 켤 수 있고, 워치로는 항상 `roster`를 제거해 보낸다.
- 전송 구간은 E2E(AES-256-GCM). 릴레이는 keyId와 암호문만 본다.

## 알려진 제한

- 에뮬레이터/실기기 실행은 이 저장소에서 검증하지 않았다(컴파일 성공 기준).
- 글꼴은 시스템 기본(IBM Plex Sans KR 미포함).
- Android 12+에서 정확 알람 권한(`SCHEDULE_EXACT_ALARM`)이 없으면 1분 창(inexact)으로 동작한다. Android 13+는 알림 권한을 설정 토글에서 요청한다.
- 워치 자동 실행은 Wear OS 백그라운드 액티비티 제한 때문에 전체화면 알림 방식이 주 경로다.
- 릴레이 롱폴링(`wait=`)은 사용하지 않는다(폰은 주기·이벤트 폴링).
- 음성 메모는 기기 STT 결과 텍스트만 저장·전송한다(오디오 없음). 워치에서 음성 인식 앱이 없으면 RemoteInput(키보드/음성)으로 대체된다.
- Room 스키마 버전 1, 마이그레이션 없음(변경 시 destructive).
