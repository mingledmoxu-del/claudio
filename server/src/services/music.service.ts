import dotenv from 'dotenv';
// @ts-ignore
import pkg from 'NeteaseCloudMusicApi';
import db from '../db.js';
const { search, song_url, lyric, playlist_track_all, playlist_detail, recommend_songs } = pkg;

dotenv.config();

const COOKIE = process.env.NETEASE_COOKIE || '';

export interface Song {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
}

class MusicService {
  /**
   * 获取每日推荐歌曲 (需要有效 COOKIE)
   */
  async getRecommendSongs(): Promise<Song[]> {
    try {
      console.log('[Music] 尝试获取个性化推荐...');
      if (!COOKIE || COOKIE.length < 10) {
        console.warn('[Music] 未配置有效 COOKIE，尝试进入兜底模式');
        return this.getFallbackSongs();
      }

      const result = await recommend_songs({ cookie: COOKIE });
      if (result.status !== 200) {
        console.warn(`[Music] 推荐接口返回状态 ${result.status}，进入兜底模式`);
        return this.getFallbackSongs();
      }

      const body = result.body as any;
      const songs = body.data?.dailySongs || [];
      if (songs.length === 0) return this.getFallbackSongs();

      console.log(`[Music] 成功获取 ${songs.length} 首个性化推荐歌曲`);
      return songs.map((s: any) => ({
        id: s.id.toString(),
        name: s.name,
        artist: (s.ar || s.artists || []).map((a: any) => a.name).join(', '),
        album: (s.al || s.album || {}).name,
        duration: s.dt || s.duration,
        cover: (s.al || s.album || {}).picUrl,
      }));
    } catch (error) {
      console.error('[Music] GetRecommend Error:', error);
      return this.getFallbackSongs();
    }
  }

  /**
   * 兜底逻辑：从数据库中随机选歌
   */
  private async getFallbackSongs(): Promise<Song[]> {
    try {
      console.log('[Music] 正在从本地数据库提取备选曲目...');
      const playlists = db.prepare('SELECT id FROM playlists LIMIT 10').all() as { id: string }[];
      if (playlists.length === 0) return [];

      const randomPlaylist = playlists[Math.floor(Math.random() * playlists.length)];
      const { songs } = await this.getPlaylistSongs(randomPlaylist.id);
      return songs;
    } catch (e) {
      return [];
    }
  }

  /**
   * 搜索歌曲
   */
  async searchSongs(keywords: string, limit = 10): Promise<Song[]> {
    try {
      const result = await search({
        keywords,
        type: 1, // 1: 单曲
        limit,
        cookie: COOKIE
      });

      if (result.status !== 200) throw new Error('搜索失败');

      const body = result.body as any;
      const songs = body.result?.songs || [];
      return songs.map((s: any) => ({
        id: s.id.toString(),
        name: s.name,
        artist: s.artists.map((a: any) => a.name).join(', '),
        album: s.album.name,
        duration: s.duration,
        cover: '', 
      }));
    } catch (error) {
      console.error('MusicService Search Error:', error);
      return [];
    }
  }

  /**
   * 获取歌曲播放链接
   */
  async getSongUrl(id: string): Promise<string | null> {
    try {
      const result = await song_url({
        id,
        br: 320000, 
        cookie: COOKIE
      });

      if (result.status !== 200) return null;
      const data = result.body.data as any[];
      return data[0]?.url || null;
    } catch (error) {
      console.error('MusicService GetUrl Error:', error);
      return null;
    }
  }

  /**
   * 获取歌词
   */
  async getLyrics(id: string): Promise<string | null> {
    try {
      const result = await lyric({ id, cookie: COOKIE });
      if (result.status !== 200) return null;
      return (result.body.lrc as any)?.lyric || null;
    } catch (error) {
      console.error('MusicService GetLyrics Error:', error);
      return null;
    }
  }

  /**
   * 获取歌单歌曲
   */
  async getPlaylistSongs(playlistId: string): Promise<{ songs: Song[], info: any }> {
    try {
      const match = playlistId.match(/\d+/);
      if (!match) {
        console.warn(`无效的歌单 ID: ${playlistId}`);
        return { songs: [], info: null };
      }
      const cleanId = match[0];
      console.log(`正在从网易云获取歌单: ${cleanId}`);

      const result = await playlist_track_all({
        id: cleanId,
        cookie: COOKIE
      });

      if (result.status !== 200) {
        console.error('网易云 API 返回错误状态:', result.status);
        throw new Error('获取歌单失败');
      }

      const body = result.body as any;
      const songs = (body.songs || []).map((s: any) => ({
        id: s.id.toString(),
        name: s.name,
        artist: (s.ar || s.artists || []).map((a: any) => a.name).join(', '),
        album: (s.al || s.album || {}).name,
        duration: s.dt || s.duration,
        cover: (s.al || s.album || {}).picUrl,
      }));

      // 获取更详细的歌单信息（名称、创建者、封面）
      let info = {
        id: cleanId,
        name: '未知歌单',
        creator: '未知用户',
        cover: ''
      };

      try {
        const detailResult = await playlist_detail({ id: cleanId, cookie: COOKIE });
        if (detailResult.status === 200) {
          const playlist = (detailResult.body as any).playlist;
          info.name = playlist?.name || info.name;
          info.creator = playlist?.creator?.nickname || info.creator;
          info.cover = playlist?.coverImgUrl || info.cover;
        }
      } catch (e) {
        console.warn('获取歌单详情失败:', e);
      }

      return { songs, info };
    } catch (error) {
      console.error('MusicService GetPlaylist Error:', error);
      return { songs: [], info: null };
    }
  }
}

export const musicService = new MusicService();
