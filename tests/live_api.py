"""Opt-in external integration check. --search invokes the paid model once."""
import argparse
import json
import os
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--search', action='store_true', help='OpenRouter에 실제 검색 1회를 요청합니다 (사용료 발생 가능)')
args=parser.parse_args()
server.load_env(Path(os.environ.get('APP_ENV_FILE',server.ROOT/'.env')))
required=['LAW_API_OC']+(['OPENROUTER_API_KEY'] if args.search else [])
missing=[name for name in required if not os.environ.get(name)]
if missing:
    print('미실행: 서버 전용 환경 파일에 다음 변수를 설정하세요: '+', '.join(missing))
    sys.exit(2)
try:
    result=server.verify_with_basis({'law':'개인정보 보호법','article':'15','paragraph':'1','clause':'1','basisCode':'consent'})
    assert result['verified'] and result['pipaVerified'] and result['excerpt']
    print('PASS 국가법령정보센터 검색 → 현행법령 식별 → 제15조 제1항 제1호 본문 조회')
    print('확인 시점:',result['verifiedAt'],'시행일:',result['effectiveDate'])
    if args.search:
        models=json.loads(server.request_bytes('https://openrouter.ai/api/v1/models'))
        model=os.environ.get('OPENROUTER_MODEL',server.MODEL)
        if not any(m.get('id')==model for m in models['data']):
            raise server.ApiError('설정 모델이 OpenRouter 모델 목록에 없습니다. 모델 ID를 확인하세요.')
        result=server.search({'items':[{'name':'성명','purpose':'근로계약 체결 및 법정 근로자 명부 작성','recipient':'','type':'required','context':'collect','classification':'general'}]})
        if not result['candidates']:
            raise server.ApiError('AI 응답은 받았으나 원문 대조를 통과한 후보가 없습니다. 브라우저에서 제외 사유를 확인하세요.')
        print('PASS OpenRouter 후보 검색 → 법령 API 원문 및 개인정보 보호법 연결 조항 대조')
        print('확인한 후보:',len(result['candidates']),'제외한 후보:',len(result['rejected']))
except server.ApiError as e:
    print('FAIL',str(e));sys.exit(1)
except Exception:
    print('FAIL 응답 형식 또는 검증 결과를 확인하세요. 인증정보는 출력하지 않았습니다.');sys.exit(1)
