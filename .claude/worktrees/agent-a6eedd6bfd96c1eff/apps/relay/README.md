# @nuga/relay — 누가 릴레이 서버

폰(워치)과 PC 사이에서 **암호문 봉투만 잠시 맡아 두는 우편함**입니다.
`docs/PROTOCOL.md` 4장(릴레이 서버 HTTP API)을 그대로 구현합니다.

- 서버는 `keyId` · 봉투(`from`, `iv`, `ct`, `ts`) · 수신 시각만 저장하고, **24시간(TTL) 뒤 자동 삭제**합니다.
- 동기화 키 `K`는 서버에 절대 오지 않습니다. 서버는 내용을 읽을 수 없고, 읽을 방법도 없습니다.
- 수신 측이 `DELETE` 로 수신 확인을 보내면 즉시 지웁니다.
- 외부 의존성 없이 Node 내장 모듈(`node:http`, `node:sqlite`)만 사용합니다.

## 요구 사항

- Node.js 22.5 이상 (SQLite 저장소를 쓰려면), **Node 24 권장**.
- `npm install` 불필요 (런타임 의존성 0개).

## 실행

```bash
cd apps/relay
npm start            # http://0.0.0.0:8787, TTL 24시간, 메모리 저장
npm run dev          # 같지만 TTL 1시간
npm test             # node:test 기반 테스트
```

기동하면 접속 가능한 주소가 출력됩니다.

```
[relay] listening on http://0.0.0.0:8787  store=memory  ttl=24h  maxBody=262144B  rateLimit=120/min
[relay] LAN url: http://192.168.0.12:8787
```

## 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `8787` | 수신 포트 |
| `HOST` | `0.0.0.0` | 바인드 주소. 내 PC에서만 쓰려면 `127.0.0.1` |
| `RELAY_TTL_HOURS` | `24` | 봉투 보관 시간(시간 단위). 지난 것은 1분마다 정리 |
| `RELAY_MAX_BODY` | `262144` | 봉투 최대 크기(바이트, 256KB). 초과 시 `413` |
| `RELAY_DB` | (없음) | 지정하면 SQLite 파일에 저장 (`node:sqlite`). 예 `./relay.sqlite` |
| `RELAY_DATA_FILE` | (없음) | 지정하면 메모리 저장소를 JSON 파일에 주기적으로 기록 (SQLite 대안) |
| `RELAY_RATE_LIMIT` | `120` | IP당 분당 요청 수. `0` 이면 비활성. 초과 시 `429` |
| `RELAY_TRUST_PROXY` | `0` | `1` 이면 `Fly-Client-IP` / `X-Forwarded-For` 헤더를 클라이언트 IP로 신뢰 (리버스 프록시 뒤에서만). Fly.io 에서는 자동 |

저장소 우선순위: `RELAY_DB` → `RELAY_DATA_FILE` → 메모리.
메모리 저장은 서버를 끄면 봉투가 사라집니다. 어차피 24시간 안에 사라질 데이터이므로 교실 PC에서 직접 돌릴 때는 보통 충분합니다.

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `POST` | `/box/{keyId}` | 봉투 JSON 을 넣는다 → `201 { "id", "ts" }` |
| `GET` | `/box/{keyId}?for=pc\|phone&after=<id>&wait=<초>` | 봉투 목록 `{ "items": [...] }`. `for=pc` 는 `from=phone` 인 것만(반대도 같음). `after` 이후만, 오래된 순 최대 200개. `wait` 를 주면 새 봉투가 올 때까지 최대 25초 대기(롱폴링) |
| `DELETE` | `/box/{keyId}/{id}` | 수신 확인(즉시 삭제) → `204` |
| `DELETE` | `/box/{keyId}` | 상자 비우기(페어링 해제) → `204` |
| `GET` | `/health` | `{ "ok": true, "ttlHours": 24 }` |

- `keyId` 는 `^[0-9a-f]{16}$` 이어야 하며, 봉투는 `from`(`phone`|`pc`), `iv`(base64), `ct`(base64), `ts`(문자열) 를 모두 가져야 합니다. 그 외 필드는 버립니다.
- 오류는 항상 `{ "error": "코드" }` 입니다. 예: `invalid_key_id`, `invalid_envelope_iv`, `invalid_json`, `body_too_large`, `not_found`, `rate_limited`.
- 서버 id 는 `<epoch ms(36진수 9자리)>-<seq(36진수 4자리)>` 로 문자열 정렬이 시간순과 같습니다.
- CORS 는 전체 허용(`*`), `OPTIONS` 는 `204`.

예시:

```bash
curl -s -X POST localhost:8787/box/0123456789abcdef \
  -H 'Content-Type: application/json' \
  -d '{"from":"phone","iv":"AAAAAAAAAAAAAAAA","ct":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","ts":"2026-05-08T10:12:05+09:00"}'
# {"id":"0mbx9k2l1-0000","ts":"2026-05-08T01:12:05.120Z"}

curl -s 'localhost:8787/box/0123456789abcdef?for=pc'
# {"items":[{"id":"0mbx9k2l1-0000","from":"phone","iv":"...","ct":"...","ts":"..."}]}

curl -s -X DELETE localhost:8787/box/0123456789abcdef/0mbx9k2l1-0000   # 204
```

## 같은 Wi-Fi 직접 전송 (선생님 PC에서 직접 돌리기)

외부 서버 없이, 교실 PC가 릴레이 역할을 합니다. 폰과 PC가 **같은 Wi-Fi** 에 있어야 합니다.

1. PC에서 실행:
   ```bash
   cd apps/relay
   npm start
   ```
   출력된 `LAN url` (예 `http://192.168.0.12:8787`) 을 확인합니다.
   (또는 Windows `ipconfig` / macOS `ifconfig` 로 PC의 IPv4 주소를 확인하고 뒤에 `:8787` 을 붙입니다.)
2. 누가 PC 앱의 페어링 화면에서 **릴레이 URL** 에 그 주소를 넣고 QR 을 만듭니다.
   QR 페이로드의 `r=` 값이 이 주소가 됩니다 (`docs/PROTOCOL.md` 1장).
3. 폰으로 QR 을 찍으면 이후 폰은 이 주소로 봉투를 보냅니다.
4. Windows 방화벽이 처음에 "네트워크 액세스 허용" 을 물으면 **개인 네트워크** 에서 허용합니다.
   학교 Wi-Fi 가 기기 간 통신(AP isolation)을 막아 두었다면 직접 전송이 안 되므로 외부 릴레이를 씁니다.

PC 앱과 릴레이를 같은 PC에서 돌리면 PC 앱은 `http://127.0.0.1:8787` 로, 폰은 LAN 주소로 접근하면 됩니다. 프로토콜은 동일합니다.

같은 Wi-Fi 모드에서는 HTTP(평문) 로 통신하지만, 봉투 자체가 AES-256-GCM 으로 암호화되어 있어 내용은 노출되지 않습니다. 다만 아래 보안 메모를 읽어 두세요.

## 배포 (외부 릴레이)

### Fly.io

`fly.toml` 예시가 들어 있습니다.

```bash
cd apps/relay
fly launch --no-deploy --copy-config      # 앱 이름/리전 확인
fly volumes create relay_data --size 1 --region nrt
fly deploy
fly status                                # https://<앱이름>.fly.dev
curl https://<앱이름>.fly.dev/health
```

- `RELAY_DB=/data/relay.sqlite` 로 볼륨에 저장하므로 머신이 잠들었다 깨어나도 봉투가 남아 있습니다.
- `auto_stop_machines` 가 켜져 있어 트래픽이 없으면 머신이 멈추고, 요청이 오면 다시 깹니다(첫 요청 1~2초 지연).
- HTTPS 는 Fly 프록시가 처리합니다(`force_https = true`).

### Docker / 아무 Node 호스트

```bash
docker build -t nuga-relay .
docker run -d --name nuga-relay -p 8787:8787 \
  -v nuga-relay-data:/data -e RELAY_DB=/data/relay.sqlite nuga-relay
```

또는 Node 24 가 있는 어떤 서버에서든 `PORT=8787 RELAY_DB=./relay.sqlite node src/server.js` 로 실행한 뒤,
Caddy/nginx 같은 리버스 프록시로 HTTPS 를 붙입니다.

Caddy 예시 (`Caddyfile`):

```
relay.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

프록시 뒤에서는 `RELAY_TRUST_PROXY=1` 을 주어야 IP별 속도 제한이 실제 클라이언트 기준으로 동작합니다.
롱폴링(`wait=25`)을 쓰므로 프록시의 읽기 타임아웃은 30초 이상으로 두세요.

## 보안 메모

- **`keyId` 는 곧 접근 권한(capability)입니다.** `keyId` 를 아는 쪽은 그 상자의 봉투를 읽고 지울 수 있습니다.
  `keyId` 는 `SHA-256(K)` 의 앞 8바이트이므로 `K` 를 모르면 추측할 수 없지만, URL 에 노출되므로 다음을 지키세요.
  - 릴레이 URL 과 QR 을 남에게 보여주지 않습니다.
  - 서버 로그는 `keyId` 를 앞 4자리만 남기고 가립니다. 프록시 액세스 로그에는 전체 URL 이 남을 수 있으니 프록시 로그 보관 정책을 확인하세요.
- **HTTPS 를 권장합니다.** 봉투는 E2E 암호화되어 있어 내용은 안전하지만, HTTP 로 쓰면 중간자가 `keyId` 를 보고 봉투를 지우거나(서비스 방해) 오래된 봉투를 다시 넣을 수 있습니다. 외부 릴레이는 반드시 HTTPS(Fly.io 기본 제공, 또는 리버스 프록시)로 노출하세요. 같은 Wi-Fi 직접 전송은 신뢰할 수 있는 네트워크에서만 쓰세요.
- 서버는 `K` 를 받지 않으며 봉투를 복호화하지 않습니다. 저장하는 것은 `keyId`, `from`, `iv`, `ct`, `ts`, 수신 시각뿐입니다. 로그에 본문(암호문 포함)은 남기지 않습니다.
- 봉투는 최대 256KB, IP당 분당 120 요청으로 제한합니다. 필요하면 `RELAY_MAX_BODY`, `RELAY_RATE_LIMIT` 로 조정합니다.
- 페어링을 해제할 때 PC 앱이 `DELETE /box/{keyId}` 를 호출해 남은 봉투를 즉시 지웁니다. 어차피 TTL 이 지나면 자동 삭제됩니다.

## 파일 구성

```
apps/relay/
├── src/server.js        HTTP API, 롱폴링, 속도 제한, TTL 정리, 로그
├── src/store.js         MemoryStore(+JSON 파일), SqliteStore(node:sqlite)
├── src/dev.js           npm run dev (TTL 1시간)
├── test/relay.test.js   node:test + fetch 통합 테스트
├── Dockerfile           node:24-alpine
├── fly.toml             Fly.io 배포 예시
└── README.md
```
