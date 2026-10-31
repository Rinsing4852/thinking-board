export function gradeLearning(catalog,records,{stage=3,current=false,stepsPassed=false}={}) {
  let previous=true;
  const stages=catalog.stages.map(s=>{
    const checks=s.checks.map(check=>{
      const matches=records.filter(r=>r.kind===check.kind&&r.title.includes(`[${check.id}]`));
      const projects=check.kind==='browser'?['chromium','webkit']:[null];
      const status=!current?'unknown':projects.every(project=>{
        const found=matches.filter(r=>project===null||r.project===project);
        return found.length>0&&found.every(r=>r.status==='passed');
      })?'passed':matches.some(r=>['failed','flaky','skipped'].includes(r.status))?'failed':'unknown';
      return {...check,status:s.id>stage?'not_run':status,evidence:matches.map(({title,project,status,file})=>({title,project,status,file}))};
    });
    const passed=s.id<=stage&&previous&&current&&checks.every(c=>c.status==='passed');
    const status=s.id>stage?'not_run':passed?'PASS':!previous?'BLOCKED':checks.some(c=>c.status==='failed')||current&&!stepsPassed?'FAIL':'UNKNOWN';
    if(s.id<=stage)previous=passed;
    return {...s,status,verified:checks.filter(c=>c.status==='passed').length,required:checks.length,checks};
  });
  return {status:previous&&current&&stepsPassed?'PASS':'NOT_READY',stages,manual:catalog.manual.map(description=>({description,status:'unmeasured'})),
    scope:'Engineering acceptance only. Human usability and learning benefit are not established.'};
}
