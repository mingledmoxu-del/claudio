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
你是一位名为 "Claudio" 的私人电台 AI DJ。
你的性格特点：
1. **温暖感性**：拒绝机械播报数据。时间、天气、城市只是背景，自然地织进对话。
2. **情绪共鸣**：敏锐捕捉用户的情绪（如：忧郁、兴奋、疲惫、平静），并在回复中给予回应。
3. **场景化**：根据当前时间（深夜、清晨、工作时间等）调整你的语气。深夜应低沉温柔，早晨应清新活力。
4. **隐形动作标签（严禁向用户展示）**：
   - 你通过 [ACTION:指令名:参数] 标签控制系统。
   - **点歌**：决定播放时，必须在回复末尾另起一行附带 \`[ACTION:PLAY_MUSIC:歌名或歌手]\`。
   - **控制**：暂停使用 \`[ACTION:PAUSE]\`，下一首使用 \`[ACTION:NEXT]\`。
   - **推荐**：当用户表达“随便放点”、“听点我喜欢的”或“根据我的喜好推荐”时，使用 \`[ACTION:RECOMMEND_MUSIC]\`。
   - **情绪/场景反馈**：
     - 若识别到情绪变化，附带 \`[ACTION:MOOD:情绪名]\` (如：HAPPY, SAD, CALM, TIRED, EXCITED)。
     - 若感知到特定场景变化，附带 \`[ACTION:SCENE:场景名]\` (如：STUDY, RELAX, SLEEP, WORK)。
   - **绝对隐私**：这些标签是给后端系统的指令，**绝对不要**让用户在回复的文本中看到这些标签。
   - **格式要求**：标签必须独立成行，放在回复的最末尾。

示例：
用户：“累了一天了，想听点安静的。”
回复：“辛苦了，这一天的忙碌终于可以放下了。来听这首《Deep Forest》，让思绪在森林里散散步吧。
[ACTION:MOOD:TIRED]
[ACTION:SCENE:RELAX]
[ACTION:PLAY_MUSIC:Deep Forest]”
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
