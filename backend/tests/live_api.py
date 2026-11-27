"""Opt-in external integration check. --search invokes the paid model once."""
import argparse
import secrets
import json
import os
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import server

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--search', action='store_true', help='OpenRouter 웹 검색·후보 생성·후보별 원문 기반 검토를 요청합니다 (여러 유료 호출 가능)')
parser.add_argument('--review', action='store_true', help='선택한 항목의 적용 전 AI 검토를 실제 요청합니다 (사용료 발생 가능)')
parser.add_argument('--classify', action='store_true', help='항목명 민감정보 가능성 검토를 실제 요청합니다 (사용료 발생 가능)')
args=parser.parse_args()
server.load_env(Path(os.environ.get('APP_ENV_FILE',server.ROOT/'.env')))
required=['LAW_API_OC']+(['OPENROUTER_API_KEY'] if args.search or args.review or args.classify else [])
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
    request={'basisCode':'contract','type':'collect','items':[{'id':'test-item-1','name':'성명','purpose':'근로계약 체결 및 계약서 작성','recipient':'','type':'collect','context':'collect','classification':'general'}]}
    skipped=server.apply_reviewed_basis(request,secrets.token_bytes(32))
    assert skipped['verified'] and not skipped['reviewConfirmed']
    print('PASS 제15조 제1항 전체 조회 및 AI 없이 공식 원문 확인·적용 경로')
    if args.search or args.review or args.classify:
        models=json.loads(server.request_bytes('https://openrouter.ai/api/v1/models'))
        model=os.environ.get('OPENROUTER_MODEL',server.MODEL)
        if not any(m.get('id')==model for m in models['data']):
            raise server.ApiError('설정 모델이 OpenRouter 모델 목록에 없습니다. 모델 ID를 확인하세요.')
    if args.classify:
        classified=server.classify_privacy_items({'items':[{'id':'test-class-1','name':'건강관리 상담 기록','purpose':'건강관리 상담 및 이력 관리'}]})
        assert len(classified['items'])==1
        print('PASS 공식 기준 조문 대조 및 민감정보 API 분류 응답:',classified['items'][0]['verdict'])
    if args.search:
        result=server.search({'items':[{'name':'성명','purpose':'근로계약 체결 및 법정 근로자 명부 작성','recipient':'','type':'collect','context':'collect','classification':'general'}]})
        if not result['candidates']:
            raise server.ApiError('AI 응답은 받았으나 원문 대조를 통과한 후보가 없습니다. 브라우저에서 제외 사유를 확인하세요.')
        print('PASS OpenRouter 웹 검색 → 후보 생성 → 법령 원문·연결 조항·업무 관련성 대조')
        print('확인한 후보:',len(result['candidates']),'제외한 후보:',len(result['rejected']))
    if args.review:
        request={'basisCode':'contract','type':'collect','items':[{'id':'test-item-1','name':'성명','purpose':'근로계약 체결 및 계약서 작성','recipient':'','type':'collect','context':'collect','classification':'general'}]}
        secret=secrets.token_bytes(32)
        outcome=server.review_application(request,secret)
        print('PASS 적용 전 AI 검토 응답 수신:',len(outcome['review']['items']),'개 항목')
        for item in outcome['review']['items']:
            print('검토 상태:',item['verdict'])
        applied=server.apply_reviewed_basis({**request,'reviewToken':outcome['review']['token']},secret)
        assert applied['reviewConfirmed']
        print('PASS AI의 검토 의견과 무관하게 담당자가 적용 요청 가능 (추가 AI 호출 없음)')

except server.ApiError as e:
    print('FAIL',str(e));sys.exit(1)
except Exception:
    print('FAIL 응답 형식 또는 검증 결과를 확인하세요. 인증정보는 출력하지 않았습니다.');sys.exit(1)
