import { useState, useEffect } from 'react'
import axios from 'axios'
import { io } from 'socket.io-client'
import './App.css'

// Connect to the Socket server (use your local IP address)
const socket = io('http://192.168.1.85:5000');

function App() {
  const [screen, setScreen] = useState('menu');
  const [board, setBoard] = useState(Array(9).fill(null));
  const [xIsNext, setXIsNext] = useState(true);
  const [history, setHistory] = useState([]);
  
  // NEW: Socket.io states
  const [room, setRoom] = useState("");
  // Track whether you are X or O in the room
  const [myPlayer, setMyPlayer] = useState(null); 

  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

  // --- SOCKET.IO LISTENERS ---
  useEffect(() => {
    // When a move is received from the other player
    socket.on('receive_move', (data) => {
      setBoard(data.board);
      setXIsNext(data.xIsNext);
    });

    // When successfully joined (the server tells you which letter you are)
    socket.on('room_joined', (player) => {
      setMyPlayer(player);
    });

    // Cleanup when the component unmounts
    return () => {
      socket.off('receive_move');
      socket.off('room_joined');
    };
  }, []);

  // --- MINIMAX ALGORITHM (Kept for Single Player) ---
  const checkWinner = (squares) => {
    for (let [a, b, c] of lines) {
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) return squares[a];
    }
    if (squares.every(s => s !== null)) return 'tie';
    return null;
  };

  const minimax = (squares, depth, isMaximizing) => {
    const result = checkWinner(squares);
    if (result === 'O') return 10 - depth;
    if (result === 'X') return depth - 10;
    if (result === 'tie') return 0;

    if (isMaximizing) {
      let bestScore = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (squares[i] === null) {
          squares[i] = 'O';
          let score = minimax(squares, depth + 1, false);
          squares[i] = null;
          bestScore = Math.max(score, bestScore);
        }
      }
      return bestScore;
    } else {
      let bestScore = Infinity;
      for (let i = 0; i < 9; i++) {
        if (squares[i] === null) {
          squares[i] = 'X';
          let score = minimax(squares, depth + 1, true);
          squares[i] = null;
          bestScore = Math.min(score, bestScore);
        }
      }
      return bestScore;
    }
  };

  const findBestMove = (currentBoard) => {
    let bestScore = -Infinity;
    let move = -1;
    for (let i = 0; i < 9; i++) {
      if (currentBoard[i] === null) {
        currentBoard[i] = 'O';
        let score = minimax(currentBoard, 0, false);
        currentBoard[i] = null;
        if (score > bestScore) {
          bestScore = score;
          move = i;
        }
      }
    }
    return move;
  };

  // --- GAMEPLAY (Single Player AI) ---
  useEffect(() => {
    if (screen === 'single' && !xIsNext && !checkWinner(board)) {
      const timer = setTimeout(() => {
        const bestMove = findBestMove([...board]);
        if (bestMove !== -1) handleLocalClick(bestMove);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [xIsNext, screen, board]);

  // Local game click (Single / Local Multi)
  const handleLocalClick = (i) => {
    if (board[i] || checkWinner(board)) return;
    const nextBoard = board.slice();
    nextBoard[i] = xIsNext ? 'X' : 'O';
    setBoard(nextBoard);
    setXIsNext(!xIsNext);
    saveIfGameOver(nextBoard);
  };

  // Online game click
  const handleOnlineClick = (i) => {
    // You can only move if the square is empty, there is no winner, AND it's your turn!
    if (board[i] || checkWinner(board)) return;
    
    // It's the turn of the player whose character matches the next player (X or O)
    const currentTurn = xIsNext ? 'X' : 'O';
    if (myPlayer !== currentTurn) {
        // Not your turn!
        return; 
    }

    const nextBoard = board.slice();
    nextBoard[i] = myPlayer;
    setBoard(nextBoard);
    setXIsNext(!xIsNext);

    // Send the move to the server
    socket.emit('send_move', { room, board: nextBoard, xIsNext: !xIsNext });
    saveIfGameOver(nextBoard);
  };

  // Shared function for saving
  const saveIfGameOver = (currentBoard) => {
    const winnerResult = checkWinner(currentBoard);
    if (winnerResult) {
      axios.post('http://192.168.1.85:5000/api/save-game', {
        winner: winnerResult === 'tie' ? "Draw" : winnerResult,
        board: currentBoard
      }).catch(() => console.log("Error saving game"));
    }
  };

  // --- CONTROLS ---
  const joinRoom = () => {
    if (room.trim() !== "") {
      socket.emit('join_room', room);
      setScreen('online');
      resetGame(); // Start with a clean slate
    }
  };

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setXIsNext(true);
    // If online, the reset must be sent to both players
    if (screen === 'online') {
        socket.emit('send_move', { room, board: Array(9).fill(null), xIsNext: true });
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await axios.get('http://192.168.1.85:5000/api/history');
      setHistory(res.data);
      setScreen('leaderboard');
    } catch (err) { console.error(err); }
  };

  // --- RENDER BRANCHES ---

  if (screen === 'menu') {
    return (
      <div className="container">
        <h1>Tic-Tac-Toe</h1>
        <div className="menu-grid">
          <button onClick={() => setScreen('single')}>Single Player (Impossible AI)</button>
          <button onClick={() => setScreen('multi')}>Local Multiplayer</button>
          <button onClick={() => setScreen('lobby')}>Online Multiplayer</button>
          <button onClick={fetchLeaderboard}>Leaderboards</button>
        </div>
      </div>
    );
  }

  // --- NEW: LOBBY SCREEN ---
  if (screen === 'lobby') {
    return (
      <div className="container">
        <h2>Online Lobby</h2>
        <div className="menu-grid" style={{ gap: '20px' }}>
          <input 
            type="text" 
            placeholder="Enter Room Code (e.g., 123)" 
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            style={{ 
              padding: '18px', 
              borderRadius: '16px', 
              fontSize: '1.2rem', 
              textAlign: 'center',
              border: '1px solid #333',
              background: '#1a1a1a',
              color: 'white',
              width: '100%'
            }}
          />
          <button onClick={joinRoom}>Join Room</button>
          <button className="back-btn" onClick={() => setScreen('menu')}>Back</button>
        </div>
      </div>
    );
  }

  if (screen === 'leaderboard') {
    return (
      <div className="container">
        <h2>Match History</h2>
        <div className="history-list">
          {history.slice(0, 10).map((game, i) => (
            <div key={i} className="history-item">
              <span>{new Date(game.createdAt).toLocaleDateString()}</span>
              <strong>{game.winner === 'Draw' || game.winner === 'Döntetlen' ? '🤝 Draw' : `🏆 Winner: ${game.winner}`}</strong>
            </div>
          ))}
        </div>
        <button className="back-btn" onClick={() => setScreen('menu')}>Back</button>
      </div>
    );
  }

  // --- GAME BOARD ---
  const winner = checkWinner(board);
  
  // Generate status message
  let statusMessage;
  if (winner === 'tie') {
      statusMessage = "Draw!";
  } else if (winner) {
      statusMessage = `Winner: ${winner}`;
  } else {
      if (screen === 'online') {
          // In online mode, display whose turn it is and who you are
          statusMessage = `Next: ${xIsNext ? 'X' : 'O'} | You are: ${myPlayer || '?'}`;
      } else {
          statusMessage = `Next: ${xIsNext ? 'X' : 'O'}`;
      }
  }

  return (
    <div className="container">
      <h2>
        {screen === 'single' ? 'Vs Computer (Impossible)' : screen === 'online' ? `Online (Room: ${room})` : 'Local Multiplayer'}
      </h2>
      <div className="status">
        {statusMessage}
      </div>
      <div className="board">
        {board.map((val, i) => (
          <button 
            key={i} 
            className="square" 
            // Smart click: calls online logic if online, otherwise local
            onClick={() => screen === 'online' ? handleOnlineClick(i) : handleLocalClick(i)}
          >
            {val}
          </button>
        ))}
      </div>
      <div className="controls">
        <button onClick={resetGame}>Restart</button>
        <button className="back-btn" onClick={() => { 
            resetGame(); 
            setScreen('menu'); 
            setRoom(""); // Clear room on exit
        }}>Menu</button>
      </div>
    </div>
  );
}

export default App;