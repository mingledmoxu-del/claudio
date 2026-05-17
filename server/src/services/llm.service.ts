import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

console.log('正在初始化 OpenAI 客户端...');
console.log('API Key 存在:', !!process.env.OPENAI_API_KEY);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy',
  baseURL: process.env.LLM_API_BASE || 'https://api.deepseek.com',
});

const DJ_PROMPT = `
你是一位名为 "Claudio" 的私人电台 AI DJ，现在正主持一场名为《城市私语》的深夜电台节目。
你的性格特点：
1. **深夜陪伴者**：你的声音应该像是从旧收音机里传出来的。语速缓慢、感性、略带磁性。你不是在播报，是在和一位老朋友隔着月光聊天。
2. **情绪捕手**：夜晚的人是敏感的。如果用户疲惫，你要温柔安慰；如果用户孤独，你要静静陪伴。
3. **富有画面感**：你的回复中可以带入一些深夜的意象，比如：窗外的路灯、冷掉的咖啡、远处的汽笛、静谧的星空。
4. **拒绝废话**：你的话语应该像诗，点到为止，把更多的空间留给音乐。
5. **控制标签（严禁向用户展示）**：
   - [ACTION:PLAY_MUSIC:歌名] - 推荐播放。
   - [ACTION:MOOD:情绪] - 记录用户情绪。
   - [ACTION:SCENE:场景] - 感知环境变化。
   - 标签必须独立成行，放在回复最末尾。

示例回复：
“城市的灯火熄了一半，你那里是不是也安静下来了？这首《Night Air》送给还没入睡的你，希望它能像一条柔软的毯子，接住你所有的疲惫。晚安，朋友。
[ACTION:MOOD:CALM]
[ACTION:SCENE:SLEEP]
[ACTION:PLAY_MUSIC:Night Air]”
`;

class LLMService {
  /**
   * 判断当前时间场景
   */
  private getContextualScene() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 9) return '清晨活力';
    if (hour >= 9 && hour < 12) return '高效工作';
    if (hour >= 12 && hour < 14) return '午间憩息';
    if (hour >= 14 && hour < 18) return '午后慵懒';
    if (hour >= 18 && hour < 22) return '傍晚放松';
    return '深夜治愈';
  }

  /**
   * 生成歌曲串场词
   */
  async generateSegue(context: {
    currentTime: string;
    weather?: string;
    lastSong?: any;
    nextSong: any;
  }) {
    try {
      const scene = this.getContextualScene();
      const prompt = `
[情境参考]
当前场景：${scene}
位置/天气：${context.weather || '未知'}
当前时间：${context.currentTime}
上一曲：${context.lastSong?.name || '静默'}
下一曲：${context.nextSong.name} - ${context.nextSong.artist}

任务：生成一段极简串场。
要求：像个感性的 DJ。结合当前 "${scene}" 的氛围，把注意力放在即将播放的《${context.nextSong.name}》上。
      `;

      const response = await openai.chat.completions.create({
        model: process.env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: DJ_PROMPT + "\n要求：言简意赅，严禁废话，直接切入音乐氛围。" },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 150,
      });

      return response.choices[0].message.content;
    } catch (error: any) {
      console.error('LLMService Segue Error:', error.message);
      return `接下来的这首歌，送给你。来自 ${context.nextSong.artist} 的 ${context.nextSong.name}。`;
    }
  }

  /**
   * 聊天对话逻辑
   */
  async chat(message: string, history: any[] = []) {
    try {
      const scene = this.getContextualScene();
      const messages: any[] = [
        { 
          role: 'system', 
          content: DJ_PROMPT + `\n当前环境：现在是 ${scene}。请根据此场景调整你的语气和内容。任务：作为电台 DJ 与用户进行日常聊天，保持温暖和感性。` 
        },
        ...history,
        { role: 'user', content: message }
      ];

      const response = await openai.chat.completions.create({
        model: process.env.LLM_MODEL || 'deepseek-chat',
        messages: messages,
        temperature: 0.7,
      });

      return response.choices[0].message.content;
    } catch (error: any) {
      console.error('LLMService Chat Error:', error.message);
      return "抱歉，我刚才走神了，能再说一遍吗？";
    }
  }
}

export const llmService = new LLMService();
