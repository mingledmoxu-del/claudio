import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

const execAsync = promisify(exec);
dotenv.config();

const CACHE_DIR = process.env.AUDIO_CACHE_DIR || './data/cache';

class TTSService {
  constructor() {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  }

  /**
   * 使用 Edge-TTS 合成语音 (免费且稳定)
   */
  async textToSpeech(text: string): Promise<string | null> {
    // 安全清理：移除所有 ACTION 标签和可能干扰命令的特殊字符
    const sanitizedText = text
      .replace(/[\[【]\s*ACTION[\s\S]*?[\]】]/gi, '')
      .replace(/["'`\\]/g, '') // 移除引号和反斜杠以防注入
      .replace(/\s+/g, ' ')
      .trim();

    if (!sanitizedText) return null;

    // 生成唯一文件名
    const hash = crypto.createHash('md5').update(sanitizedText).digest('hex');
    const fileName = `${hash}.mp3`;
    const filePath = path.resolve(CACHE_DIR, fileName);

    // 如果缓存存在，直接返回
    if (fs.existsSync(filePath)) {
      console.log('使用语音缓存:', fileName);
      return `/cache/${fileName}`;
    }

    try {
      console.log(`正在调用 Edge-TTS 合成语音: "${sanitizedText.substring(0, 20)}..."`);
      
      const voice = 'zh-CN-YunxiNeural';
      // 使用更安全的引号转义
      const command = `edge-tts --voice ${voice} --text "${sanitizedText}" --write-media ${filePath}`;
      
      await execAsync(command);

      if (fs.existsSync(filePath)) {
        return `/cache/${fileName}`;
      }
      return null;
    } catch (error: any) {
      console.error('Edge-TTS 转换失败:', error.message);
      return null;
    }
  }
}

export const ttsService = new TTSService();
