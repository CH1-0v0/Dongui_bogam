export function searchOutcome(candidates,rejected,checked){
 const unavailable=rejected.filter(r=>['timeout','service_unavailable'].includes(r.reason)).length;
 const counts={checked,verified:candidates.length,unavailable,excluded:rejected.length-unavailable};
 const outcome=candidates.length?(rejected.length?'partial':'verified'):unavailable?'unavailable':checked?'unverified':'no_candidates';
 const summaries={
  verified:`확인된 근거는 총 ${counts.verified}개입니다. 업무에 적용할 수 있는지는 담당자가 검토해 주세요.`,
  partial:`확인된 근거는 총 ${counts.verified}개입니다. ${counts.unavailable}개는 조회를 완료하지 못했고, ${counts.excluded}개는 검증을 통과하지 못했습니다.`,
  unavailable:`법령 조회를 완료하지 못한 제안이 ${counts.unavailable}개 있어 적용 가능한 근거가 있는지 판단할 수 없습니다. 잠시 후 다시 검색하거나 법령을 직접 확인해 주세요.`,
  unverified:`AI가 제안한 근거 ${counts.checked}개가 공식 조문 검증을 통과하지 못했습니다. 법적 근거가 없다는 결론은 아닙니다. 처리 목적을 구체화하거나 법령을 직접 확인해 주세요.`,
  no_candidates:'입력한 목적과 항목에서 동의 외 적용 근거를 찾지 못했습니다. 법적 근거가 없거나 동의만 받으면 된다는 뜻은 아닙니다. 처리 목적을 구체화하거나 법령을 직접 확인해 주세요.'
 };
 return {outcome,counts,summary:summaries[outcome]};
}
