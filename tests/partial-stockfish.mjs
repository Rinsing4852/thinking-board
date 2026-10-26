#!/usr/bin/env node
// Protocol fixture: the node ceiling interrupts the next MultiPV iteration.
import readline from "node:readline";
readline.createInterface({input:process.stdin}).on("line",line=>{
 if(line==="uci")console.log("id name PartialFixture\nuciok");
 if(line==="isready")console.log("readyok");
 if(line.startsWith("go ")){
  console.log("info depth 14 multipv 1 score cp 20 pv e2e4");
  console.log("info depth 14 multipv 2 score cp 10 pv d2d4");
  // Partial reordering at the SAME depth must not overwrite the committed set.
  console.log("info depth 14 multipv 1 score cp 35 pv d2d4");
  if(!line.includes("depth 14 "))console.log("info depth 15 multipv 1 score cp 35 pv d2d4");
  console.log("bestmove d2d4");
 }
 if(line==="quit")process.exit(0);
});
