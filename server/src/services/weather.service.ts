import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

interface WeatherData {
  temp: string;
  feelsLike: string;
  weather: string;
  city: string;
  humidity: string;
  windSpeed: string;
}

class WeatherService {
  private cache: WeatherData | null = null;
  private lastFetch: number = 0;
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 分钟缓存

  /**
   * 获取实时天气 (使用 wttr.in 接口，无需 API Key)
   */
  async getCurrentWeather(city?: string): Promise<WeatherData | null> {
    // 如果环境变量没有 CITY 且调用没传 city，则留空让 wttr.in 自动根据 IP 定位
    const targetCity = city || process.env.CITY || '';
    
    // 检查缓存
    const now = Date.now();
    if (this.cache && (now - this.lastFetch < this.CACHE_TTL) && (!city || city === this.cache.city)) {
      return this.cache;
    }

    try {
      console.log(`正在获取天气信息 (定位: ${targetCity || '自动识别'})...`);
      // 使用 wttr.in 的 JSON 格式接口，lang=zh 尝试获取中文描述
      const url = targetCity ? `https://wttr.in/${targetCity}?format=j1&lang=zh` : `https://wttr.in/?format=j1&lang=zh`;
      const response = await axios.get(url);
      
      if (response.status !== 200) return null;

      const current = response.data.current_condition[0];
      const area = response.data.nearest_area[0];

      const data: WeatherData = {
        temp: current.temp_C,
        feelsLike: current.FeelsLikeC,
        weather: current.lang_zh?.[0]?.value || current.weatherDesc[0].value,
        city: area.areaName[0].value,
        humidity: current.humidity,
        windSpeed: current.windspeedKmph
      };

      // 更新缓存
      this.cache = data;
      this.lastFetch = now;

      return data;
    } catch (error) {
      console.error('WeatherService Error:', error);
      return this.cache; // 报错时返回旧缓存
    }
  }

  /**
   * 翻译天气描述为简洁的中文标签 (保留旧方法兼容性，虽然现在有了 lang_zh)
   */
  getWeatherLabel(desc: string): string {
    if (desc.includes('Sunny') || desc.includes('Clear') || desc.includes('晴')) return '晴朗';
    if (desc.includes('Cloudy') || desc.includes('云')) return '多云';
    if (desc.includes('Rain') || desc.includes('雨')) return '有雨';
    if (desc.includes('Snow') || desc.includes('雪')) return '有雪';
    return desc;
  }
}

export const weatherService = new WeatherService();
