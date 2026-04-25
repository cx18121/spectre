interface MatchEndScreenProps {
  winner: 1 | 2;
  playerSlot: 1 | 2;
}

export function MatchEndScreen({ winner, playerSlot }: MatchEndScreenProps) {
  const youWon = winner === playerSlot;
  return (
    <div className="match-end">
      <div className={`match-end-title ${youWon ? 'win' : 'lose'}`}>
        {youWon ? 'You win!' : 'You lose!'}
      </div>
      <button className="big-button" onClick={() => window.location.reload()}>
        Play again
      </button>
    </div>
  );
}
