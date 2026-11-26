import defaults from './work-defaults.json' with {type:'json'};
export function workQuestionCategory(q){return /주민등록번호|민감정보|처리.*근거/.test(q)?'permission':/보유|보존|기간|기산점/.test(q)?'period':/기관|제공받/.test(q)?'agency':/항목|개인정보|계좌|은행|예금주/.test(q)?'items':'other';}
export const hasChoiceMeaning=q=>/O\s*[:：].+\/\s*X\s*[:：]/.test(q);
// Turn a review check such as '기관이 원천징수의무자인지 확인' into an O/X question with stated meanings.
export function checkToChoiceQuestion(check){const text=String(check||'').trim().replace(/[.。]+$/,'');if(!text)return '';if(hasChoiceMeaning(text))return text;const body=text.replace(/\s*(?:여부(?:를|도)?\s*)?(?:추가\s*)?(?:확인|검토)(?:\s*필요|이\s*필요합니다|해\s*주세요|하세요)?$/,'').replace(/[?？]$/,'');let q=/인지$/.test(body)?body.replace(/인지$/,'인가요?'):/한지$/.test(body)?body.replace(/한지$/,'한가요?'):/는지$/.test(body)?body.replace(/는지$/,'나요?'):/(?:나요|가요|까요|니까)$/.test(body)?body+'?':'다음에 해당하나요? '+body;return q+' O: 해당 / X: 해당하지 않음';}
export function consolidateWorkQuestions(questions){const groups=new Map();for(const q of questions){if(hasChoiceMeaning(q)&&!/^(?:초안의 개인정보 항목|보유·이용기간은 초안)/.test(q)){groups.set('choice:'+q,new Set([q]));continue;}if(/(?:법적근거|법령|조문|처리.*근거).*(?:있나요|알려|제시|제공)/.test(q))continue;if(/기관명|기관의?\s*(?:이름|명칭)|어느 기관/.test(q))continue;const k=workQuestionCategory(q);if(!groups.has(k))groups.set(k,new Set());groups.get(k).add(q);}return [...groups].map(([k,rows])=>k==='period'?defaults.questionPeriod:k==='items'?defaults.questionItems:k==='permission'?defaults.questionPermission:k==='agency'||k.startsWith('choice:')?[...rows].sort((a,b)=>b.length-a.length)[0]:[...rows].join(' ')).slice(0,5);}

// When questions stop: an answered question is not asked again, confirmed facts are not re-asked, and after
// three answers only questions needed to fill an empty field (items, period, recipient) remain.
export const followUpLimit=3;
const questionKey=q=>String(q||'').replace(/\s*O\s*[:：].*$/s,'').replace(/[\s?？.]/g,'');
export function finishWorkQuestions(questions,{messages=[],residentConfirmed=false,itemsMissing=false,periodMissing=false}={}){
 const users=messages.filter(m=>m.role==='user').map(m=>String(m.content||''));
 const answered=new Set(users.flatMap(t=>[...t.matchAll(/질문:\s*([^\n]+)/g)].map(m=>questionKey(m[1]))));
 const periodAnswered=users.some(t=>/보유 및 이용기간[:：].*(?:그대로 사용|변경)/.test(t)),itemsAnswered=users.some(t=>/개인정보 항목[:：].*(?:그대로 사용|변경)/.test(t));
 const limitReached=users.length-1>=followUpLimit;
 return questions.filter(q=>{const k=workQuestionCategory(q);
  if(answered.has(questionKey(q)))return false;
  if(residentConfirmed&&/원천징수의무자|주민(?:등록)?번호|불가피/.test(q))return false;
  if(k==='period'&&periodAnswered&&!periodMissing)return false;
  if(k==='items'&&itemsAnswered&&!itemsMissing)return false;
  if(limitReached)return k==='items'&&itemsMissing||k==='period'&&periodMissing||/제공받는 기관/.test(q);
  return true;});
}
export const questionsDoneNote=" 추가로 확인할 질문은 없습니다. 아래 '이 내용으로 계속'을 누르면 문서 작성으로 이동합니다.";
