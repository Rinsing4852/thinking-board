import type {GameSource} from '../../../../packages/contracts/src/api.js';

/** Identify the playing platform from retained provenance, never the learner's alias. */
export function gameSource(identity:string|null,headersJson:string):GameSource {
 if(identity?.startsWith('lichess:'))return 'lichess';
 if(identity?.startsWith('chesscom:'))return 'chesscom';
 let headers:Record<string,string>;try{headers=JSON.parse(headersJson);}catch{return 'pgn';}
 for(const value of [headers.Site,headers.Link]){
  if(!value)continue;
  const label=value.trim().toLowerCase();
  if(label==='lichess.org')return 'lichess';
  if(label==='chess.com')return 'chesscom';
  try {const url=new URL(value);if(!['http:','https:'].includes(url.protocol))continue;
   if(['lichess.org','www.lichess.org'].includes(url.hostname))return 'lichess';
   if(['chess.com','www.chess.com'].includes(url.hostname))return 'chesscom';
  }catch{}
 }
 return 'pgn';
}
