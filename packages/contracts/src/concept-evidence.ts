export const inferredCauseIds = ['process.calculation_failure','process.pattern_failure'];
export function conceptEvidenceLabel(concept:{id:string;family:string;label:string;source:string}):string {
 if(concept.id==='process.cause_unknown')return 'Cause not recorded';
 if(concept.family!=='thinking_process')return concept.source==='manual'?`Your label: ${concept.label}`:concept.label;
 if(concept.source==='manual')return `Your report: ${concept.label}`;
 return inferredCauseIds.includes(concept.id)?'Thinking cause not established':`Practice skill: ${concept.label}`;
}
