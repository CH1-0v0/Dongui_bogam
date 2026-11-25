# Cloudflare Workers 무료 플랜 배포

운영 서버는 `cloudflare/worker.mjs`와 `cloudflare/legal.mjs`입니다. 기존 `server.py`는 로컬 테스트용으로 유지합니다. Python 서버·컨테이너·유료 Durable Objects·별도 데이터베이스를 운영에 사용하지 않습니다. 페이지와 API를 하나의 Workers 주소에서 제공합니다.

Cloudflare 무료 사용량·CPU·메모리·외부 요청 제한 내에서 운영하는 구성입니다. 유료 플랜으로 자동 변경하지 않습니다. 무료 한도 초과 시 서비스 요청이 실패할 수 있습니다. 특히 큰 법령의 전체 조문 목록은 실제 배포 후 CPU 사용량 확인이 필요합니다. OpenRouter 모델 호출 요금은 Cloudflare 요금과 별개입니다.

## 설치와 로그인

Node.js 22.13 이상과 npm을 설치한 뒤 프로젝트 폴더에서 실행합니다. Wrangler 버전은 lockfile에 고정되어 있습니다.

```sh
npm ci
npx wrangler login
npx wrangler whoami
```

원격 Codex 환경처럼 로컬 콜백을 받을 수 없으면:

```sh
npx wrangler login --device --browser=false
```

CLI가 출력한 공식 URL과 일회용 코드를 본인 브라우저에서 승인합니다. 계정 비밀번호·API 토큰을 채팅이나 Git 파일에 쓰지 마세요. 이 작업 환경에는 Cloudflare 인증·배포를 위한 `dash.cloudflare.com`, `api.cloudflare.com`, 로그인 화면의 `challenges.cloudflare.com` 접속 허용이 필요합니다. 설정 초안 저장과 실제 환경 적용은 별개입니다.

## 배포 및 Secrets

```sh
npm run check:cloudflare
npm run deploy
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put LAW_API_OC
```

첫 배포는 키가 없어도 화면이 열리며 API는 설정 안내를 반환합니다. `secret put`의 비공개 입력란에 해당 키를 입력하면 됩니다. 키를 명령 뒤 인자로 붙이지 마세요. 또는 Cloudflare 대시보드 → Workers & Pages → dongui-bogam → Settings → Variables and Secrets에서 **Secret** 유형으로 추가합니다. 저장 후 필요한 경우 Deploy를 진행합니다. 평문 변수로 등록하지 마세요.

`OPENROUTER_MODEL`은 비밀값이 아니므로 `wrangler.jsonc`의 일반 변수에 두며 기본값은 `openai/gpt-oss-120b`입니다. Cloudflare 계정 ID나 사용자 도메인은 저장소에 고정하지 않았습니다. 로그인 계정에서 대상을 선택하고 Wrangler가 알려주는 실제 workers.dev 주소를 사용하세요. 프로젝트 이름 충돌 시 `wrangler.jsonc`의 name을 변경합니다.

로컬 `.env`는 Python 서버에서만 사용하며 업로드하지 않습니다. Workers 로컬 시험은 `.dev.vars.example`을 `.dev.vars`로 복사해 비공개 값을 넣습니다. `.env*`, `*.env`, `.dev.vars*`는 빈 예제 파일을 제외하고 Git에서 무시합니다. `dist/`에는 공개 파일 허용 목록만 복사합니다. Worker도 별도 허용 목록으로 비공개 경로를 차단합니다. 비밀값은 코드·HTML·브라우저 응답에 포함하지 않습니다.

## 동작 확인

```sh
npm run dev:cloudflare
npm run test:cloudflare
```

로컬 주소는 Wrangler 출력에서 확인합니다. 브라우저 시험은 다음처럼 실행할 수 있습니다.

```sh
TEST_BASE_URL=http://127.0.0.1:8787 node tests/browser.cjs
TEST_BASE_URL=http://127.0.0.1:8787 node tests/guideline-flow.cjs
```

운영 URL의 `/api/status`에서 `aiConfigured`, `lawConfigured`가 true인지 확인합니다. 이는 설정 존재 여부이며 인증 성공을 보장하지 않습니다. `/.env`, `/key.env`, `/.dev.vars`, `/server.py`는 모두 404여야 합니다. 실제 법령 검색·자동 검색·직접 적용·선택적 AI 검토·민감정보 가능성 분류를 각각 확인하세요. AI 테스트는 유료 호출입니다.

자동 테스트는 합성 법령으로 수행하며 실제 법령을 인용한 것으로 취급하지 않습니다. 서버는 실제 적용 요청 때 원문을 재확인합니다. AI 의견이 부정적이어도 담당자는 직접 등록할 수 있습니다.

## 운영 범위

- Secrets는 요청 시 Worker에서만 읽고 공식 API로 전송합니다. OpenRouter에는 항목명·목적·공식 조문 등 검토에 필요한 데이터가 전송됩니다. 실제 개인의 식별값을 입력하지 마세요.
- 법령 응답은 격리된 Worker 메모리에 짧게 캐시합니다. 입력한 항목·AI 결과·완성 문서는 서버 저장소에 저장하지 않습니다.
- CSRF는 HttpOnly·SameSite 쿠키와 요청 헤더를 대조하므로 isolate가 바뀌어도 유지됩니다. 다른 출처 요청은 차단하며 CORS를 열지 않습니다.
- Cloudflare Rate Limiting binding으로 IP별 API 분당 60회, AI 분당 6회를 제한합니다. 이는 위치별 근사 제한이며 계정 전체의 지출 상한이 아닙니다. OpenRouter에도 예산·키 한도를 설정하세요.
- 일반 로그 수집은 비활성화했습니다. 원문 요청 URL, OC, 키, 사용자 입력, upstream 오류 본문을 직접 기록하지 않습니다.
- JSON 응답과 조문 범위 조회, 요청 내 중복 합치기 및 캐시로 작업량을 줄입니다. 단일 API 요청의 upstream 호출을 40회로 제한합니다.
- 공개 서비스에 로그인·기관별 접근 제한이 필요한 경우 별도 설계가 필요합니다. 현재 화면은 공개 도구이며 소수 사용자 시험부터 시작하세요.

확인되지 않은 상태를 배포 완료나 실제 API 성공으로 보고하지 않습니다. 계정 인증·Secrets 입력·실제 배포·공개 URL 검증이 모두 끝나야 운영 배포 완료입니다.

## Workers 런타임 회귀 검증

`npm run test:cloudflare`에는 Node 기반 정책 검증과 실제 workerd 엔진의 `tests/worker-runtime.cjs`가 포함됩니다. 런타임 검증은 네이티브 fetch를 사용하고 외부 응답만 합성 데이터로 대체합니다. Workers에서 fetch를 객체 메서드로 호출할 때의 Illegal invocation, 지원하지 않는 redirect 옵션, 다른 주소로의 인증정보 전달 방지를 검사합니다. 실서비스의 API 인증 성공을 의미하지는 않습니다.

## 운영 AI 오류 처리

운영 Worker는 JSON 응답 등 필수 요청 매개변수를 지원하는 제공자로 연결합니다. 지정 모델과 데이터 수집 거부 설정은 유지합니다. AI 서버의 500·502·503·504 등의 일시 실패 응답은 전체 35초 범위에서 최대 한 번 다시 요청합니다. 네트워크 단절·인증·잔액·입력 범위 초과·이용 제한·호출 한도 오류는 자동 재시도하지 않습니다. 선택적인 생성 옵션이 거부된 400 오류는 같은 모델·개인정보 보호 설정·메시지·출력 토큰 한도를 유지한 채 호환 요청으로 최대 한 번 재시도합니다. 알려진 옵션이 있으면 그 옵션만 생략하고, 구분할 수 없으면 JSON 응답 지정·reasoning·temperature 선택 옵션을 생략합니다. 프롬프트의 JSON 요청과 응답 구조·공식 조문 검증은 유지합니다. 일시 오류와 호환 재시도를 합해 한 요청의 총 시도는 최대 2회입니다. 재시도는 별도 upstream 요청이므로 모델 제공자의 과금 정책에 따라 호출 비용이 발생할 수 있습니다.

화면에는 오류 상태 번호와 정해진 안내만 반환합니다. 외부 응답이 API 키·사용자 입력을 포함할 수 있으므로 원문 메시지나 metadata를 그대로 표시·기록하지 않습니다. 개인정보 보호 조건에 맞는 제공자가 없는 경우에도 보호 설정을 자동 완화하지 않습니다. 실제 실패한 요청의 원인은 해당 상태를 확인해야 하며, 자동 테스트가 계정 인증이나 실서비스 성공을 입증하지는 않습니다.

## 비용과 제공자 우선순위

`openai/gpt-oss-120b`는 유지하며 DeepInfra → Groq → Cerebras 순으로 우선 연결합니다. 공개 모델 API가 JSON 응답 지원을 표시한 제공자들입니다. 2026-11-25 조회 기준 백만 토큰당 입력/출력 가격은 DeepInfra $0.037/$0.17, Groq $0.15/$0.60, Cerebras $0.35/$0.75였습니다. 가격은 제공자·시점에 따라 달라질 수 있으며 실제 지연 시간은 계정에서 확인해야 합니다. 우선순위 지정은 성공이나 일정한 속도를 보증하지 않습니다.

실패 재시도 시 다음 우선 제공자로 이동합니다. 기존 개인정보 보호 조건과 필수 매개변수 지원 필터는 유지하고, 사용자가 다른 모델을 설정하면 이 모델 전용 우선순위를 적용하지 않습니다. HTTP 200이어도 빈 답변·JSON 형식 오류는 최대 한 번 재시도합니다. 출력 한도에 잘린 답변과 이용 제한 응답은 성공으로 처리하거나 자동 재시도하지 않습니다. 총 요청 시도는 최대 2회이고 출력 토큰 한도를 자동으로 늘리지 않습니다.

공개 지원·가격 정보: https://openrouter.ai/api/v1/models/openai/gpt-oss-120b/endpoints

## 400 오류 문의 코드

기본 모델을 `openai/gpt-oss-120b`로 복구했습니다. AI 오류에는 `AI-실제HTTP상태-응답내오류상태-식별자` 문의 코드가 표시됩니다. 예를 들어 AI-200-400은 HTTP 200 응답 안의 오류 코드 400이며, AI-400-400은 HTTP 요청 자체가 400으로 거부된 경우입니다. 같은 문의 코드로 Cloudflare 실시간 로그에서 실제 오류를 찾을 수 있습니다. 브라우저에는 외부 오류 원문을 반환하지 않습니다.
