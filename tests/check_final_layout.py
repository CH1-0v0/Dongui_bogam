"""Validate tests/final-layout.cjs exports, including both HWPX line-spacing branches."""
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
    all_text=''.join(''.join(p.get_text().split()) for p in pdf)
    assert all_text.count('동의하십니까?')==7
    assert '목적외이용에동의하십니까?' in all_text and '목적외제공에동의하십니까?' in all_text
    assert '홍보또는마케팅관련연락을받는것에동의하십니까?' in all_text
    assert '일반개인정보(필수)의수집·이용에동의하십니까?' in all_text
    assert '일반개인정보(선택)의수집·이용에동의하십니까?' in all_text
    pdf[0].get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save('.test-output/final-pdf-first.png')
    print('PASS A4 multi-page PDF retains all seven scope-specific choices and combined general table')
