import {expect,it} from 'vitest';
import {conceptEvidenceLabel} from './concept-evidence.js';
it('separates unknown causes, learner reports and automatic practice skills',()=>{
 const label=(id:string,source='automatic')=>conceptEvidenceLabel({id,source,family:'thinking_process',label:'Calculation failure'});
 expect(label('process.calculation_failure')).toBe('Thinking cause not established');
 expect(label('process.calculation_failure','manual')).toBe('Your report: Calculation failure');
 expect(label('process.cause_unknown','manual')).toBe('Cause not recorded');
 expect(label('process.blunder_check')).toBe('Practice skill: Calculation failure');
});
