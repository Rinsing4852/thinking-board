export function gameRoute(hash: string): {view:'library'|'game'|'patterns';gameId:string|null;ply:number|null} {
  const params=new URLSearchParams(hash.split('?')[1]??'');
  const gameId=params.get('game')?.trim()||null,raw=params.get('ply'),ply=raw===null?NaN:Number(raw);
  return {view:gameId?'game':params.get('view')==='patterns'?'patterns':'library',gameId,
    ply:Number.isSafeInteger(ply)&&ply>=0&&ply<=10000?ply:null};
}
