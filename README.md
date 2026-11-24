# 개인정보 문서 작성실

개인정보 항목을 분류하고 동의서·고지서를 작성하는 웹 앱입니다. 3단계의 ‘법령 검색·근거 추가’에서는 국가법령정보센터의 검색 결과와 조·항·호 목록에서 조문을 선택합니다. AI 검색에서는 OpenRouter가 법령 후보를 제안하고, Python 서버가 국가법령정보센터 API에서 현행 조문과 개인정보 보호법의 연결 조항을 대조합니다.

Python 3.12 이상이면 별도 서버 패키지 설치가 필요 없습니다.

```sh
python3 server.py
```

로컬 컴퓨터에서 실행했다면 브라우저에서 `http://127.0.0.1:3000`을 엽니다. API를 쓰려면 먼저 [키 보관·배포·테스트 안내](docs/step3-api.md)를 따라 `.env`를 설정하세요. Python의 `http.server`만 실행하면 API 기능은 동작하지 않습니다.

키 없이 화면만 확인하려면 다음처럼 명시적으로 시연 모드를 켭니다.

```sh
LAW_SEARCH_DEMO=true python3 server.py
```

홈의 **예시로 시작 → 다음 단계 → 분류 확정 후 다음 → 검색 방식: 화면 시연** 순서로 확인합니다. 시연 결과는 실제 API 검증으로 표시되지 않으며 고지 전환의 근거가 되지 않습니다.

```sh
node --test tests/basis.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

UI와 PDF·HWPX 회귀 검증은 Playwright와 Chromium이 설치된 개발 환경에서 서버를 실행한 뒤 `node tests/browser.cjs`로 실행합니다. 이 저장소에는 Playwright를 애플리케이션 의존성으로 추가하지 않았습니다. 설치 방법과 실제 API 검증 명령은 위 안내에 있습니다.
