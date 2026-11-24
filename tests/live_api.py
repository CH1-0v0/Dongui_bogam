"""Opt-in external integration check. --search invokes the paid model once."""
import argparse
import secrets
import json
import os
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--search', action='store_true', help='OpenRouter에 실제 검색 1회를 요청합니다 (사용료 발생 가능)')
parser.add_argument('--review', action='store_true', help='선택한 항목의 적용 전 AI 검토를 실제 요청합니다 (사용료 발생 가능)')
args=parser.parse_args()
server.load_env(Path(os.environ.get('APP_ENV_FILE',server.ROOT/'.env')))
required=['LAW_API_OC']+(['OPENROUTER_API_KEY'] if args.search or args.review else [])
missing=[name for name in required if not os.environ.get(name)]
if missing:
    print('미실행: 서버 전용 환경 파일에 다음 변수를 설정하세요: '+', '.join(missing))
    sys.exit(2)
try:
    result=server.verify_with_basis({'law':'개인정보 보호법','article':'15','paragraph':'1','clause':'4','basisCode':'contract'})
    assert result['verified'] and result['pipaVerified'] and result['excerpt']
    print('PASS 국가법령정보센터 검색 → 현행법령 식별 → 제15조 제1항 제4호 본문 조회')
    print('확인 시점:',result['verifiedAt'],'시행일:',result['effectiveDate'])
    assert result['pipaParagraph']['paragraph']=='1' and not result['pipaParagraph']['clause']
    request={'basisCode':'contract','type':'required','items':[{'id':'test-item-1','name':'성명','purpose':'근로계약 체결 및 계약서 작성','recipient':'','type':'required','context':'collect','classification':'general'}]}
    skipped=server.apply_reviewed_basis(request,secrets.token_bytes(32))
    assert skipped['verified'] and not skipped['reviewConfirmed']
    print('PASS 제15조 제1항 전체 조회 및 AI 없이 공식 원문 확인·적용 경로')
    if args.search or args.review:
        models=json.loads(server.request_bytes('https://openrouter.ai/api/v1/models'))
        model=os.environ.get('OPENROUTER_MODEL',server.MODEL)
        if not any(m.get('id')==model for m in models['data']):
            raise server.ApiError('설정 모델이 OpenRouter 모델 목록에 없습니다. 모델 ID를 확인하세요.')
    if args.search:
        result=server.search({'items':[{'name':'성명','purpose':'근로계약 체결 및 법정 근로자 명부 작성','recipient':'','type':'required','context':'collect','classification':'general'}]})
        if not result['candidates']:
            raise server.ApiError('AI 응답은 받았으나 원문 대조를 통과한 후보가 없습니다. 브라우저에서 제외 사유를 확인하세요.')
        print('PASS OpenRouter 후보 검색 → 법령 API 원문 및 개인정보 보호법 연결 조항 대조')
        print('확인한 후보:',len(result['candidates']),'제외한 후보:',len(result['rejected']))
    if args.review:
        request={'basisCode':'contract','type':'required','items':[{'id':'test-item-1','name':'성명','purpose':'근로계약 체결 및 계약서 작성','recipient':'','type':'required','context':'collect','classification':'general'}]}
        secret=secrets.token_bytes(32)
        outcome=server.review_application(request,secret)
        print('PASS 적용 전 AI 검토 응답 수신:',len(outcome['review']['items']),'개 항목')
        for item in outcome['review']['items']:
            print('검토 상태:',item['verdict'])
        if outcome['review']['canApply']:
            applied=server.apply_reviewed_basis({**request,'reviewToken':outcome['review']['token']},secret)
            assert applied['reviewConfirmed']
            print('PASS 검토 결과를 확인하고 적용 요청 검증 (추가 AI 호출 없음)')
        else:
            print('적용하지 않음: AI가 추가 확인 또는 근거 보완이 필요하다고 응답했습니다.')
except server.ApiError as e:
    print('FAIL',str(e));sys.exit(1)
except Exception:
    print('FAIL 응답 형식 또는 검증 결과를 확인하세요. 인증정보는 출력하지 않았습니다.');sys.exit(1)
