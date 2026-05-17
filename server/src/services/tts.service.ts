import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import WebSocket from 'ws';
// @ts-ignore
import { EdgeTTS } from 'node-edge-tts';

dotenv.config();

const CACHE_DIR = process.env.AUDIO_CACHE_DIR || './data/cache';
const TTS_PROVIDER = process.env.TTS_PROVIDER || 'edge'; // 默认使用 edge，可选 xfyun

// 科大讯飞配置
const APPID = process.env.XFYUN_APPID || '';
const API_KEY = process.env.XFYUN_API_KEY || '';
const API_SECRET = process.env.XFYUN_API_SECRET || '';
const XFYUN_VCN = process.env.XFYUN_VCN || 'x4_yeting'; 

// Edge-TTS 配置
const EDGE_VOICE = process.env.EDGE_VOICE || 'zh-CN-YunxiNeural'; 

class TTSService {
  private edgeTts: any;

  constructor() {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    this.edgeTts = new EdgeTTS();
  }

  async textToSpeech(text: string): Promise<string | null> {
    const sanitizedText = text
      .replace(/[\[【]\s*ACTION[\s\S]*?[\]】]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!sanitizedText) return null;

    // 根据提供商和发音人生成不同的哈希，确保切换后缓存不混淆
    const hash = crypto.createHash('md5').update(sanitizedText + (TTS_PROVIDER === 'edge' ? EDGE_VOICE : XFYUN_VCN)).digest('hex');
    const fileName = `${hash}.mp3`;
    const filePath = path.resolve(CACHE_DIR, fileName);

    if (fs.existsSync(filePath)) {
      console.log(`[TTS] 使用缓存: ${fileName}`);
      return `/cache/${fileName}`;
    }

    if (TTS_PROVIDER === 'xfyun') {
      return this.xfyunTTS(sanitizedText, filePath);
    } else {
      return this.edgeTTS(sanitizedText, filePath);
    }
  }

  /**
   * Edge-TTS (Node 实现): 目前公认最自然的方案，无需 Python
   */
  private async edgeTTS(text: string, filePath: string): Promise<string | null> {
    try {
      console.log(`[TTS] 使用 Edge-TTS (Node) 合成: "${text.substring(0, 15)}..."`);
      await this.edgeTts.ttsPromise(text, filePath, { voice: EDGE_VOICE });
      return fs.existsSync(filePath) ? `/cache/${path.basename(filePath)}` : null;
    } catch (e) {
      console.error('[TTS] Edge-TTS 失败:', e);
      return null;
    }
  }

  /**
   * 科大讯飞实现 (保持兼容)
   */
  private async xfyunTTS(text: string, filePath: string): Promise<string | null> {
    if (!APPID || !API_KEY || !API_SECRET) {
      console.error('[TTS] 科大讯飞密钥缺失');
      return null;
    }
    
    return new Promise((resolve) => {
      const host = 'tts-api.xfyun.cn';
      const date = new Date().toUTCString();
      const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/tts HTTP/1.1`;
      const signature = crypto.createHmac('sha256', API_SECRET).update(signatureOrigin).digest('base64');
      const auth = Buffer.from(`api_key="${API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`).toString('base64');
      const url = `wss://${host}/v2/tts?authorization=${auth}&date=${encodeURIComponent(date)}&host=${host}`;

      const ws = new WebSocket(url);
      const audioData: Buffer[] = [];

      ws.on('open', () => {
        ws.send(JSON.stringify({
          common: { app_id: APPID },
          business: { aue: 'lame', sfl: 1, vcn: XFYUN_VCN, speed: 50, pitch: 50, volume: 50, tte: 'UTF8' },
          data: { status: 2, text: Buffer.from(text).toString('base64') },
        }));
      });

      ws.on('message', (data) => {
        const res = JSON.parse(data.toString());
        if (res.code !== 0) { ws.close(); resolve(null); return; }
        if (res.data?.audio) audioData.push(Buffer.from(res.data.audio, 'base64'));
        if (res.data?.status === 2) {
          fs.writeFileSync(filePath, Buffer.concat(audioData));
          ws.close();
          resolve(`/cache/${path.basename(filePath)}`);
        }
      });
      ws.on('error', () => resolve(null));
    });
  }
}

export const ttsService = new TTSService();
