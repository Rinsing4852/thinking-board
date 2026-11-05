import type {OpeningLineDetail} from '../../../packages/contracts/src/api';
import {fenPositionKey} from './opening-line-position';
import {openingMoveLabel} from './opening-navigation';
export interface OpeningBranchNode {id:string;label:string;lineIds:string[];endingLineIds:string[];children:OpeningBranchNode[]}
/** Move-order trie: grouping is independent of import order, titles and inferred parent lines. */
export function openingBranchTree(lines:OpeningLineDetail[]):OpeningBranchNode[]{
 type Node={id:string;labels:string[];lines:Set<string>;ends:string[];children:Map<string,Node>};
 const roots=new Map<string,Node>();
 const node=(id:string,labels:string[]=[]):Node=>({id,labels,lines:new Set(),ends:[],children:new Map()});
 for(const line of lines){
  const key=fenPositionKey(line.moves[0]?.fenBefore??'');
  const root=roots.get(key)??node(key);roots.set(key,root);let current:Node=root;current.lines.add(line.id);
  for(const move of line.moves){let child:Node|undefined=current.children.get(move.moveUci);
   if(!child){child=node(`${current.id}|${move.moveUci}`,[openingMoveLabel(move)]);current.children.set(move.moveUci,child);}
   current=child;current.lines.add(line.id);
  }current.ends.push(line.id);
 }
 const compress=(start:Node):OpeningBranchNode=>{
  let current=start;const labels=[...current.labels];
  while(!current.ends.length&&current.children.size===1){current=[...current.children.values()][0]!;labels.push(...current.labels);}
  return {id:current.id,label:labels.join(' ')||'Starting position',lineIds:[...current.lines].sort(),endingLineIds:current.ends.sort(),
   children:[...current.children.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(compress)};
 };
 return [...roots.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(compress);
}
