"""Validate frontend/tests/final-layout.cjs exports, including both HWPX line-spacing branches."""
import zipfile,xml.etree.ElementTree as ET
from pathlib import Path
ns={'h':'http://www.hancom.co.kr/hwpml/2011/head','p':'http://www.hancom.co.kr/hwpml/2011/paragraph'}
with zipfile.ZipFile('.test-output/final-layout.hwpx') as z:
    head=ET.fromstring(z.read('Contents/header.xml'));body=ET.fromstring(z.read('Contents/section0.xml'))
for paragraph in body.findall('.//p:tc//p:p',ns):
    prop=head.find(f'.//h:paraPr[@id="{paragraph.get("paraPrIDRef")}"]',ns)
    spacings=prop.findall('.//h:lineSpacing',ns)
    assert spacings and all(s.get('type')=='PERCENT' and s.get('value')=='130' for s in spacings)
props=head.find('.//h:paraProperties',ns);assert int(props.get('itemCnt'))==len(props)
text=lambda n:''.join(n.itertext())
for table in body.findall('.//p:tbl',ns):
    cells=table.findall('p:tr/p:tc',ns)
    if not cells: continue
    if text(cells[0]).strip()=='구분':
        width=int(table.find('p:sz',ns).get('width'))
        assert int(cells[0].find('p:cellSz',ns).get('width'))<width*.12
    if table.get('borderFillIDRef')=='3':
        margin=table.find('p:inMargin',ns)
        assert int(margin.get('top'))>=400 and int(margin.get('bottom'))>=400
assert all(p.get('breakNonLatinWord')=='KEEP_WORD' for p in head.findall('.//h:breakSetting',ns))
children=list(body)
normalized=lambda n:''.join(text(n).split())
date=next(i for i,p in enumerate(children) if normalized(p)=='년월일')
assert not text(children[date+1]).strip()
agency=next(i for i,p in enumerate(children) if normalized(p)=='최종서식검증기관귀중')
assert not text(children[agency-1]).strip() and not text(children[agency-2]).strip()
assert '거부할 경우,' not in text(body)
print('PASS HWPX narrow classification column, generous vertical margins, word wrapping and extra date/agency spacing')

questions=[p for p in body.findall('.//p:p',ns) if '☞' in text(p) and '동의하십니까?' in text(p) and p.find('.//p:tbl',ns) is None]
assert len(questions)==7,len(questions)
assert all(text(q).startswith((' ☞','\u00a0☞')) for q in questions)
for name in ['목적 외 이용','목적 외 제공','홍보 또는 마케팅 관련']:
    assert sum(name in text(q) for q in questions)==1
assert all('수집 목적 외 제공' not in text(q) for q in questions)
styles={s.get('id'):s for s in head.findall('.//h:charPr',ns)}
marketing=next(p for p in body.findall('.//p:p',ns) if text(p).startswith('제공하신 연락처'))
assert styles[marketing.find('p:run',ns).get('charPrIDRef')].get('height')=='1000'
print('PASS every HWPX table paragraph has 130% in case/default, seven scoped choices, leading space and normal-size marketing notice')
try:
    import fitz
except ImportError:
    print('SKIP PDF page/text checks: PyMuPDF unavailable')
else:
    pdf=fitz.open('.test-output/final-layout.pdf');assert len(pdf)>=2
    assert any(d['rect'].width>510 and d['rect'].y0<50 for d in pdf[0].get_drawings())
    all_text=''.join(''.join(p.get_text().split()) for p in pdf)
    assert all_text.count('동의하십니까?')==7
    assert '목적외이용에동의하십니까?' in all_text and '목적외제공에동의하십니까?' in all_text
    assert '홍보또는마케팅관련연락을받는것에동의하십니까?' in all_text
    assert '일반개인정보(필수)의수집·이용에동의하십니까?' in all_text
    assert '일반개인정보(선택)의수집·이용에동의하십니까?' in all_text
    pdf[0].get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save('.test-output/final-pdf-first.png')
    print('PASS A4 multi-page PDF retains all seven scope-specific choices and combined general table')
