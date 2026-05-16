import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import db from './db.js';
import { musicService } from './services/music.service.js';
import { llmService } from './services/llm.service.js';
import { ttsService } from './services/tts.service.js';
import { schedulerService } from './services/scheduler.service.js';
import { weatherService } from './services/weather.service.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const cacheDir = process.env.AUDIO_CACHE_DIR || './data/cache';

if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use('/cache', express.static(path.resolve(cacheDir)));

app.get('/', (req, res) => {
  res.send('<h1>Claudio AI Radio Backend</h1><p>API is running at <a href="/api/status">/api/status</a>. Please open the frontend at http://localhost:5173</p>');
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'running', message: 'Claudio AI Radio Server is online' });
});

app.get('/api/weather', async (req, res) => {
  const weather = await weatherService.getCurrentWeather();
  res.json(weather);
});

app.get('/api/music/search', async (req, res) => {
  const { keywords } = req.query;
  if (!keywords) return res.status(400).json({ error: 'Missing keywords' });
  try {
    const songs = await musicService.searchSongs(keywords as string);
    res.json(songs);
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/api/music/url/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const url = await musicService.getSongUrl(id);
    res.json({ url });
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/api/music/playlist/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { songs, info } = await musicService.getPlaylistSongs(id);
    if (info && info.id) {
      // 记录到数据库
      db.prepare(`
        INSERT INTO playlists (id, name, creator, cover) 
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
        name=excluded.name, creator=excluded.creator, cover=excluded.cover, imported_at=CURRENT_TIMESTAMP
      `).run(info.id, info.name, info.creator, info.cover);
    }
    res.json(songs);
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/api/playlists', (req, res) => {
  try {
    const playlists = db.prepare('SELECT * FROM playlists ORDER BY imported_at DESC').all();
    res.json(playlists);
  } catch (err) { res.status(500).json({ error: 'DB Error' }); }
});

app.get('/api/music/lyric/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const lyric = await musicService.getLyrics(id);
    res.json({ lyric });
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/api/music/recommend/single', async (req, res) => {
  try {
    const songs = await musicService.getRecommendSongs();
    if (songs && songs.length > 0) {
      const randomSong = songs[Math.floor(Math.random() * Math.min(songs.length, 30))];
      res.json(randomSong);
    } else {
      res.status(404).json({ error: 'No recommendations available' });
    }
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.post('/api/ai/broadcast', async (req, res) => {
  const { lastSong, nextSong } = req.body;
  if (!nextSong) return res.status(400).json({ error: 'Missing nextSong' });
  
  const currentTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const weather = await weatherService.getCurrentWeather();
  
  let weatherStr = '未知';
  if (weather) {
    weatherStr = `${weather.city} ${weather.weather}，气温 ${weather.temp}°C，体感 ${weather.feelsLike}°C，湿度 ${weather.humidity}%，风速 ${weather.windSpeed}km/h`;
  }

  try {
    const rawSegue = await llmService.generateSegue({ currentTime, weather: weatherStr, lastSong, nextSong });
    
    // 彻底清理标签，防止 TTS 读出
    const cleanSegue = (rawSegue || '')
      .replace(/[\[【]\s*ACTION[\s\S]*?[\]】]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const audioUrl = await ttsService.textToSpeech(cleanSegue || '接下来请听。');
    res.json({ segue: cleanSegue, audioUrl });
  } catch (err) { res.status(500).json({ error: 'AI Broadcast Error' }); }
});

io.on('connection', (socket) => {
  console.log('新客户端已连接:', socket.id);
  
  socket.on('chat-message', async (message: string) => {
    try {
      const msg = message.trim();
      if (/^(暂停|停止|别放了)$/.test(msg)) {
        socket.emit('player-command', { action: 'pause' });
        socket.emit('chat-reply', { role: 'assistant', content: '好的，已经为你暂停了。' });
        return;
      }
      if (/^(继续|播放|开始)$/.test(msg)) {
        socket.emit('player-command', { action: 'play' });
        socket.emit('chat-reply', { role: 'assistant', content: '好的，音乐继续。' });
        return;
      }
      if (/^(下一首|切歌|换一首)$/.test(msg)) {
        socket.emit('player-command', { action: 'next' });
        socket.emit('chat-reply', { role: 'assistant', content: '没问题，换一首。' });
        return;
      }

      console.log(`[Chat] 收到消息: "${message}"`);
      const reply = await llmService.chat(message);
      if (!reply) return;

      console.log('[Chat] LLM 原始回复:', JSON.stringify(reply));
      
      let actionTriggered = false;
      let songData = null;
      let currentMood = null;
      let currentScene = null;

      // 1. 提取动作
      const actionRegex = /[\[【]\s*ACTION\s*[:：\s]\s*([A-Z_]+)(?:\s*[:：\s]\s*(.+?))?\s*[\]】]/gi;
      let match;
      const cleanActionsReply = reply; // 临时变量用于提取

      while ((match = actionRegex.exec(cleanActionsReply)) !== null) {
        const actionType = match[1].toUpperCase();
        const actionParam = match[2];

        if (actionType === 'PAUSE') {
          socket.emit('player-command', { action: 'pause' });
          actionTriggered = true;
        } else if (actionType === 'PLAY') {
          socket.emit('player-command', { action: 'play' });
          actionTriggered = true;
        } else if (actionType === 'NEXT_SONG' || actionType === 'NEXT') {
          socket.emit('player-command', { action: 'next' });
          actionTriggered = true;
        } else if (actionType === 'PLAY_MUSIC' && actionParam) {
          const keywords = actionParam.trim();
          const songs = await musicService.searchSongs(keywords, 5);
          if (songs && songs.length > 0) {
            songData = songs[0];
            actionTriggered = true;
          }
        } else if (actionType === 'RECOMMEND_MUSIC') {
          const songs = await musicService.getRecommendSongs();
          if (songs && songs.length > 0) {
            // 随机从推荐中选一首
            songData = songs[Math.floor(Math.random() * Math.min(songs.length, 20))];
            actionTriggered = true;
          }
        } else if (actionType === 'MOOD' && actionParam) {
          currentMood = actionParam.trim();
        } else if (actionType === 'SCENE' && actionParam) {
          currentScene = actionParam.trim();
        }
      }
      
      if (!actionTriggered) {
        const songInQuotes = reply.match(/《(.+?)》/);
        if (songInQuotes) {
          const songName = songInQuotes[1];
          const songs = await musicService.searchSongs(songName, 5);
          if (songs && songs.length > 0) songData = songs[0];
        }
      }

      // 2. 彻底清理回复中的所有标签和多余空白，用于 TTS
      const cleanReply = reply
        .replace(/[\[【]\s*ACTION[\s\S]*?[\]】]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
        
      console.log('[Chat] 清理后的 TTS 文本:', JSON.stringify(cleanReply));
      
      // 3. 并行处理：获取 TTS 和发送消息
      let audioUrl = null;
      try {
        audioUrl = await ttsService.textToSpeech(cleanReply || '好的。');
      } catch (e) {
        console.error('[Chat] TTS 失败:', e);
      }
      
      socket.emit('chat-reply', { 
        role: 'assistant', 
        content: cleanReply || '好的。', 
        audioUrl,
        songData,
        mood: currentMood,
        scene: currentScene
      });

      db.prepare('INSERT INTO messages (role, content) VALUES (?, ?)').run('user', message);
      db.prepare('INSERT INTO messages (role, content) VALUES (?, ?)').run('assistant', cleanReply || '好的。');
    } catch (err) { console.error('Chat Error:', err); }
  });

  socket.on('disconnect', () => { console.log('客户端已断开连接:', socket.id); });
});

server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  schedulerService.init(io);
});
