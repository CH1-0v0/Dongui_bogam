# 백엔드

`server.py`는 로컬 Python API와 정적 파일 허용 목록, `cloudflare/`는 운영 Worker입니다. `work_assistant.py`와 `cloudflare/assistant.mjs`는 같은 대화 정책을 사용합니다. 저장소 루트에서 `python server.py` 또는 `npm run deploy`를 실행합니다. 비밀 설정은 루트의 비공개 `.env` 또는 Cloudflare Secrets에 둡니다.
