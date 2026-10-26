import { describe,expect,it,vi } from "vitest";
import { verificationReason,verifyMove,VERIFICATION_NODES } from "./verify-move.js";
import type { EngineLine } from "./uci-engine.js";
const cp=(n:number)=>({centipawnsWhite:n,mateInWhite:null});
const line=(moveUci:string,n:number,depth=18):EngineLine=>({...cp(n),depth,rank:1,moveUci,moveSan:moveUci,pvUci:[moveUci],pvSan:[moveUci]});
const fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
describe("adaptive move verification",()=>{
 it("checks errors, near-threshold moves, mates and conflicting searches for either colour",()=>{
  expect(verificationReason(cp(0),cp(-50),undefined,"white")).toBe("possible-error");
  expect(verificationReason(cp(0),cp(50),undefined,"black")).toBe("possible-error");
  expect(verificationReason(cp(0),cp(0),cp(-50),"white")).toBe("search-disagreement");
  expect(verificationReason(cp(0),cp(0),cp(0),"white")).toBeNull();
  expect(verificationReason(cp(0),{centipawnsWhite:null,mateInWhite:-2},undefined,"white")).toBe("mate");
 });
 it("rechecks a move outside the deeper candidates with matching limits and keeps a stronger played move",async()=>{
  const analyze=vi.fn().mockResolvedValueOnce({depth:18,lines:[line("d2d4",0)]})
   .mockResolvedValueOnce({depth:18,lines:[line("e2e4",50)]});
  const checked=await verifyMove({analyze},fen,"e2e4",14,3);
  expect(analyze.mock.calls).toEqual([[fen,18,3,[],undefined,VERIFICATION_NODES,undefined],[fen,18,1,["e2e4"],undefined,VERIFICATION_NODES,undefined]]);
  expect(checked.best.moveUci).toBe("e2e4");expect(checked.analysis.lines.map(l=>l.moveUci)).toEqual(["e2e4","d2d4"]);
 });
 it("reuses the played candidate and rejects a recheck that did not reach the baseline depth",async()=>{
  const analyze=vi.fn().mockResolvedValue({depth:18,lines:[line("e2e4",20)]});
  await verifyMove({analyze},fen,"e2e4",14,3);expect(analyze).toHaveBeenCalledTimes(1);
  analyze.mockResolvedValue({depth:10,lines:[line("e2e4",20,10)]});
  await expect(verifyMove({analyze},fen,"e2e4",14,3)).rejects.toThrow("original depth");
 });
 it("does not lower a deliberately higher configured baseline",async()=>{
  const analyze=vi.fn().mockResolvedValue({depth:28,lines:[line("e2e4",20,28)]});
  await verifyMove({analyze},fen,"e2e4",28,3);expect(analyze.mock.calls[0]?.[1]).toBe(28);
 });
});
