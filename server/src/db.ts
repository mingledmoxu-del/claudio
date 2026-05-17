import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DB_PATH || './data/claudio.db';
const dataDir = path.dirname(path.resolve(dbPath));

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log('正在初始化 Better-SQLite3 数据库...');
const db = new Database(dbPath);
console.log('已成功连接到数据库:', dbPath);

// 初始化表结构
function initDb() {
  // 历史播放记录
  db.prepare(`CREATE TABLE IF NOT EXISTS plays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id TEXT,
    title TEXT,
    artist TEXT,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();

  // 对话记录
  db.prepare(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();

  // 计划任务
  db.prepare(`CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT,
    task TEXT,
    completed BOOLEAN DEFAULT 0
  )`).run();

  // 记忆的歌单
  db.prepare(`CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    name TEXT,
    creator TEXT,
    cover TEXT,
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();

  // 配置表 (用于存储 Cookie 等)
  db.prepare(`CREATE TABLE IF NOT EXISTS configs (
    key TEXT PRIMARY KEY,
    value TEXT
  )`).run();
}

initDb();

export default db;
