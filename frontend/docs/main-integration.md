# 최신 main과 법률 검토 통합

- 기준 main: `88bcc0d` (홈 화면, 빠른 생성 양식, 항목명 선택·표준화 개선)
- 법률 검토 기준: `f7a4296` (3단계 법령 검색·적용, 선택적 AI 검토)
- 통합 브랜치: `feature/step3-main-integration`

main의 홈 화면·로고·안내창·빠른 생성·항목 선택 UI를 유지하면서, 법률 검토 코드와 서버를 병합했습니다. 충돌이 난 앱 초기화·화면 렌더링·스타일·스크립트 로딩·환경 파일 제외 규칙을 통합했습니다. 새 문서를 빠른 생성으로 시작하면 이전 문서의 법령 검색 결과와 임시 입력도 초기화합니다.

기존 `.env` 파일을 새 폴더의 `server.py` 옆에 복사하고 `python server.py`로 실행하세요. 이미 실행 중인 서버는 Ctrl+C로 종료하고 새 폴더에서 다시 실행합니다. 브라우저는 `http://127.0.0.1:3000`에서 Ctrl+F5로 새로고침합니다. API 키는 브라우저 코드에 넣지 않습니다.

검증 명령:

```sh
python -m unittest discover -s backend/tests -p 'test_*.py'
node --test frontend/tests/basis.test.cjs
```

Playwright·Chromium이 있는 검증 환경에서 시연을 허용한 서버를 실행한 후:

```sh
TEST_BASE_URL=http://127.0.0.1:3005 node frontend/tests/browser.cjs
```

브라우저 검증은 최신 main의 빠른 생성과 항목 선택 UI로 시작합니다. 법령 검색·선택·숨김 복원·스크롤 로딩·선택적 AI 검토·적용·PDF/HWPX 출력, 새 문서 생성 시 이전 검토 결과 초기화를 확인합니다. API 응답은 합성 데이터이며 실제 API 인증을 입증하지 않습니다. 실제 API 테스트와 Windows 설정은 [3단계 API 안내](../../backend/docs/step3-api.md)를 참고하세요.
