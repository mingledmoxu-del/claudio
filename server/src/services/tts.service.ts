import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import WebSocket from 'ws';
// @ts-ignore
import { EdgeTTS } from 'edge-tts-universal';

dotenv.config();

const CACHE_DIR = process.env.AUDIO_CACHE_DIR || './data/cache';

class TTSService {
  private edgeTts: any;

  constructor() {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    // edge-tts-universal 的初始化
    this.edgeTts = new EdgeTTS();
  }

  async textToSpeech(text: string): Promise<string | null> {
    const provider = process.env.TTS_PROVIDER || 'edge';
    const edgeVoice = process.env.EDGE_VOICE || 'zh-CN-YunyeNeural';
    const edgeSpeed = process.env.EDGE_SPEED || '0%';

    // 文本清理
    const sanitizedText = text
      .replace(/[（\(][^）\)]*[）\)]/g, '')
      .replace(/[\[【]\s*ACTION[\s\S]*?[\]】]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!sanitizedText) return null;

    const voiceTag = provider === 'edge' ? edgeVoice + edgeSpeed : 'xfyun';
    const hash = crypto.createHash('md5').update(sanitizedText + voiceTag).digest('hex');
    const fileName = `${hash}.mp3`;
    const filePath = path.resolve(CACHE_DIR, fileName);

    if (fs.existsSync(filePath)) {
      console.log(`[TTS] 使用缓存: ${fileName}`);
      return `/cache/${fileName}`;
    }

    if (provider === 'xfyun') {
      return this.xfyunTTS(sanitizedText, filePath);
    } else {
      return this.edgeTTS(sanitizedText, filePath, edgeVoice, edgeSpeed);
    }
  }

  private async edgeTTS(text: string, filePath: string, voice: string, rate: string): Promise<string | null> {
    try {
      console.log(`[TTS] 正在使用 edge-tts-universal 合成 -> 音色: ${voice}, 语速: ${rate}`);
      
      // edge-tts-universal 的调用方式
      const buffer = await this.edgeTts.synthesize(text, voice, {
        rate: rate
      });

      if (buffer) {
        fs.writeFileSync(filePath, buffer);
        console.log(`[TTS] 合成成功: ${path.basename(filePath)}`);
        return `/cache/${path.basename(filePath)}`;
      }
      return null;
    } catch (e) {
      console.error('[TTS] edge-tts-universal 失败:', e);
      return null;
    }
  }

  private async xfyunTTS(text: string, filePath: string): Promise<string | null> {
    const appid = process.env.XFYUN_APPID;
    const apiKey = process.env.XFYUN_API_KEY;
    const apiSecret = process.env.XFYUN_API_SECRET;
    const vcn = process.env.XFYUN_VCN || 'x4_yeting';
    
    if (!appid || !apiKey || !apiSecret) return null;

    return new Promise((resolve) => {
      const host = 'tts-api.xfyun.cn';
      const date = new Date().toUTCString();
      const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/tts HTTP/1.1`;
      const signature = crypto.createHmac('sha256', apiSecret).update(signatureOrigin).digest('base64');
      const auth = Buffer.from(`api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`).toString('base64');
      const url = `wss://${host}/v2/tts?authorization=${auth}&date=${encodeURIComponent(date)}&host=${host}`;

      const ws = new WebSocket(url);
      const audioData: Buffer[] = [];

      ws.on('open', () => {
        ws.send(JSON.stringify({
          common: { app_id: appid },
          business: { aue: 'lame', sfl: 1, vcn: vcn, speed: 50, pitch: 50, volume: 50, tte: 'UTF8' },
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
