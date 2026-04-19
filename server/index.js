require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Game = require('./models/Game');

// --- 1. ÚJ: Socket.io importok ---
const http = require('http');
const { Server } = require('socket.io');

const app = express();

// --- 2. ÚJ: Szerver és Socket létrehozása ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Bárhonnan csatlakozhatsz (mobilos teszteléshez fontos!)
    methods: ["GET", "POST"]
  }
});

// Middleware-ek
app.use(cors());
app.use(express.json());

// Adatbázis csatlakozás
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ SUCCESS: Connected to MongoDB"))
  .catch(err => console.log("❌ ERROR:", err));

// ==========================================
// SOCKET.IO LOGIKA (SZOBÁK KEZELÉSE)
// ==========================================
io.on('connection', (socket) => {
  console.log(`🔌 Valaki csatlakozott: ${socket.id}`);

  // Amikor a játékos megad egy szobakódot és belép
  socket.on('join_room', (roomCode) => {
    socket.join(roomCode);
    console.log(`👥 Felhasználó belépett a szobába: ${roomCode}`);

    // ÚJ: Megnézzük, hányan vannak most ebben a szobában
    const room = io.sockets.adapter.rooms.get(roomCode);
    const numClients = room ? room.size : 0;

    // Ha ő az első, akkor 'X', ha a második, akkor 'O'
    let assignedPlayer = 'X';
    if (numClients === 2) {
      assignedPlayer = 'O';
    } else if (numClients > 2) {
      assignedPlayer = 'Néző'; // Ha 3. ember lép be, ő már csak nézheti
    }

    // VISSZAKÜLDJÜK A JÁTÉKOSNAK, HOGY Ő MELYIK BETŰ!
    socket.emit('room_joined', assignedPlayer);
  });

  // Amikor valaki rákattint egy mezőre, elküldi a szervernek...
  socket.on('send_move', (data) => {
    // ...a szerver pedig továbbítja a szobában lévő TÖBBI játékosnak
    socket.to(data.room).emit('receive_move', data);
  });

  // Ha bezárja a böngészőt
  socket.on('disconnect', () => {
    console.log(`❌ Valaki lecsatlakozott: ${socket.id}`);
  });
});
// ==========================================

// Alap útvonal teszteléshez
app.get('/', (req, res) => {
  res.send("A Tic-Tac-Toe szerver fut!");
});

// Útvonal a játék mentéséhez
app.post('/api/save-game', async (req, res) => {
  try {
    const { winner, board } = req.body;
    const newGame = new Game({ winner, board });
    await newGame.save();
    res.status(201).json({ message: "Játék elmentve!" });
  } catch (err) {
    res.status(500).json({ error: "Hiba a mentés során", details: err });
  }
});

// Útvonal az eddigi játékok lekéréséhez
app.get('/api/history', async (req, res) => {
  try {
    const games = await Game.find().sort({ createdAt: -1 });
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: "Nem sikerült lekérni a listát" });
  }
});

const PORT = process.env.PORT || 5000;

// --- 4. ÚJ: Itt a server.listen indul, nem az app.listen! ---
server.listen(PORT, () => {
  console.log(`🚀 Szerver és Socket fut a következő porton: ${PORT}`);
});