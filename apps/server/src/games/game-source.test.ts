import {describe,it,expect} from 'vitest';
import {gameSource} from './game-source.js';
describe('game provenance',()=>{
 it('uses retained provider identity and recognises exported platform headers',()=>{
  expect(gameSource('lichess:abcdefgh','{}')).toBe('lichess');
  expect(gameSource('chesscom:live:123','{}')).toBe('chesscom');
  expect(gameSource(null,JSON.stringify({Site:'https://lichess.org/abcdefgh'}))).toBe('lichess');
  expect(gameSource(null,JSON.stringify({Site:'Chess.com'}))).toBe('chesscom');
  expect(gameSource(null,JSON.stringify({Link:'https://www.chess.com/game/live/123'}))).toBe('chesscom');
 });
 it('keeps missing and misleading provenance as PGN',()=>{
  for(const site of ['?', 'https://lichess.org.example.org/game','https://chess.com@evil.example/game','Club game','file://chess.com'])
   expect(gameSource('metadata:123',JSON.stringify({Site:site}))).toBe('pgn');
  expect(gameSource(null,'bad-json')).toBe('pgn');
 });
});
