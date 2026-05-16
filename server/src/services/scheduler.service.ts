import cron from 'node-cron';
import { Server } from 'socket.io';
import { llmService } from './llm.service.js';
import { ttsService } from './tts.service.js';
import { weatherService } from './weather.service.js';

class SchedulerService {
  private io: Server | null = null;

  init(io: Server) {
    this.io = io;
    console.log('自动化调度服务已启动...');

    // 每小时整点播报
    cron.schedule('0 * * * *', () => {
      this.hourlyBroadcast();
    });

    // 每天早上 7:30 起床唤醒
    cron.schedule('30 7 * * *', () => {
      this.morningWakeup();
    });

    // 每 15 分钟进行一次“环境检查”
    cron.schedule('*/15 * * * *', () => {
        console.log('执行周期性环境检查...');
    });
  }

  /**
   * 整点广播逻辑
   */
  async hourlyBroadcast() {
    const hour = new Date().getHours();
    const currentTime = `${hour}:00`;
    
    console.log(`执行 ${currentTime} 整点广播...`);

    // 获取天气信息进行情境感知
    const weather = await weatherService.getCurrentWeather();
    const weatherContext = weather ? `当前天气：${weather.city}，${weather.weather}，气温 ${weather.temp}°C。` : '';

    const prompt = `现在是北京时间 ${currentTime}。${weatherContext}请作为电台 DJ 跟我做一个简短的整点报时，并根据当前时刻和天气状况给出一句温暖的寄语。`;
    
    const segue = await llmService.chat(prompt);

    // 彻底清理标签
    const cleanSegue = (segue || '')
      .replace(/[\[【]\s*ACTION[\s\S]*?[\]】]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const audioUrl = await ttsService.textToSpeech(cleanSegue || '整点报时。');

    if (this.io) {
      this.io.emit('auto-broadcast', {
        type: 'hourly',
        content: cleanSegue,
        audioUrl: audioUrl
      });
    }
    }

    /**
    * 早间唤醒逻辑
    */
    async morningWakeup() {
    console.log('执行早间唤醒广播...');

    // 获取天气信息
    const weather = await weatherService.getCurrentWeather();
    const weatherContext = weather ? `今天 ${weather.city} 的天气是 ${weather.weather}，气温 ${weather.temp}°C。` : '';

    const prompt = `现在是早上 7:30，我是 Claudio。${weatherContext}请生成一段充满朝气的起床唤醒词，开启美好的一天。如果是好天气，请鼓励我出门；如果天气不好，请提醒我注意防范。`;

    const segue = await llmService.chat(prompt);

    // 彻底清理标签
    const cleanSegue = (segue || '')
      .replace(/[\[【]\s*ACTION[\s\S]*?[\]】]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const audioUrl = await ttsService.textToSpeech(cleanSegue || '早上好。');

    if (this.io) {
      this.io.emit('auto-broadcast', {
        type: 'morning',
        content: cleanSegue,
        audioUrl: audioUrl
      });
    }
    }
}

export const schedulerService = new SchedulerService();
