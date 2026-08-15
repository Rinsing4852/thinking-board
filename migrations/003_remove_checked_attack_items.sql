DELETE FROM training_items
WHERE mode = 'what_changed'
  AND source_move_id IN (
    SELECT player_move.id
    FROM moves player_move
    JOIN moves opponent_move
      ON opponent_move.game_id = player_move.game_id
      AND opponent_move.ply = player_move.ply - 1
    WHERE opponent_move.san LIKE '%+%' OR opponent_move.san LIKE '%#%'
  );
