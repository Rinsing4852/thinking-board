import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gradeLearning} from './learning-quality-model.mjs';
const catalog={stages:[{id:1,checks:[{id:'X',kind:'browser'}]},{id:2,checks:[{id:'Y',kind:'unit'}]}],manual:['Learning transfer']};
const records=[...['chromium','webkit'].map(project=>({kind:'browser',project,title:'[X] browser',status:'passed'})),{kind:'unit',title:'[Y] unit',status:'passed'}];
test('current passing evidence earns only engineering credit',()=>{const r=gradeLearning(catalog,records,{stage:2,current:true,stepsPassed:true});assert.equal(r.status,'PASS');assert.equal(r.manual[0].status,'unmeasured');});
test('missing, flaky, skipped and failed projects cannot pass or unlock next stage',()=>{for(const status of ['flaky','skipped','failed']){const bad=structuredClone(records);bad[1].status=status;const r=gradeLearning(catalog,bad,{stage:2,current:true,stepsPassed:true});assert.equal(r.status,'NOT_READY');assert.equal(r.stages[1].status,'BLOCKED');}assert.equal(gradeLearning(catalog,[records[0],records[2]],{stage:2,current:true,stepsPassed:true}).status,'NOT_READY');});
test('stale reports and failed commands cannot earn a passing grade',()=>{assert.equal(gradeLearning(catalog,records,{current:false,stepsPassed:true}).stages[0].verified,0);assert.equal(gradeLearning(catalog,records,{current:true,stepsPassed:false}).status,'NOT_READY');});
