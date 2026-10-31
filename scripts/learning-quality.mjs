import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import {unitRecords,browserRecords} from './feature-audit-model.mjs';
import {gradeLearning} from './learning-quality-model.mjs';
const root=path.resolve('docs/learning-quality'),raw=path.join(root,'raw');fs.mkdirSync(raw,{recursive:true});
const catalog=JSON.parse(fs.readFileSync(path.join(root,'criteria.json'),'utf8'));
const stage=process.argv.includes('--stage')?Number(process.argv[process.argv.indexOf('--stage')+1]):3;
if(![1,2,3].includes(stage))throw new Error('Choose stage 1, 2 or 3');
function fingerprint(){const hash=crypto.createHash('sha256');const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n').filter(f=>/^(apps|packages|scripts|tests|migrations)\//.test(f)||/^(package.*\.json|playwright.config.ts|docs\/learning-quality\/criteria.json)$/.test(f)).sort();for(const f of files)if(fs.existsSync(f))hash.update(f).update(fs.readFileSync(f));return hash.digest('hex');}
const read=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;}};
let run=read(path.join(raw,'run.json'));
if(process.argv.includes('--verify')){
  const before=fingerprint(),steps=[];
  function check(name,cmd,args,output){console.log(`Checking ${name}…`);const result=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:60*1024*1024});if(output)fs.writeFileSync(path.join(raw,output),result.stdout??'');else if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);steps.push({name,passed:result.status===0});return result.status===0;}
  for(const f of ['unit.json','browser.json','engine.json','thinking.json'])fs.rmSync(path.join(raw,f),{force:true});
  if(check('grader','node',['--test','scripts/learning-quality-model.test.mjs'])&&check('types','npm',['run','typecheck'])&&check('unit suite','npx',['vitest','run','--reporter=json',`--outputFile=${path.join(raw,'unit.json')}`])&&check('build','npm',['run','build']))
    check('browser gates','npx',stage===3?['playwright','test','--reporter=json']:['playwright','test','tests/e2e/learning-quality.spec.ts','--grep',`\\[G[1-${stage}]_`,'--reporter=json'],'browser.json');
  if(stage>=2&&steps.length===5&&steps.every(s=>s.passed)){
    const image=process.env.LEARNING_ENGINE_IMAGE;
    function real(script,output){
      if(image)return check('real Stockfish: '+script,'docker',['run','--rm','--network=none','--entrypoint','node','-v',`${process.cwd()}/dist:/app/dist:ro`,'-v',`${process.cwd()}/scripts:/app/scripts:ro`,'-v',`${process.cwd()}/migrations:/app/migrations:ro`,'-w','/app',image,`scripts/${script}`,'--learning-quality'],output);
      return check('real Stockfish: '+script,'node',[`scripts/${script}`,'--learning-quality'],output);
    }
    if(real('smoke-tactical-training.mjs','engine.json'))real('smoke-thinking-exercises.mjs','thinking.json');
  }
  run={engineImage:process.env.LEARNING_ENGINE_IMAGE??null,measuredAt:new Date().toISOString(),stage,fingerprint:fingerprint(),unchanged:before===fingerprint(),steps};fs.writeFileSync(path.join(raw,'run.json'),JSON.stringify(run,null,2)+'\n');
}
const units=read(path.join(raw,'unit.json')),browsers=read(path.join(raw,'browser.json'));
const engine=read(path.join(raw,'engine.json')),thinking=read(path.join(raw,'thinking.json'));
const thinkingPassed=thinking?.engine?.startsWith('Stockfish ')&&!thinking.engine.includes('Fake')&&thinking.learningQuality===true&&thinking.results?.length>=9&&thinking.results.every(r=>r.passed);
const engineRecords=engine?.engine?.startsWith('Stockfish ')&&!engine.engine.includes('Fake')&&engine.learningQuality===true&&engine.results?.length>=16&&engine.results.every(r=>r.passed)&&thinkingPassed?[{kind:'engine',title:'[G2_ENGINE] labelled real Stockfish regression',status:'passed',file:'scripts/smoke-tactical-training.mjs'}]:[];
const current=Boolean(run?.unchanged&&run.fingerprint===fingerprint()&&run.stage>=stage);
const result=gradeLearning(catalog,[...(units?unitRecords(units):[]),...(browsers?browserRecords(browsers):[]),...engineRecords],{stage,current,stepsPassed:Boolean(run?.steps.length===(stage>=2?7:5)&&run.steps.every(s=>s.passed))});
const report={engine:engine?{name:engine.engine,cases:engine.results?.length,fullGameCases:thinking?.results?.length??0,selection:engine.selection}:null,generatedAt:new Date().toISOString(),current,run,...result};
fs.writeFileSync(path.join(root,'grade.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(root,'QUALITY.md'),`# Learning quality gates\n\n**${result.status}** · source evidence ${current?'current':'missing or stale'}.\n\n${result.scope}\n\nValidation: ${run?.steps.map(s=>s.name+'='+ (s.passed?'passed':'FAILED')).join(', ')??'not run'}.\n\n${result.stages.map(s=>`## ${s.id}. ${s.name}: ${s.status}\n\n${s.verified}/${s.required} checks verified.\n\n${s.checks.map(c=>`- **${c.status}** ${c.id}: ${c.description}`).join('\n')}`).join('\n\n')}\n\n## Human and learning evidence\n\n${result.manual.map(m=>`- **unmeasured** ${m.description}`).join('\n')}\n`);
console.log(`${result.status}: ${result.stages.map(s=>`${s.id}=${s.status}`).join(', ')}`);
if(result.status!=='PASS')process.exitCode=1;
