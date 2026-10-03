# 누가 서버 (참고 구현)

Cloudflare Worker 한 파일(`worker.js`)과 KV 하나로 돌아가는 누가 앱의 서버입니다. npm 의존성은 없습니다.

| 기능 | 주소 | 서버에 남는 것 |
| --- | --- | --- |
| 상태 | `GET /health` | 없음 |
| 암호화 전달함 | `POST/GET /box/{channel}`, `POST /box/{channel}/ack` | 암호문만, 가져가면 삭제, 최대 7일 · 1건 16KB · 채널당 500건 |
| AI 대행(Gemini) | `POST /ai/transcribe`(multipart `audio`, 약 14MB까지), `/ai/suggest`, `/ai/draft` | 없음(open 모드의 하루 호출 수만) |
| 학교 정보 | `GET /school/search?name=`, `/school/timetable?office&code&kind&from&to&grade`, `/school/calendar?office&code&from&to` | 없음 |
| 웨일 스페이스 로그인 | `GET /auth/whalespace?return=&role=`, `/auth/whalespace/callback` | 로그인 state 10분 |

모든 응답은 JSON이고 CORS(`*`)가 붙습니다. 오류는 `{ "error": "코드" }` 모양입니다.

## 점검

```
cd whale/server
npm test        # node test/harness.mjs — 가짜 KV·가짜 외부 응답으로 점검, 끝에 ALL PASS
```

## 배포 순서

1. Cloudflare 계정을 만들고 Wrangler에 로그인합니다.
   ```
   npm install -g wrangler
   wrangler login
   ```
2. KV 저장소를 만들고, 나온 `id`를 `wrangler.toml`의 `[[kv_namespaces]]` `id`에 넣습니다.
   ```
   wrangler kv namespace create NUGA_KV
   ```
3. 비밀 값을 넣습니다. (없는 값은 건너뛰면 그 기능만 꺼집니다. `/health`의 `features`로 확인)
   ```
   wrangler secret put GEMINI_API_KEY       # Google AI Studio 키 → AI 대행
   wrangler secret put NEIS_KEY             # 나이스 교육정보 개방 포털 인증키 → 학교 검색·시간표·학사일정
   wrangler secret put HOLIDAY_KEY          # 공공데이터포털 특일 정보(SpcdeInfoService) 일반 인증키(Decoding)
   wrangler secret put TOKEN_SECRET         # 아무도 모르는 긴 임의 문자열(32자 이상). 바꾸면 기존 로그인이 모두 풀림
   wrangler secret put WHALE_CLIENT_ID      # 웨일 스페이스 App Console에서 받은 값
   wrangler secret put WHALE_CLIENT_SECRET
   ```
4. `wrangler.toml`의 `[vars]`를 고칩니다.

   | 이름 | 기본값 | 뜻 |
   | --- | --- | --- |
   | `AI_ACCESS` | `token` | `token`: 웨일 스페이스 교사 토큰이 있어야 AI 사용 / `open`: 토큰 없이, IP당 하루 한도 |
   | `OPEN_AI_DAILY` | `30` | `open` 모드에서 IP당 하루 AI 호출 수(한국 시간 기준 날짜) |
   | `ALLOWED_RETURN` | (없음) | 로그인 뒤 돌아갈 앱 주소의 origin, 쉼표로 여러 개. 예: `https://nuga.example.kr,https://abc.github.io`. `http://localhost`·`http://127.0.0.1`은 개발용으로 늘 허용, `file:`은 거부 |
   | `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini 모델 이름 |
   | `WHALE_AUTH_URL` | `https://auth.whalespace.io/oauth2/v1.1/authorize` | 미검증 |
   | `WHALE_TOKEN_URL` | `https://auth.whalespace.io/oauth2/v1.1/token` | 미검증 |
   | `WHALE_USERINFO_URL` | `https://www.whalespaceapis.com/v1/users/me` | 미검증 |
   | `WHALE_SCOPE` | `openid profile` | 미검증 |

5. 배포합니다.
   ```
   wrangler deploy
   ```
   나온 주소(`https://nuga-server.<계정>.workers.dev`)를 앱 설정의 서버 주소에 넣고, `GET /health`로 켜진 기능을 확인합니다.
6. 웨일 스페이스 App Console의 Redirect URI에 `https://<서버 주소>/auth/whalespace/callback`을 등록합니다.

## 지켜지는 규칙

- 전달함 KV 값은 앱이 봉한 `iv.암호문`(b64url) 문자열 그대로입니다. 서버는 열쇠가 없어 내용을 읽을 수 없습니다.
- AI 요청에는 정해진 필드만 골라 보냅니다(`name` 등 다른 필드는 버림). 화자는 `화자1·화자2…`로 다시 매기고, 교사 화자·모르는 구간 id의 추천은 버립니다. 세특 초안은 근거 기록 id가 없거나 요청에 없는 id를 댄 문장, 금지 내용(대회·수상·자격증·어학시험·사교육·부모·교외 등)이 든 문장을 버립니다.
- 토큰은 HMAC-SHA256 서명, 12시간. 웨일 스페이스 아이디는 SHA-256 앞 16자(`sid`)로만 남고, 이름은 읽지 않습니다.
- 학생 정보(학번·반·번호·이름)는 서버에 오지 않습니다. 교사만 로그인하고, 학생 피드백은 앱이 만드는 QR 쪽지로 전달합니다(서버 저장 없음).

## 확인하지 못한 것 (실제 배포 전 점검 필요)

- **웨일 스페이스 OAuth**: 인증·토큰·userinfo 주소, scope, userinfo 응답의 필드 이름(사용자 유형, 학교 코드·교육청 코드, 학생 학년·반·번호의 위치)은 공개 문서로 확인하지 못했습니다. `worker.js`의 `mapUser()`가 여러 이름을 너그럽게 받지만, 실제 응답을 보고 맞춰야 합니다. 사용자 유형을 알 수 없으면 안전하게 `wrong_role`로 처리합니다.
- **Gemini**: 모델 이름, `audio/webm`(opus) 인라인 입력 지원 여부, 데이터 처리·보관 조건(유료 등급 여부). 인라인 요청은 약 20MB가 한계라 14MB 넘는 긴 녹음은 File API 업로드가 필요합니다(미구현).
- **Workers 한도**: 무료 플랜은 요청당 CPU 10ms라 큰 음성의 base64 변환이 넘칠 수 있습니다. 녹음 정리를 쓰려면 유료(Standard) 플랜을 권합니다. 요청 본문 한도(무료 100MB)는 충분합니다.
- **나이스·특일 정보**: 실제 키로 호출해 보지 않았습니다(가짜 응답으로만 점검). 특일 정보 키는 Decoding 키를 넣어야 이중 인코딩이 되지 않습니다.
- **KV 일관성**: KV는 쓰기가 전 세계에 퍼지는 데 최대 60초쯤 걸릴 수 있어, open 모드 하루 한도와 채널당 500건 한도는 대략적인 값입니다.
