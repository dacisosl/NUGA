# 누가 — 동기화 프로토콜 · 데이터 모델 (v1)

모든 구성 요소(워치·폰·PC·릴레이)가 공유하는 계약. 이 문서와 다르게 구현하지 않는다.

## 0. 용어
- `class`: 반 이름 문자열. 자유 형식(예 `"2-3"`, `"과학동아리"`). `"{학년}-{반}"` 꼴이면 학년·반 순으로 정렬한다.
- `no`: 번호 정수 1..N.
- `category`: 정수 0..4. 1..4 는 분류(기본 라벨 1 질문 · 2 발표 · 3 협동 · 4 기타, 라벨은 설정에서 바뀔 수 있음). **0 = 미정**: 폰·워치·위젯은 '기록 + 번호'만 고르고 분류 없이(0) 보낸다. PC 가 보완(쉬는 시간 기록)할 때 1..4 로 정해 되보낸다. 0.6.11 이전 기기는 1..4 만 보낸다(그대로 받는다).
- 시각은 모두 ISO-8601 문자열, 로컬 시간대 오프셋 포함 (예 `2026-05-08T10:12:00+09:00`).
- id 는 UUID v4 소문자 문자열.

## 1. 동기화 키 · 페어링
- 동기화 키 `K`: 32바이트 난수. PC가 생성.
- `keyId` = SHA-256(K) 의 앞 8바이트를 소문자 hex (16자).
- QR 페이로드 (텍스트):
  `nuga://pair?v=1&k=<base64url(K, 패딩 없음)>&r=<url-encoded 릴레이 URL>&n=<url-encoded PC 이름>`
  예 `nuga://pair?v=1&k=Ab3...&r=https%3A%2F%2Frelay.example.com&n=%EA%B5%90%EB%AC%B4%EC%8B%A4PC`
- 폰은 K, keyId, 릴레이 URL을 안전 저장소(Android Keystore/EncryptedSharedPreferences)에 저장. 서버에 K를 보내지 않는다.
- 같은 Wi-Fi 직접 전송 = 릴레이 URL이 PC의 LAN 주소인 경우. 프로토콜은 동일.

## 2. 암호화 (E2E)
- AES-256-GCM. 키 = K 그대로 (32바이트).
- IV 12바이트 난수(메시지마다 새로). 태그 128비트(암호문 뒤에 붙는 표준 형식).
- AAD = `keyId` 의 UTF-8 바이트.
- 평문 = UTF-8 JSON (3장 메시지).
- 봉투(envelope) = 서버가 저장하는 형태:
```json
{ "from": "phone" | "pc", "iv": "<base64>", "ct": "<base64 (ciphertext||tag)>", "ts": "2026-05-08T10:12:05+09:00" }
```

## 3. 메시지 (평문)
```json
{ "v": 1, "type": "records" | "tombstones" | "config" | "ping",
  "deviceId": "uuid", "sentAt": "ISO", "payload": ... }
```

### 3.1 `records` (폰/워치 → PC, 또는 PC → 폰 편집 반영)
payload = `Record[]`
```json
{ "id": "uuid", "class": "2-3", "no": 5, "category": 1,
  "time": "2026-05-08T10:12:00+09:00",
  "lesson": { "unit": "3단원", "lesson": 2, "title": "화학 평형" } | null,
  "memo": "", "voiceMemo": null | { "durationSec": 4, "transcript": "…" },
  "note": "", "status": "pending" | "confirmed" | "skipped",
  "source": "watch" | "phone" | "widget" | "pc",
  "createdAt": "ISO", "updatedAt": "ISO" }
```
- 워치/폰은 `lesson` 을 알면 채우고 모르면 `null`. PC는 null이면 진도표(날짜+반)로 채운다.
- 충돌: 같은 id → `updatedAt` 이 늦은 쪽 우선.
- 음성 파일 자체는 전송하지 않고 기기 내 STT 변환 결과(transcript)만 보낸다.

### 3.2 `tombstones`
payload = `[{ "id": "uuid", "deletedAt": "ISO" }]` — 삭제 전파. 받은 쪽은 해당 id를 삭제 표시.

### 3.3 `config` (PC → 폰; 폰은 워치로 그대로 중계)
```json
{ "school": { "grade": 2, "subject": "화학Ⅰ", "year": 2026, "semester": 1 },
  "categories": [ { "key": 1, "label": "질문" }, { "key": 2, "label": "발표" }, { "key": 3, "label": "협동" }, { "key": 4, "label": "기타" } ],
  "classes": [ { "class": "2-3", "size": 28 } ],
  "periods": [ { "no": 1, "start": "08:50", "end": "09:40" } ],
  "timetable": [ { "weekday": 2, "period": 3, "class": "2-3" } ],
  "progress": [ { "date": "2026-05-08", "class": "2-3", "unit": "3단원", "lesson": 2, "title": "화학 평형" } ],
  "roster": null | [ { "class": "2-3", "no": 2, "name": "이서연" } ],
  "options": { "autoLaunchWatch": true, "reelStart": "one" | "last" },
  "recording": null | { "enabled": true, "approvedChecklist": true, "mode": "tap" | "standby", "audioTTLHours": 24,
                        "speech": { "provider": "gemini", "model": "gemini-2.5-flash" }, "wifiOnly": true },
  "updatedAt": "ISO" }
```
- `weekday`: 1=월 … 5=금. `period`: 1..N. `size`: 그 반 최대 번호.
- `roster` 는 PC 설정 "폰에 이름 표시" 를 켠 경우에만 포함. 기본 null. 워치에는 절대 보내지 않는다.
- `recording` 은 PC 설정 → 녹음에서 사용 조건을 모두 확인하고 켠 경우에만 포함. 키는 들어가지 않는다(§3.8).

### 3.4 `ping`
payload = `{ "name": "기기 이름" }` — 연결 확인·기기 목록용.

### 3.5 수업 녹음 흐름 (v3 7.3~7.6)
1. 폰이 마이크 포그라운드 서비스로 녹음한다. Android 14 이상 제약 때문에 교사의 1탭(수업 시작 알림 [녹음 시작], 위젯, 앱, 아침 [오늘 녹음 대기])으로만 시작한다.
2. 음성(AAC ADTS, 16kHz 모노 32kbps)은 폰 앱 전용 저장소에만 두고 `audioTTLHours`(기본 24) 뒤 지운다. PC·릴레이로 보내지 않는다.
3. 수업이 끝나면 Wi-Fi(설정)에서 Gemini Files API 로 녹음 1개를 통째로 올려 받아쓰기·화자 구분을 하고, 업로드 파일은 곧바로 지운다. 지시문은 `TRANSCRIBE_PROMPT`(core) = `TranscriptParser.PROMPT`(Kotlin).
4. 스크립트를 `transcript` 메시지로 PC 에 보내고, PC 가 `transcriptAck` 를 보내면 폰의 스크립트 사본을 지운다.

### 3.6 `transcript` (폰 → PC)
```json
{ "transcript": { "id": "uuid", "class": "2-3", "period": 3, "startedAt": "ISO", "endedAt": "ISO",
                  "segments": [ { "id": "s41", "t0": 712, "t1": 723, "speaker": "화자3", "text": "…" } ],
                  "teacherSpeaker": { "auto": "화자1", "confirmed": null },
                  "engine": { "provider": "gemini", "model": "…" }, "createdAt": "ISO" },
  "part": 1, "total": 2 }
```
- `t0`·`t1` 은 녹음 시작부터 지난 초. 화자는 `화자N` 라벨뿐이며 학생과 연결하는 필드는 없다.
- 메시지 하나의 스크립트 JSON 은 120KB 이하로 나눈다(릴레이 본문 256KB). PC 는 `id` 로 조각을 모아 `total` 개가 다 오면 합친다.
- PC 는 기록 시각과 같은 규칙(§6, `routeRecordArea`)으로 `class`·`startedAt` 을 보고 영역을 정한다.

### 3.7 `transcriptAck` (PC → 폰)
payload = `{ "ids": ["uuid"] }` — 다 받아 저장한 스크립트. 폰은 스크립트 사본을 지운다(음성은 보존 기간까지 남음).

### 3.8 `secrets` (PC → 폰)
payload = `{ "gemini"?: "키", "openrouter"?: "키" }` — 교사가 PC 설정 → 녹음 → [폰으로 키 보내기]를 눌렀을 때만. 동기화 키로 E2E 암호화되며, 폰은 Android Keystore 기반 저장소에 둔다. 빈 문자열은 지우기.

## 4. 릴레이 서버 HTTP API
Base: 릴레이 URL. 모든 응답 JSON, CORS 전체 허용(`*`). 서버는 `keyId`·봉투·수신시각만 저장, 24시간(TTL) 후 삭제. `keyId` 를 아는 쪽만 접근 가능(키 보유 증명 = keyId 자체).

| 메서드 | 경로 | 요청 | 응답 |
| --- | --- | --- | --- |
| POST | `/box/{keyId}` | 봉투 JSON | `201 { "id": "<서버 id>", "ts": "ISO" }` |
| GET | `/box/{keyId}?for=pc|phone&after=<id>` | — | `200 { "items": [ { "id", "from", "iv", "ct", "ts" } ] }` (`for=pc` 는 `from=phone` 인 것만, 반대도 같음. `after` 이후 것만, 최대 200개, 오래된 순) |
| DELETE | `/box/{keyId}/{id}` | — | `204` (수신 확인 → 즉시 삭제) |
| DELETE | `/box/{keyId}` | — | `204` (전체 비우기, 페어링 해제 시) |
| GET | `/health` | — | `200 { "ok": true, "ttlHours": 24 }` |

- 서버 id 는 시간순 정렬 가능한 문자열(ULID 또는 `<epoch ms>-<seq>`).
- `keyId` 형식 검증: `^[0-9a-f]{16}$`. 봉투 크기 제한 256KB. 오류는 `{ "error": "…" }`.
- 폴링 권장 주기: PC 5초(앱 활성) / 30초(비활성). 폰은 앱 실행 시·수동 새로고침 시 `for=phone` 조회.
- 롱폴링(선택): `GET /box/{keyId}?for=pc&wait=25` → 새 항목이 올 때까지 최대 25초 대기.

### 4.1 로그인으로 연결 (웹 앱 · 공개 중계 ntfy.sh)
폰·PC 모두 웹 앱일 때 QR 대신 쓰는 방식. 서버 쪽 계정은 없다. 구현: `packages/core/src/login.ts`, `NtfyClient`(`packages/core/src/sync.ts`).
- 키: `K = PBKDF2-SHA256(비밀번호, salt = "nuga-login-v1|" + 아이디(앞뒤 공백 제거·소문자), 210000회, 256비트)`. `keyId` 는 1장과 같다. 같은 아이디·비밀번호 = 같은 K. 비밀번호는 저장하지 않는다.
- 설정: `sync.transport = "ntfy"`, `sync.relayUrl = "https://ntfy.sh"`, `sync.login = { id, at }` (`at` = 로그인한 유닉스 초 − 30, 그 뒤 메시지만 받는다). 기기 역할(PC·폰)은 문서가 아니라 기기의 `localStorage["nuga.role"]`.
- 통로(topic): PC 가 받는 것 `nuga-<keyId>-pc`, 폰이 받는 것 `nuga-<keyId>-ph`. 메시지 본문 = 2장의 봉투 JSON 그대로 (`POST https://ntfy.sh/<통로>`, text/plain).
- 조각: 봉투 글이 3500자를 넘으면 `{"nuga":"c1","m":<묶음 id>,"i":<0..n-1>,"n":<개수>,"d":<글 조각>}` 로 나눠 보낸다(ntfy 메시지 한도 4KB). 받는 쪽은 `m` 으로 모아 합친다. 머리(i=0) 조각이 없는 묶음은 건너뛰고, 머리가 있는데 45초 넘게 덜 온 묶음도 건너뛴다(막히지 않게).
- 받기: `GET https://ntfy.sh/<통로>/json?poll=1&since=<유닉스 초>` (줄 단위 JSON, `event = "message"` 만). ntfy 는 since 의 그 초를 포함해 돌려주므로, 받는 쪽은 '이어 받을 위치' = `c:<초>:<그 초에 받은 id,…>` 를 `sync.lastPulledId` 에 두고 그 초에 이미 받은 id 는 뺀다. 서버에서 지우지 않는다(ack 없음, 12시간 뒤 사라짐). 같은 기록이 다시 와도 id 로 합쳐진다(3.1).
- 바로 받기: 기기마다 실시간 연결 하나 `EventSource(https://ntfy.sh/<통로>[,<자리표>]/sse)` (여러 통로를 쉼표로 묶어 한 연결, `apps/desktop/src/lib/relayStream.ts`). 내 통로에 메시지가 오면 한 바퀴(1초에 한 번까지). 연결의 open · keepalive(45초) 에 실린 `time` 으로 중계 서버 시각을 안다. 확인용 폴링은 연결이 살아 있으면 5분(가려지면 15분), 없으면 60초(가려지면 180초). 429(요청이 많음)를 받으면 20초, 하루 메시지 한도(code 42908)면 보내기만 막히므로 받기는 계속하고 1분 뒤 다시.
- 흐름: 폰이 처음 `ping` → PC 가 config 를 곧바로 보냄(폰은 받은 반·시간표·진도·이름을 '폰 연결' 영역에 채움) → 폰에서 저장한 기록은 `records`(from=phone) → PC 는 쉬는 시간 기록 팝업 → PC 가 채운 기록은 `records`(from=pc)로 되돌림. PC 는 폰에서 온 기록 id 만 되보내고 기록 메시지는 한 번에 묶는다(하루 메시지 수 절약).
- 공개 테스트 계정으로 연결한 PC 는 데모 데이터가 아니면 config 의 `roster` 를 null 로 보낸다.

### 4.2 테스트 아이디의 자리 (중복 로그인 막기 · 관리자 로그아웃)
테스트 아이디는 `nuga-test-01` … `nuga-test-10` (비밀번호는 `TEST_LOGIN.password`, 예전 `nuga-test` 는 다시 고르게 한다). 아이디 하나 = PC 자리 1 + 폰 자리 1. 구현: `packages/core/src/seats.ts`(규칙), `admin.ts`(서명), `apps/desktop/src/lib/seats.ts`(중계와 잇기).
- 자리표: 공개 통로 `SEAT_TOPIC` 하나 (암호화하지 않음). 줄 세 가지:
  - `{"nuga":"s1","t":"hold","n":1..10,"r":"pc"|"ph","sid":<16 hex>,"dev":<브라우저 · OS, 24자>}` — 이 자리를 쓴다. `sid = SHA-256("nuga-seat-v1|" + secret)` 앞 8바이트, secret(32 hex)은 그 기기에만(`localStorage["nuga.seat"]`).
  - `{"nuga":"s1","t":"free","key":<secret>}` — 뗀다. secret 을 가진 기기만 자기 자리를 뗄 수 있다.
  - `{"nuga":"adm1","p":<정해진 순서의 JSON 글자>,"s":<ECDSA P-256 / SHA-256 서명 r||s, base64url>}`, p = `{"act":"logout","sids":[…],"v":1}` — 관리자 로그아웃. 코드의 관리자 공개키(`adminKey.ts`)로 서명이 맞는 것만 따른다. sid 는 로그인마다 새로 생기므로 같은 명령을 누가 다시 보내도 그 뒤 로그인은 영향이 없다.
- 계산(`foldSeats`): 줄을 (중계 시각, hold→kick→free, 줄 id) 순서로 읽는다. 빈 자리(또는 마지막 hold 뒤 60분(`SEAT_TTL`)이 지난 자리)의 hold 는 그 sid 의 것, 같은 sid 의 hold 는 시간 연장, 다른 sid 가 쓰는 중이면 무시(= 중복 로그인 막힘). free · kick 된 sid 는 끝나 다시 못 쓰고, sid 하나는 자리 하나에만. '지금' = max(중계 서버 시각, 마지막 줄 시각).
- 로그인: 실시간 연결(자리표 + 내 통로)을 먼저 열고 → 자리표 전체 조회(`since=all`) → 비었으면 hold → 2초 뒤 다시 조회해 내 것이면 로그인. 동시에 잡으면 위 순서로 한쪽만.
- 쓰는 동안: 누름 · 입력 · 기록 도착 때 마지막 hold 가 30분(`SEAT_RENEW_AFTER`)보다 오래됐으면 hold 를 다시 적는다 → 마지막으로 쓴 뒤 30분 안에는 풀리지 않고, 늦어도 60분이면 풀린다. 안 쓰는 기기는 아무것도 보내지 않는다.
- 자리를 잃었는지는 '빠짐없는 자리표'(연결이 열린 뒤 시작한 조회가 성공했고 그 뒤 연결이 다시 열리지 않음)에서만 판단해 로그아웃시킨다: 관리자 로그아웃 · 다른 기기가 먼저 잡음 · 오래 안 써서 풀린 뒤 다른 기기가 씀.
- 관리자 키: `tools/admin-key.mjs rotate` 가 P-256 키 쌍과 무작위 26자(130비트) 비밀번호를 만든다. 코드에는 공개키(65바이트)와 `blob` = 1(판) + 4(PBKDF2 반복 60만) + 16(소금) + 12(iv) + AES-256-GCM(개인키 스칼라 d 32 + 표 16)만, 비밀번호는 관리자 PC 의 `~/.nuga/admin-password.txt` 에만. 키를 바꾸면 새 키 쌍을 만든다(옛 blob 은 git 기록에 남으므로).
- 한계: 테스트 비밀번호가 공개돼 있어 코드를 고쳐 쓰는 사람은 빈 자리를 잡거나 hold 를 계속 적어 자리를 붙잡을 수 있다(관리자가 sid 를 로그아웃시키면 그 sid 는 끝난다). 막는 것은 남의 자리 떼기와 관리자 흉내다.

## 5. 워치 ↔ 폰 (Wear OS Data Layer)
- 워치 → 폰: MessageClient path `/nuga/record`, 본문 = Record JSON (UTF-8). 실패 시 워치 로컬 큐(Room/DataStore)에 보관 후 재시도.
- 폰 → 워치: DataClient path `/nuga/config`, 본문 = 3.3 config JSON 에서 `roster` 를 제거한 것.
- 폰 → 워치: MessageClient path `/nuga/ack`, 본문 = `{ "id": "uuid" }`.

## 6. PC 로컬 저장 (JSON 문서)
```json
{ "version": 1,
  "settings": { ...3.3 의 school/categories/periods/timetable/progress/options, "targetLength": { "세특": 370 }, "lowRecordThreshold": 1,
                "sync": { "keyB64": "…", "keyId": "…", "relayUrl": "…", "pcName": "…", "pairedAt": "ISO", "shareRoster": false } | null,
                "ai": { "enabled": false, "provider": "anthropic" | "local", "apiKey": "", "model": "claude-sonnet-5-5" } },
  "students": [ { "class": "2-3", "no": 2, "name": "이서연", "level": "A" | "B" | "C" } ],
  "records": [ Record ],
  "performances": [ { "id", "class", "no", "title", "date", "file": null | "data:…", "ocrText": "", "excerpt": "", "matched": true } ],
  "drafts": [ { "id", "class", "no", "field": "세특", "text": "", "length": 0,
               "sentences": [ { "text": "…", "evidence": ["record-id"] } ],
               "evidence": ["record-id", "perf-id"], "status": "draft" | "saved",
               "review": { "result": "pass" | "check" | "fix" | "none", "issues": [ { "kind", "message", "sentenceIndex", "span" } ] },
               "history": [ { "role": "user" | "assistant", "text": "…", "at": "ISO" } ], "updatedAt": "ISO" } ],
  "devices": [ { "deviceId", "name", "lastSeen" } ] }
```

## 7. AI 요청 (PC → Claude·Gemini·OpenRouter·로컬 LLM) — 식별 정보 제거
`class`·`no`·`name` 은 절대 포함하지 않는다. 도달 정도는 숫자·등급이 아니라 표현 방향(서술어 강도·어휘)으로만 들어간다.
응답 JSON: `{ "text": "…", "sentences": [ { "text": "…", "evidence": ["r1"], "spans": [ { "text", "kind" } ] } ], "checks": [] }`.
제공자별 형식 강제: Anthropic `output_config.format`, Gemini `responseSchema`, OpenAI 호환 `response_format.json_schema`. OpenRouter 는 `provider.data_collection = "deny"`.
스크립트 발언을 외부 LLM 으로 보낼 때는 명단 이름을 `○○○` 로 가린다(`scrubTranscriptNames`).
