/** Checking habits explain verified position evidence; they do not diagnose the player's thinking. */
export function tacticalLesson(pattern: string, defending: boolean): { warning: string; habit: string } | null {
 const side=defending?'the opponent':'you';
 if(pattern==='fork')return {warning:`One piece can attack two valuable targets at once. Check whether ${side} can create that double attack.`,habit:'Before choosing a move, look for checks and attacks on two pieces. Calculate the reply and the resulting capture; an apparent fork is not automatically winning.'};
 if(pattern==='mating threat'||pattern==='missed mate')return {warning:defending?'Your king has a concrete mating threat in the saved analysis.':'The saved analysis contains a mating opportunity.',habit:defending?'Check the opponent’s forcing checks and your king’s escape squares before carrying out your own plan.':'Start with checks, then test every legal defence. Finding the first move is only the start; play through the full mate.'};
 if(pattern==='material capture')return {warning:`The saved continuation shows ${side} gaining material with a capture.`,habit:'Check loose and attacked pieces before moving. Count attackers and defenders, then calculate captures, recaptures and forcing replies.'};
 if(pattern==='material threat')return {warning:`The saved continuation shows a material threat for ${side}.`,habit:'After imagining your move, check every piece you leave attacked or undefended. Test the opponent’s checks, captures and threats before committing.'};
 return null;
}
