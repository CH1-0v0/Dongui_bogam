import config from './evidence-discovery.json' with {type:'json'};
export {config as discoveryConfig};
const compact=v=>String(v||'').replace(/\s+/g,'');
export function normalizeLawName(value){let name=String(value||'').normalize('NFKC').replace(/[「」『』]/g,'').trim();const wrapped=name.match(/^(?:법률|대통령령|총리령|[가-힣]+부령)\s*[（(]([^()（）]+)[)）]$/);if(wrapped)name=wrapped[1].trim();return name.slice(0,100);}
export function discoveryScope(context,extraTerms=[]){
 const purpose=context.items.map(i=>i.purpose).join(' '),profiles=config.profiles.filter(p=>new RegExp(p.signals).test(purpose)),terms=new Map();
 for(const p of profiles)for(const term of p.terms)terms.set(term,4);
 for(const i of context.items){if(i.classification==='rnn')for(const term of ['주민등록번호','고유식별정보'])terms.set(term,3);if(i.classification==='sensitive')for(const term of ['민감정보','건강정보'])terms.set(term,3);for(const term of (i.purpose+' '+i.name).split(/[^가-힣A-Za-z0-9]+/))if(term.length>=2&&term.length<=30&&!['위한','관한','따른','정보','개인정보','확인','처리','수집','이용'].includes(term)&&!terms.has(term))terms.set(term,1);}
 for(const term of extraTerms.slice(0,12))if(typeof term==='string'&&term.length>=2&&term.length<=30&&!terms.has(term))terms.set(term,2);
 return {laws:profiles.flatMap(p=>p.laws),terms:[...terms].map(([text,weight])=>({text,weight}))};
}
export function candidateLawNames(names,limit=config.maxLaws){const seen=new Set();return names.map(normalizeLawName).filter(name=>{const key=compact(name);if(!key||key.startsWith('개인정보보호법')||seen.has(key))return false;seen.add(key);return true;}).slice(0,limit);}
export function rankEvidence(articles,terms,law,mst,index){
 const scored=articles.map(a=>{const title=a.title||'',text=a.text||'';const score=terms.reduce((n,t)=>n+t.weight*((title.includes(t.text)?5:0)+(text.includes(t.text)?1:0)),0);return {a,score};}).filter(v=>v.score>0).sort((a,b)=>b.score-a.score);
 return scored.slice(0,config.articlesPerLaw).map(({a})=>{let text=a.text;if(text.length>config.maxText){const pieces=[text.slice(0,2800)];for(const term of [...terms].sort((a,b)=>b.weight-a.weight)){const at=text.indexOf(term.text,2800);if(at>=0)pieces.push(text.slice(Math.max(2800,at-150),at+500));if(pieces.join('\n').length>=config.maxText-300)break;}text=pieces.join('\n[중간 생략]\n').slice(0,config.maxText);}
  return {id:'L'+(index+1)+'-A'+a.value,law,mst,article:a.value,title:a.title,text};});
}
export function groundSelections(candidates,pool,rules,failed=[]){
 const failedNames=new Set(failed.map(r=>compact(normalizeLawName(r.law))));
 return candidates.flatMap(input=>{const permissionCodes={sensitive:'sensitiveLaw',unique:'uniqueLaw',rnn:'residentLaw'};const c={...input,paragraph:/^0+$/.test(String(input.paragraph??''))?'':input.paragraph,clause:/^0+$/.test(String(input.clause??''))?'':input.clause,basisCode:input.basisCode||(input.permission==='general'?({collect:'statutory',provide:'provisionLaw',outside:'extraLaw',extra:'extraLaw'}[input.type]):permissionCodes[input.permission])};const rule=rules[c.basisCode];let evidence=pool.find(e=>e.id===c.evidenceId);if(!evidence&&c.law&&c.article){const matches=pool.filter(e=>compact(e.law)===compact(normalizeLawName(c.law))&&String(e.article)===String(c.article));if(matches.length===1)evidence=matches[0];}
  if(evidence)return [{...c,law:evidence.law,mst:evidence.mst,article:evidence.article,discoveryError:null}];
  if(rule&&rule.effect!=='consent'&&!rule.needsLaw)return [{...c,law:'개인정보 보호법',article:rule.article,paragraph:rule.paragraph,clause:rule.clause,discoveryError:null}];
  if(failedNames.has(compact(normalizeLawName(c.law))))return [];
  return [{...c,law:normalizeLawName(c.law)||'원문 후보 없음',discoveryError:'공식 원문 후보 목록에 없는 조문을 제안하여 제외했습니다.'}];
 });
}

// Necessary textual check only; passing still requires the legal applicability review.
export function hasPermissionText(actual){
 const patterns={residentLaw:/주민등록번호/,sensitiveLaw:/민감정보|건강에\s*관한\s*정보/,uniqueLaw:/고유식별정보|여권번호|운전면허(?:의)?\s*번호|외국인등록번호/};
 const pattern=patterns[actual.basisCode];return !pattern||pattern.test([actual.articleExcerpt,actual.paragraphExcerpt,actual.excerpt].filter(v=>typeof v==='string').join('\n'));
}
