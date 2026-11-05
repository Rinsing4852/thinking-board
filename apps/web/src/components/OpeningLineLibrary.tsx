import { useEffect, useState } from "react";
import type { OpeningChapterDetail, OpeningLineProgress } from "../../../../packages/contracts/src/api";
import type { OpeningNavigation } from "../opening-navigation";

import {openingBranchTree,type OpeningBranchNode} from '../opening-branch-tree';

interface Props {
  chapters: OpeningChapterDetail[];
  index: OpeningNavigation;
  selectedLineId: string;
  open: boolean;
  disabled: boolean;
  progress: Map<string, OpeningLineProgress>;
  transpositions: Map<string, number>;
  onChoose: (lineId: string) => void;
}

function Branch({node,selected,query,renderLine,matches,depth=0}:{depth?:number;node:OpeningBranchNode;selected:string;query:string;renderLine:(id:string)=>React.ReactNode;matches:(id:string)=>boolean}){
 const contains=node.lineIds.includes(selected),visible=node.lineIds.some(matches);
 const [expanded,setExpanded]=useState(contains||Boolean(query));
 useEffect(()=>{if(contains||query)setExpanded(true);},[selected,query,contains]);
 if(!visible)return null;
 const content=<>{node.endingLineIds.filter(matches).map(renderLine)}{node.children.map(child=><Branch key={child.id} node={child} selected={selected} query={query} renderLine={renderLine} matches={matches} depth={depth+1}/>)}</>;
 return node.children.length?<details className="opening-branch-group" style={depth>=4?{paddingLeft:0,borderLeftWidth:0}:undefined} open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}>
  <summary aria-label={`Branch ${node.label}`}><span>{node.label}</span><small>{node.lineIds.filter(matches).length} lines{contains?' · selected route':''}</small></summary>
  <div className="opening-branch-children">{content}</div>
 </details>:<div className="opening-branch-leaf"><p className="opening-branch-moves">{node.label}</p>{content}</div>;
}

export function OpeningLineLibrary({ chapters, index, selectedLineId, open, disabled, progress, transpositions, onChoose }: Props) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const matches = (lineId: string): boolean => {
    const ref = index.lines.get(lineId)!;
    const description = index.branches.get(lineId);
    return !query || `${ref.chapterTitle} ${ref.line.title} ${description?.title ?? ""} ${ref.line.sanSequence} ${description?.preview ?? ""}`.toLowerCase().includes(query);
  };
  const visible = [...index.lines.keys()].filter(matches).length;
  return <aside id="opening-line-library" className={`panel opening-line-library ${open ? "mobile-open" : ""}`} aria-label="Opening lines">
    <div className="opening-line-library-title"><strong>Lines</strong><span>{visible}{query ? ` / ${index.lines.size}` : ""}</span></div>
    <label className="opening-line-search">Find a line<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Chapter, name or move…" /></label>
    {query && <button className="text-button" onClick={() => setSearch("")}>Clear line search</button>}
    {visible === 0 && <p>No matching lines. Try a chapter name or a move such as c5.</p>}
    {chapters.map(chapter => {
      const lines = chapter.lines.filter(line => matches(line.id));
      if (!lines.length) return null;
      return <section key={chapter.id}>
        <h3>{chapter.title}</h3>
        <div className="opening-line-buttons">{openingBranchTree(chapter.lines).map(node=><Branch key={node.id} node={node} selected={selectedLineId} query={query} matches={matches} renderLine={lineId=>{
          const line=index.lines.get(lineId)!.line;
          const branch = index.branches.get(line.id);
          const evidence = progress.get(line.id);
          const state = !evidence || evidence.accuracyPercent === null ? "new"
            : evidence.decisions > 0 && evidence.mastered === evidence.decisions ? "mastered"
            : evidence.due > 0 || evidence.accuracyPercent < 80 ? "weak" : "learning";
          return <button key={line.id} className={`${line.id === selectedLineId ? "active" : ""}${line.archived ? " archived" : ""}`.trim()}
            disabled={disabled} aria-current={line.id === selectedLineId ? "true" : undefined} onClick={() => onChoose(line.id)}>
            <strong>{branch?.title ?? line.title}</strong>
            <span>{line.archived ? "Archived · " : line.practiceEnabled === false ? "Practice paused · " : ""}{line.learnerDecisionCount} moves to learn</span>
            {evidence && <small className={`opening-line-mastery ${state}`}>
              {state === "mastered" ? "Secure for now" : state === "new" ? "New" : state === "weak" ? "Needs review" : "Learning"}
              {` · ${evidence.mastered}/${evidence.decisions}`}
              {(transpositions.get(line.id) ?? 0) > 0 ? " · another move order" : ""}
            </small>}
          </button>;
        }}/>)}</div>
      </section>;
    })}
  </aside>;
}
