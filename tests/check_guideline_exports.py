"""Inspect synthetic exports created by tests/guideline-flow.cjs."""
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET
import subprocess
import shutil

out=Path('.test-output');ns={'p':'http://www.hancom.co.kr/hwpml/2011/paragraph','h':'http://www.hancom.co.kr/hwpml/2011/head'}
with zipfile.ZipFile(out/'guideline-output.hwpx') as z:
    body=ET.fromstring(z.read('Contents/section0.xml'));head=ET.fromstring(z.read('Contents/header.xml'))
styles={s.get('id'):s for s in head.findall('.//h:charPr',ns)}
colors={s.get('textColor').upper() for s in styles.values()}-{'#000000','#FFFFFF'}
assert colors=={'#2154C7'}, colors
for border_id in ['3','4']:
    border=head.find(f'.//h:borderFill[@id="{border_id}"]',ns)
    for side in ['left','right','top','bottom']:
        edge=border.find('h:'+side+'Border',ns)
        assert edge.get('color')=='#000000' and edge.get('width')=='0.12 mm' and edge.get('type')=='SOLID'
text=lambda n:''.join(n.itertext()).strip()
children=list(body)
title=next(i for i,p in enumerate(children) if text(p)=='작성지침 반영 검증 문서')
assert not text(children[title+1]);assert not text(children[title+3])
guardian=next(i for i,p in enumerate(children) if text(p)=='만 14세 미만 아동의 법정대리인 동의')
assert not text(children[guardian-1])
all_text=text(body);assert '☞' in all_text and '정보주체:' in all_text and '법정대리인:' in all_text
relationship=next(p for p in body.findall('.//p:p',ns) if text(p).startswith('아동과의 관계:'))
white=[r for r in relationship.findall('p:run',ns) if styles[r.get('charPrIDRef')].get('textColor')=='#FFFFFF']
assert white and any(text(r).endswith('.') for r in white)
assert all(styles[r.get('charPrIDRef')].find('h:underline',ns).get('type')=='BOTTOM' for r in white)
cell=next(c for c in body.findall('.//p:tc',ns) if '성명' in text(c) and '건강정보' in text(c))
for name,important in [('성명',False),('건강정보',True),('여권번호',True),('주민등록번호',True)]:
    run=next(r for r in cell.findall('.//p:run',ns) if text(r)==name)
    style=styles[run.get('charPrIDRef')]
    assert (style.find('h:bold',ns) is not None)==important
    assert style.get('textColor')==('#2154C7' if important else '#000000')
    assert int(style.get('height')) >= (1200 if important else 1000)
assert all(int(p.get('itemCnt'))==len(p) for p in head.findall('.//h:charProperties',ns))
print('PASS HWPX blue consistency, black 0.12mm borders, paragraph spacing, signatures, visible underline and selective importance')
if shutil.which('pdftotext'):
    pdf=subprocess.check_output(['pdftotext','-raw',str(out/'guideline-output.pdf'),'-'],text=True)
    normalized=''.join(pdf.split())
    assert normalized.count('건강정보')==1 and normalized.count('주민등록번호')==1
    assert '고지사항' in normalized and normalized.index('고지사항')>normalized.index('법정대리인:')
    print('PASS PDF preserves separate notice after consent/signatures and batches special fields once')

try:
    import fitz
except ImportError:
    print('SKIP PDF span styling: PyMuPDF is unavailable')
else:
    spans=[span for page in fitz.open(out/'guideline-output.pdf') for block in page.get_text('dict')['blocks'] for line in block.get('lines',[]) for span in line['spans']]
    ordinary=next(span for span in spans if '성명' in span['text'])
    health=next(span for span in spans if '건강정보' in span['text'])
    assert ordinary['size'] < health['size'] and ordinary['color'] != health['color']
    assert health['size'] >= ordinary['size']*1.2-0.01
    print('PASS mixed PDF cells preserve normal personal items and 20%-larger important items separately')
