import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { Radio, Music, MessageSquare, Search, Play, Pause, ListMusic, PlusCircle, Send, Cloud, Sun, CloudRain, SkipBack, SkipForward, Volume2, Shuffle, Repeat, Repeat1, AlignLeft, Settings, Headphones, CheckCircle2, Gauge, LogIn, User, Loader2, QrCode, Sparkles, Heart } from 'lucide-react';
import axios from 'axios';

const socket = io('http://localhost:3000');
const API_BASE = 'http://localhost:3000/api';
const SERVER_URL = 'http://localhost:3000';

function App() {
  const [status, setStatus] = useState('Disconnected');
  const [searchQuery, setSearchQuery] = useState('');
  const [playlistId, setPlaylistId] = useState('');
  const [recentPlaylists, setRecentPlaylists] = useState<any[]>([]);
  const [userPlaylists, setUserPlaylists] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentSong, setCurrentSong] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [view, setView] = useState<'player' | 'import' | 'chat' | 'lyrics' | 'settings' | 'login'>('player');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [currentSegue, setCurrentSegue] = useState('');
  const [weather, setWeather] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [playMode, setPlayMode] = useState<'sequential' | 'shuffle' | 'repeat-one'>('sequential');
  const [recommendMode, setRecommendMode] = useState(false);

  // Login state
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [qrKey, setQrKey] = useState<string | null>(null);
  const [loginStatus, setLoginStatus] = useState<{code: number, message: string}>({code: 801, message: '等待扫码'});
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);

  // Settings state
  const [availableVoices, setAvailableVoices] = useState<any[]>([]);
  const [currentVoiceId, setCurrentVoiceId] = useState('zh-CN-YunxiNeural');
  const [currentSpeed, setCurrentSpeed] = useState('-18%');
  const [isPreviewing, setIsPreviewing] = useState<string | null>(null);
  
  // Visuals state
  const [dominantColor, setDominantColor] = useState('#6366f1');
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [scene, setScene] = useState<string | null>(null);

  const MOOD_CONFIG: Record<string, { color: string, filter: string }> = {
    HAPPY: { color: '#fbbf24', filter: 'brightness(1.1) saturate(1.1)' },
    SAD: { color: '#3b82f6', filter: 'grayscale(0.1) brightness(1)' },
    CALM: { color: '#10b981', filter: 'sepia(0.02) brightness(1)' },
    TIRED: { color: '#8b5cf6', filter: 'blur(0.2px) brightness(0.9)' },
    EXCITED: { color: '#ef4444', filter: 'contrast(1.1) saturate(1.1)' },
  };

  // Lyrics state
  const [lyrics, setLyrics] = useState<{time: number, text: string}[]>([]);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const hasAutoPlayedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const lyricsScrollRef = useRef<HTMLDivElement | null>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const initAudioContext = () => {
      if (audioRef.current && !audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        const analyserNode = ctx.createAnalyser();
        analyserNode.fftSize = 256;
        const source = ctx.createMediaElementSource(audioRef.current);
        source.connect(analyserNode);
        analyserNode.connect(ctx.destination);
        audioContextRef.current = ctx;
        setAnalyser(analyserNode);
      }
    };

    const handleFirstInteraction = () => {
      initAudioContext();
      if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume();
      window.removeEventListener('click', handleFirstInteraction);
    };
    window.addEventListener('click', handleFirstInteraction);

    socket.on('connect', () => setStatus('Connected'));
    socket.on('disconnect', () => setStatus('Disconnected'));

    socket.on('chat-reply', (data) => {
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
      setIsTyping(false);
      if (data.mood) setMood(data.mood);
      if (data.scene) setScene(data.scene);
      if (data.audioUrl && ttsRef.current) {
        ttsRef.current.src = `${SERVER_URL}${data.audioUrl}`;
        ttsRef.current.play();
        if (data.songData) actuallyPlayWithDucking(data.songData);
      }
    });

    socket.on('auto-broadcast', (data) => {
      setIsBroadcasting(true);
      setCurrentSegue(data.content);
      if (data.audioUrl && ttsRef.current) {
        ttsRef.current.src = `${SERVER_URL}${data.audioUrl}`;
        ttsRef.current.play();
        ttsRef.current.onended = () => {
           setIsBroadcasting(false);
           fadeVolume(volume, 2500);
        };
      } else {
        setTimeout(() => setIsBroadcasting(false), 5000);
      }
    });

    socket.on('player-command', (cmd) => {
      switch(cmd.action) {
        case 'play': if (audioRef.current && !isPlaying) togglePlay(); break;
        case 'pause': if (audioRef.current && isPlaying) togglePlay(); break;
        case 'next': handleNext(); break;
        case 'prev': handlePrevious(); break;
        case 'play-song': if (cmd.data) startBroadcastAndPlay(cmd.data); break;
      }
    });

    checkLoginStatus();
    fetchWeather();
    fetchRecentPlaylists();
    fetchVoices();

    return () => {
      socket.off('connect'); socket.off('disconnect'); socket.off('chat-reply');
      socket.off('auto-broadcast'); socket.off('player-command');
      window.removeEventListener('click', handleFirstInteraction);
    };
  }, [isPlaying, currentSong, playMode, searchResults, recommendMode, volume]);

  useEffect(() => {
    let timer: any;
    if (view === 'login' && qrKey && !isLoggedIn) {
      timer = setInterval(async () => {
        try {
          const resp = await axios.get(`${API_BASE}/login/qr/check?key=${qrKey}`);
          const { code, message } = resp.data;
          setLoginStatus({ code, message });
          if (code === 803) {
            setIsLoggedIn(true);
            clearInterval(timer);
            checkLoginStatus();
            setTimeout(() => setView('player'), 2000);
          } else if (code === 800) {
            getNewQR();
          }
        } catch (e) {}
      }, 3000);
    }
    return () => clearInterval(timer);
  }, [view, qrKey, isLoggedIn]);

  const checkLoginStatus = async () => {
    try {
      const resp = await axios.get(`${API_BASE}/login/status`);
      if (resp.data.isLoggedIn) {
        setIsLoggedIn(true);
        setUserProfile(resp.data.profile);
        // 自动拉取歌单
        const playlists = await fetchUserPlaylists();
        // 确保会话生命周期内只自动播放一次，防止重复触发
        if (!hasAutoPlayedRef.current && playlists && playlists.length > 0) {
           hasAutoPlayedRef.current = true;
           handleImportPlaylist(playlists[0].id);
        }
      }
    } catch (e) {}
  };

  const fetchUserPlaylists = async () => {
    try {
      const resp = await axios.get(`${API_BASE}/user/playlists`);
      setUserPlaylists(resp.data);
      return resp.data;
    } catch (e) { return []; }
  };

  const getNewQR = async () => {
    setQrImg(null);
    setLoginStatus({code: 801, message: '正在生成二维码...'});
    try {
      const keyResp = await axios.get(`${API_BASE}/login/qr/key`);
      const key = keyResp.data.unikey;
      setQrKey(key);
      const imgResp = await axios.get(`${API_BASE}/login/qr/create?key=${key}`);
      setQrImg(imgResp.data.qrimg);
      setLoginStatus({code: 801, message: '请使用网易云音乐 APP 扫码'});
    } catch (err) {
      setLoginStatus({code: 500, message: '生成二维码失败，请重试'});
    }
  };

  useEffect(() => {
    if (audioRef.current && !isBroadcasting) audioRef.current.volume = volume;
  }, [volume, isBroadcasting]);

  useEffect(() => {
    if (currentSong?.id) {
      fetchLyrics(currentSong.id);
      if (currentSong.cover) extractDominantColor(currentSong.cover);
      else setDominantColor('#6366f1');
    }
  }, [currentSong?.id, currentSong?.cover]);

  useEffect(() => {
    if (lyrics.length > 0) {
      const index = lyrics.findIndex((l, i) => {
        const nextTime = lyrics[i + 1]?.time || Infinity;
        return currentTime >= l.time && currentTime < nextTime;
      });
      if (index !== -1 && index !== currentLyricIndex) {
        setCurrentLyricIndex(index);
        const activeLyric = document.querySelector(`[data-lyric-index="${index}"]`);
        if (activeLyric) {
          activeLyric.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [currentTime, lyrics, currentLyricIndex]);

  useEffect(() => {
    if (analyser && visualizerCanvasRef.current) {
      const canvas = visualizerCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let animationFrameId: number;

      const draw = () => {
        animationFrameId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const barHeight = dataArray[i] / 3;
          ctx.fillStyle = dominantColor + '44';
          ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
          x += barWidth + 1;
        }
      };
      draw();
      return () => cancelAnimationFrame(animationFrameId);
    }
  }, [analyser, dominantColor]);

  useEffect(() => {
    if (view === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, view]);

  const fetchVoices = async () => {
    try {
      const resp = await axios.get(`${API_BASE}/tts/voices`);
      setAvailableVoices(resp.data);
    } catch (err) {}
  };

  const handlePreviewVoice = async (voiceId: string) => {
    setIsPreviewing(voiceId);
    try {
      const resp = await axios.post(`${API_BASE}/tts/preview`, { voice: voiceId });
      if (resp.data.audioUrl && previewAudioRef.current) {
        previewAudioRef.current.src = `${SERVER_URL}${resp.data.audioUrl}`;
        previewAudioRef.current.play();
        previewAudioRef.current.onended = () => setIsPreviewing(null);
      }
    } catch (err) { setIsPreviewing(null); }
  };

  const handleSelectVoice = async (voiceId: string) => {
    setCurrentVoiceId(voiceId);
    try {
      await axios.post(`${API_BASE}/tts/config`, { voice: voiceId, speed: currentSpeed });
    } catch (err) {}
  };

  const handleSpeedChange = async (speed: string) => {
    setCurrentSpeed(speed);
    try {
      await axios.post(`${API_BASE}/tts/config`, { voice: currentVoiceId, speed });
    } catch (err) {}
  };

  const extractDominantColor = (imgUrl: string) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imgUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = 1; canvas.height = 1;
      ctx.drawImage(img, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const color = `rgb(${r}, ${g}, ${b})`;
      setDominantColor(color);
    };
  };

  const fetchWeather = async () => {
    try {
      const resp = await axios.get(`${API_BASE}/weather`);
      setWeather(resp.data);
    } catch (err) {}
  };

  const fetchRecentPlaylists = async () => {
    try {
      const resp = await axios.get(`${API_BASE}/playlists`);
      setRecentPlaylists(resp.data);
    } catch (err) {}
  };

  const fetchLyrics = async (songId: string) => {
    try {
      const resp = await axios.get(`${API_BASE}/music/lyric/${songId}`);
      if (resp.data.lyric) {
        const parsed = parseLyrics(resp.data.lyric);
        setLyrics(parsed);
      } else { setLyrics([]); }
    } catch (err) { setLyrics([]); }
  };

  const parseLyrics = (lrc: string) => {
    const lines = lrc.split('\n');
    const result: {time: number, text: string}[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
    lines.forEach(line => {
      const match = timeRegex.exec(line);
      if (match) {
        const time = parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3]) / 1000;
        const text = line.replace(timeRegex, '').trim();
        if (text) result.push({ time, text });
      }
    });
    return result;
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const resp = await axios.get(`${API_BASE}/music/search`, { params: { keywords: searchQuery } });
      setSearchResults(resp.data);
      setView('player');
    } catch (err) {}
    setLoading(false);
  };

  const handleImportPlaylist = async (id?: string) => {
    const targetId = id || playlistId;
    if (!targetId || !targetId.trim()) return;
    setLoading(true);
    try {
      const resp = await axios.get(`${API_BASE}/music/playlist/${targetId}`);
      setSearchResults(resp.data);
      setView('player');
      fetchRecentPlaylists();
      if (resp.data.length > 0) startBroadcastAndPlay(resp.data[0]);
    } catch (err) { alert('导入失败，请检查歌单 ID'); }
    setLoading(false);
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    const msg = chatInput;
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setChatInput('');
    setIsTyping(true);
    socket.emit('chat-message', msg);
  };

  const fadeVolume = (target: number, duration: number) => {
    if (!audioRef.current) return;
    const initial = audioRef.current.volume;
    const steps = 25;
    const interval = duration / steps;
    const delta = (target - initial) / steps;
    let count = 0;
    const timer = setInterval(() => {
      if (audioRef.current) {
        audioRef.current.volume = Math.max(0, Math.min(1, audioRef.current.volume + delta));
        count++;
        if (count >= steps) { audioRef.current.volume = target; clearInterval(timer); }
      } else { clearInterval(timer); }
    }, interval);
  };

  const startBroadcastAndPlay = async (song: any) => {
    const musicUrlPromise = axios.get(`${API_BASE}/music/url/${song.id}`);
    setIsBroadcasting(true);
    setCurrentSegue('正在建立同步...');
    try {
      const resp = await axios.post(`${API_BASE}/ai/broadcast`, { lastSong: currentSong, nextSong: song });
      setCurrentSegue(resp.data.segue);
      const musicResp = await musicUrlPromise;
      const songUrl = musicResp.data.url;

      if (resp.data.audioUrl && ttsRef.current && audioRef.current) {
        // --- 电台级 Ducking 效果 ---
        // 1. 设置歌曲并以 15% 音量开始播放背景音乐
        setCurrentSong({ ...song, url: songUrl });
        audioRef.current.src = songUrl;
        audioRef.current.volume = volume * 0.15;
        audioRef.current.play();
        setIsPlaying(true);

        // 2. 播放 AI 播报语音
        ttsRef.current.src = `${SERVER_URL}${resp.data.audioUrl}`;
        ttsRef.current.play();
        
        // 3. 播报结束后，平滑恢复正常音量
        ttsRef.current.onended = () => {
          setIsBroadcasting(false);
          fadeVolume(volume, 2500); // 2.5秒渐变恢复
        };
      } else { 
        skipToSong({ ...song, url: songUrl }); 
      }
    } catch (err) { 
      const musicResp = await musicUrlPromise; 
      skipToSong({ ...song, url: musicResp.data.url }); 
    }
  };

  const skipToSong = (song: any) => { setIsBroadcasting(false); actuallyPlaySong(song); };

  const actuallyPlaySong = async (song: any) => {
    try {
      const resp = await axios.get(`${API_BASE}/music/url/${song.id}`);
      if (resp.data.url) {
        setCurrentSong({ ...song, url: resp.data.url });
        if (audioRef.current) { 
            audioRef.current.src = resp.data.url; 
            audioRef.current.volume = volume;
            audioRef.current.play(); 
            setIsPlaying(true); 
        }
      }
    } catch (err) {}
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    isPlaying ? audioRef.current.pause() : audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const actuallyPlayWithDucking = async (song: any) => {
    try {
      const resp = await axios.get(`${API_BASE}/music/url/${song.id}`);
      if (resp.data.url && audioRef.current) {
        audioRef.current.src = resp.data.url;
        audioRef.current.volume = volume * 0.15;
        audioRef.current.play();
        setIsPlaying(true);
        setCurrentSong({ ...song, url: resp.data.url });
        if (ttsRef.current) ttsRef.current.onended = () => fadeVolume(volume, 2500);
      }
    } catch (err) {}
  };

  const handleNext = async () => {
    if (recommendMode) {
      setIsBroadcasting(true);
      setCurrentSegue('正在为你挑选喜欢的音乐...');
      try {
        const resp = await axios.get(`${API_BASE}/music/recommend/single`);
        if (resp.data && resp.data.id) {
          await startBroadcastAndPlay(resp.data);
        } else {
          setIsBroadcasting(false);
          alert('未能获取到推荐曲目，请先导入一些歌单作为备份。');
        }
      } catch (err) {
        setIsBroadcasting(false);
        console.error('Recommend Error', err);
      }
      return;
    }

    if (!currentSong || searchResults.length === 0) return;
    const currentIndex = searchResults.findIndex(s => s.id === currentSong.id);
    let nextIndex = (currentIndex + 1) % searchResults.length;
    if (playMode === 'shuffle') nextIndex = Math.floor(Math.random() * searchResults.length);
    else if (playMode === 'repeat-one') nextIndex = currentIndex;
    startBroadcastAndPlay(searchResults[nextIndex]);
  };

  const handlePrevious = () => {
    if (!currentSong || searchResults.length === 0) return;
    const currentIndex = searchResults.findIndex(s => s.id === currentSong.id);
    const prevIndex = (currentIndex - 1 + searchResults.length) % searchResults.length;
    startBroadcastAndPlay(searchResults[prevIndex]);
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentMoodConfig = mood ? MOOD_CONFIG[mood] : null;

  return (
    <div 
      className="h-screen bg-[#141417] text-zinc-100 flex flex-col font-sans overflow-hidden relative transition-all duration-1000"
      style={{ filter: currentMoodConfig?.filter || 'none' }}
    >
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-25%] right-[-15%] w-[70%] h-[70%] rounded-full mix-blend-screen filter blur-[150px] opacity-20 animate-blob" style={{ backgroundColor: currentMoodConfig?.color || dominantColor }}></div>
        <div className="absolute bottom-[-20%] left-[-15%] w-[60%] h-[60%] rounded-full mix-blend-screen filter blur-[130px] opacity-15 animate-blob" style={{ backgroundColor: currentMoodConfig?.color || dominantColor, animationDelay: '4s' }}></div>
      </div>
      <div className="noise-overlay opacity-[0.03]"></div>

      <audio ref={audioRef} crossOrigin="anonymous" onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)} onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)} onEnded={() => playMode === 'repeat-one' ? (audioRef.current && (audioRef.current.currentTime = 0, audioRef.current.play())) : handleNext()} />
      <audio ref={ttsRef} />
      <audio ref={previewAudioRef} />
      
      <header className="px-10 py-5 border-b border-white/10 flex justify-between items-center bg-black/20 backdrop-blur-3xl z-10 flex-shrink-0">
        <div className="flex items-center gap-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-1000" style={{ backgroundColor: dominantColor, boxShadow: `0 0 40px ${dominantColor}44` }}><Radio size={18} className="text-black" strokeWidth={3} /></div>
          <div><h1 className="text-base font-bold tracking-[0.2em]">CLAUDIO AI</h1><p className="text-[8px] text-zinc-400 uppercase tracking-[0.4em] font-medium">Radio OS v2.0</p></div>
        </div>
        <div className="flex items-center gap-6">
          {scene && (
            <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/10 shadow-sm">
               <span className="w-1 h-1 rounded-full bg-indigo-500 shadow-[0_0_10px_#6366f1]"></span>
               <span className="text-[8px] font-bold tracking-[0.1em] text-zinc-200">{scene}</span>
            </div>
          )}
          <div className="flex items-center gap-5 bg-white/5 px-5 py-2 rounded-xl border border-white/10">
             {weather ? (
               <div className="flex items-center gap-3">
                 <div className="text-zinc-400">{weather.weather.includes('Cloud') ? <Cloud size={14} /> : weather.weather.includes('Rain') ? <CloudRain size={14} /> : <Sun size={14} />}</div>
                 <div className="flex flex-col">
                   <span className="text-[9px] font-bold tracking-tight leading-none text-zinc-100">{weather.city}</span>
                   <span className="text-[8px] font-medium text-zinc-400 tracking-wide mt-1">{weather.temp}° {weather.weather}</span>
                 </div>
               </div>
             ) : <div className="text-[8px] font-medium tracking-[0.2em] text-zinc-500 animate-pulse italic">正在同步环境...</div>}
             <div className="w-px h-5 bg-white/20"></div>
             <div className="flex items-center gap-3">
                <div className={`w-1 h-1 rounded-full ${status === 'Connected' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-rose-500 shadow-[0_0_10px_#f43f5e]'} transition-all`}></div>
                <span className="text-[8px] font-bold tracking-[0.1em] text-zinc-400">{status.toUpperCase()}</span>
             </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 relative z-10">
        <nav className="hidden md:flex md:w-20 border-r border-white/10 p-4 flex-col items-center gap-8 bg-black/40 backdrop-blur-3xl flex-shrink-0">
          <NavIcon icon={<Music size={18} />} active={view === 'player'} onClick={() => setView('player')} activeColor={dominantColor} />
          <NavIcon icon={<AlignLeft size={18} />} active={view === 'lyrics'} onClick={() => setView('lyrics')} activeColor={dominantColor} />
          <NavIcon icon={<PlusCircle size={18} />} active={view === 'import'} onClick={() => setView('import')} activeColor={dominantColor} />
          <NavIcon icon={<MessageSquare size={18} />} active={view === 'chat'} onClick={() => setView('chat')} activeColor={dominantColor} />
          <NavIcon icon={isLoggedIn ? (userProfile?.avatarUrl ? <div style={{ width: '24px', height: '24px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(16, 185, 129, 0.5)' }}><img src={userProfile.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div> : <User size={18} className="text-emerald-500" />) : <LogIn size={18} />} active={view === 'login'} onClick={() => { setView('login'); if(!isLoggedIn) getNewQR(); }} activeColor={dominantColor} />
          <div className="mt-auto">
            <NavIcon icon={<Settings size={18} />} active={view === 'settings'} onClick={() => setView('settings')} activeColor={dominantColor} />
          </div>
        </nav>
        
        <section className="flex-1 overflow-y-auto relative flex flex-col bg-transparent min-h-0">
          {isBroadcasting ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-1000">
               <div className="w-20 h-20 rounded-full border border-zinc-700 flex items-center justify-center mb-16 relative">
                  <div className="absolute inset-0 rounded-full border border-indigo-500/10 animate-ping"></div>
                  <Radio size={24} className="text-zinc-500 animate-pulse" />
               </div>
               <h2 className="text-2xl font-bold tracking-tight mb-8 text-zinc-100">电台同步播报中</h2>
               <div className="max-w-md px-10 py-8 bg-white/5 rounded-[2rem] border border-white/10 backdrop-blur-3xl relative">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-zinc-100 text-black text-[8px] font-bold tracking-[0.2em] rounded-full shadow-xl">AI 播音员</div>
                  <p className="text-base font-medium leading-loose text-zinc-300 italic">"{currentSegue}"</p>
               </div>
            </div>
          ) : view === 'lyrics' ? (
            <div className="flex-1 overflow-y-auto p-12 scrollbar-hide flex flex-col items-center" ref={lyricsScrollRef}>
               {lyrics.length > 0 ? (
                 <div className="w-full max-w-2xl py-64 space-y-16 text-center">
                   {lyrics.map((l, i) => (
                     <div 
                        key={i} 
                        data-lyric-index={i} 
                        className={`transition-all duration-1000 cursor-pointer ${i === currentLyricIndex ? 'text-2xl md:text-4xl font-bold opacity-100 blur-0 scale-105' : 'text-lg md:text-xl font-medium opacity-10 blur-[1.5px] scale-95 hover:opacity-20 hover:blur-0'} `} 
                        style={{ 
                          color: i === currentLyricIndex ? '#ffffff' : 'inherit',
                          textShadow: i === currentLyricIndex ? `0 0 25px ${dominantColor}` : 'none'
                        }} 
                        onClick={() => audioRef.current && (audioRef.current.currentTime = l.time)}
                     >
                       {l.text}
                     </div>
                   ))}
                 </div>
               ) : (
                 <div className="flex-1 flex flex-col items-center justify-center text-zinc-900">
                    <AlignLeft size={48} strokeWidth={1.5} className="mb-8 opacity-20" />
                    <p className="text-[10px] font-medium tracking-[0.3em] opacity-50 text-zinc-400">暂无歌词信号</p>
                 </div>
               )}
            </div>
          ) : view === 'chat' ? (
            <div className="flex-1 flex flex-col min-h-0 bg-transparent">
               <div className="flex-1 overflow-y-auto p-10 space-y-12 scrollbar-hide">
                  {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                       <div className="w-14 h-14 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center mb-8"><Sparkles size={20} className="text-zinc-400" /></div>
                       <h3 className="text-xl font-bold tracking-widest mb-4 text-zinc-200">神经交互界面</h3>
                       <p className="text-zinc-400 text-[10px] font-medium tracking-[0.2em] max-w-xs leading-loose">告诉我你的心情，或者对电台下达指令。我在倾听。</p>
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-700`}>
                       <div className={`max-w-[70%] px-7 py-4 rounded-2xl text-xs font-medium tracking-wide leading-relaxed shadow-xl ${m.role === 'user' ? 'bg-zinc-100 text-black' : 'bg-zinc-900/30 text-zinc-100 border border-white/10 backdrop-blur-xl'}`}>
                          {m.content}
                       </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start animate-pulse">
                       <div className="bg-zinc-900/40 px-5 py-3 rounded-full border border-white/10 flex gap-1.5">
                          <span className="w-1 h-1 bg-zinc-500 rounded-full"></span>
                          <span className="w-1 h-1 bg-zinc-500 rounded-full"></span>
                          <span className="w-1 h-1 bg-zinc-500 rounded-full"></span>
                       </div>
                    </div>
                  )}
                  <div ref={chatEndRef}></div>
               </div>
               <div className="p-10">
                  <div className="flex gap-4 max-w-2xl mx-auto bg-white/5 p-2 rounded-2xl border border-white/10 backdrop-blur-2xl transition-all shadow-2xl">
                     <input type="text" placeholder="输入指令或与电台助手交谈..." className="bg-transparent flex-1 px-6 focus:outline-none font-medium tracking-wide text-[10px] placeholder:text-zinc-500 text-zinc-100" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} />
                     <button onClick={handleSendMessage} className="w-10 h-10 bg-zinc-100 text-black rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"><Send size={14} /></button>
                  </div>
               </div>
            </div>
          ) : view === 'settings' ? (
            <div className="flex-1 overflow-y-auto p-12 scrollbar-hide">
                <div className="max-w-2xl mx-auto space-y-20">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold tracking-widest mb-3 text-zinc-100">音频核心配置</h2>
                        <p className="text-zinc-400 font-medium tracking-[0.3em] text-[8px]">Neural Voice Engine Settings</p>
                    </div>
                    
                    <div className="space-y-8">
                        <h3 className="text-[9px] font-bold tracking-[0.2em] text-zinc-400 text-center uppercase">播报语速调整</h3>
                        <div className="flex justify-center gap-2">
                           {['-20%', '-18%', '-10%', '0%', '+10%'].map(s => (
                             <button key={s} onClick={() => handleSpeedChange(s)} className={`px-5 py-2 rounded-lg text-[9px] font-bold transition-all ${currentSpeed === s ? 'bg-zinc-100 text-black shadow-xl' : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'}`}>{s}</button>
                           ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-20">
                        {availableVoices.map(voice => (
                            <div key={voice.id} className={`p-7 rounded-2xl border transition-all duration-700 group ${currentVoiceId === voice.id ? 'bg-white/10 border-white/20 shadow-2xl' : 'bg-white/5 border-white/5 hover:border-white/10'}`}>
                                <div className="flex justify-between items-start mb-6">
                                   <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-700 ${currentVoiceId === voice.id ? 'bg-zinc-100 text-black shadow-[0_0_20px_rgba(255,255,255,0.1)]' : 'bg-black text-zinc-400 border border-white/10'}`}>
                                      <Headphones size={18} />
                                   </div>
                                   <div className={`px-2.5 py-0.5 rounded-full text-[7px] font-bold tracking-widest ${voice.gender === 'Male' ? 'bg-blue-500/10 text-blue-400' : 'bg-pink-500/10 text-pink-400'}`}>{voice.gender === 'Male' ? '男声' : '女声'}</div>
                                </div>
                                <h4 className="text-base font-bold tracking-tight mb-2 text-zinc-100">{voice.name}</h4>
                                <p className="text-[9px] font-medium text-zinc-400 tracking-wide leading-relaxed mb-8 h-8 overflow-hidden line-clamp-2">{voice.desc}</p>
                                <div className="flex gap-2">
                                   <button onClick={() => handlePreviewVoice(voice.id)} className={`flex-1 py-2.5 rounded-lg text-[8px] font-bold tracking-widest transition-all ${isPreviewing === voice.id ? 'bg-indigo-600 text-white animate-pulse' : 'bg-white/10 text-zinc-300 hover:bg-white/20'}`}>{isPreviewing === voice.id ? '合成中...' : '试听'}</button>
                                   <button onClick={() => handleSelectVoice(voice.id)} className={`flex-1 py-2.5 rounded-lg text-[8px] font-bold tracking-widest transition-all ${currentVoiceId === voice.id ? 'bg-emerald-500 text-white shadow-lg' : 'bg-zinc-100 text-black hover:scale-[1.02]'}`}>{currentVoiceId === voice.id ? '当前使用' : '应用音色'}</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
          ) : view === 'login' ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 bg-transparent">
               <div className="max-w-sm w-full bg-white/5 border border-white/10 rounded-[3rem] p-12 text-center relative overflow-hidden backdrop-blur-3xl shadow-2xl">
                  <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent opacity-50"></div>
                  
                  {isLoggedIn ? (
                    <div className="space-y-8 animate-in zoom-in-95 duration-1000">
                      <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                        <CheckCircle2 size={32} className="text-emerald-500" />
                      </div>
                      <div>
                         <h2 className="text-xl font-bold tracking-widest mb-2 text-zinc-100">身份已同步</h2>
                         <p className="text-zinc-400 font-medium tracking-[0.2em] text-[8px]">Cloud Identity Link established</p>
                      </div>
                      <button onClick={() => setView('player')} className="px-10 py-3 bg-zinc-200 text-black rounded-xl font-bold tracking-widest text-[9px] hover:scale-105 transition-all shadow-xl">进入电台</button>
                    </div>
                  ) : (
                    <>
                      <div className="mb-10">
                         <h2 className="text-xl font-bold tracking-widest mb-2 text-zinc-100">云端身份同步</h2>
                         <p className="text-zinc-400 font-medium tracking-[0.3em] text-[8px]">Sync Netease Credentials</p>
                      </div>
                      
                      <div className="relative group mx-auto mb-12 w-48 h-48 bg-white rounded-[2rem] p-4 shadow-2xl border border-white/10">
                         {qrImg ? (
                            <img src={qrImg} className="w-full h-full object-contain rounded-xl opacity-90 hover:opacity-100 transition-opacity" />
                         ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-100">
                               <Loader2 className="animate-spin opacity-20" size={32} />
                            </div>
                         )}
                         
                         {loginStatus.code === 802 && (
                            <div className="absolute inset-0 bg-white/95 backdrop-blur-md rounded-[2rem] flex flex-col items-center justify-center p-6 text-black animate-in fade-in duration-500">
                               <Sparkles size={32} className="mb-4 text-indigo-600 animate-pulse" />
                               <div className="font-bold tracking-widest text-[9px] leading-relaxed text-zinc-600">正在等待手机确认...</div>
                            </div>
                         )}
                      </div>

                      <div className={`inline-flex items-center gap-3 px-6 py-2.5 rounded-full border text-[8px] font-bold tracking-widest transition-all duration-700 ${loginStatus.code === 802 ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'bg-white/10 border-white/10 text-zinc-300'}`}>
                         {loginStatus.code === 802 ? <QrCode size={10} /> : <Loader2 size={10} className={qrImg ? '' : 'animate-spin'} />}
                         {loginStatus.message}
                      </div>

                      <div className="mt-12">
                        <button onClick={getNewQR} className="text-zinc-400 hover:text-zinc-200 text-[8px] font-medium tracking-[0.2em] underline decoration-zinc-800 underline-offset-8 transition-all">刷新同步令牌</button>
                      </div>
                    </>
                  )}
               </div>
            </div>
          ) : view === 'player' ? (
            <div className="flex-1 flex flex-col items-center p-12 overflow-y-auto scrollbar-hide">
               <div className="w-full max-w-3xl">
                  <div className="flex flex-col md:flex-row items-center gap-16 mb-24">
                     <div className="w-56 h-56 rounded-[3rem] overflow-hidden shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] border border-white/10 relative group bg-zinc-900 transition-all duration-1000" style={{ boxShadow: `0 30px 100px -30px ${dominantColor}44` }}>
                        {currentSong?.cover ? <img src={currentSong.cover} className={`w-full h-full object-cover transition-transform duration-[6s] ${isPlaying ? 'scale-110' : 'scale-100'}`} /> : <Music className="m-20 text-zinc-700 opacity-20" size={50} />}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-700 flex items-end p-6"><div className="w-full h-[1px] bg-white/10 rounded-full overflow-hidden backdrop-blur-md"><div className="h-full bg-white transition-all duration-500 shadow-[0_0_8px_#fff]" style={{ width: `${(currentTime/duration)*100}%` }}></div></div></div>
                     </div>
                     <div className="flex-1 text-center md:text-left">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/10 mb-8 shadow-sm"><div className="w-1 h-1 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e] animate-pulse"></div><span className="text-[8px] font-bold tracking-[0.3em] text-zinc-200">频率信号已就绪</span></div>
                        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 leading-tight text-white">{currentSong?.name || '待机模式'}</h2>
                        <p className="text-base md:text-lg font-medium text-zinc-400 tracking-[0.3em] mb-12">{currentSong?.artist || 'STATION IDLE'}</p>
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-5">
                           <div className="flex gap-3 bg-white/5 p-1.5 rounded-xl border border-white/10 backdrop-blur-3xl shadow-xl focus-within:border-white/10 transition-all">
                              <input type="text" placeholder="寻找新的旋律..." className="bg-transparent px-6 py-2.5 w-48 focus:outline-none font-medium tracking-wide text-[9px] placeholder:text-zinc-600 text-zinc-100" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
                              <button onClick={handleSearch} className="w-10 h-10 bg-zinc-100 text-black rounded-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"><Search size={14} strokeWidth={2.5} /></button>
                           </div>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-6">
                     <div className="flex items-center justify-between mb-8 px-2">
                        <div className="flex items-center gap-3">
                           <Sparkles size={12} className="text-zinc-400" />
                           <h3 className="text-[9px] font-bold tracking-[0.3em] text-zinc-200 uppercase">信号队列</h3>
                        </div>
                        <div className="text-[8px] font-bold text-zinc-500 tracking-widest uppercase">已检测到 {searchResults.length} 条信号</div>
                     </div>
                     <div className="grid grid-cols-1 gap-2 pb-20">
                        {searchResults.map((song, i) => (
                          <div key={song.id} onClick={() => startBroadcastAndPlay(song)} className={`group flex items-center gap-7 p-4 rounded-2xl cursor-pointer transition-all duration-700 ${currentSong?.id === song.id ? 'bg-zinc-100 text-black shadow-2xl scale-[1.01]' : 'hover:bg-white/10 text-zinc-300 hover:text-white'}`}>
                             <div className="w-6 text-[9px] font-bold opacity-10 group-hover:opacity-100 tabular-nums tracking-widest">{(i+1).toString().padStart(2, '0')}</div>
                             <div className="flex-1 min-w-0">
                                <div className="font-bold text-xs truncate tracking-tight mb-1">{song.name}</div>
                                <div className={`text-[8px] font-medium tracking-wide ${currentSong?.id === song.id ? 'text-black/40' : 'text-zinc-400 group-hover:text-zinc-300'}`}>{song.artist}</div>
                             </div>
                             <div className="text-[9px] font-medium opacity-30 tabular-nums tracking-tight">{formatTime(song.duration / 1000)}</div>
                             <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-500 ${currentSong?.id === song.id ? 'bg-black text-white shadow-md' : 'bg-white/10 opacity-0 group-hover:opacity-100'}`}>{currentSong?.id === song.id && isPlaying ? <Gauge size={14} className="animate-spin-slow" /> : <Play size={14} fill="currentColor" />}</div>
                          </div>
                        ))}
                        {searchResults.length === 0 && (
                           <div className="py-20 text-center border border-dashed border-white/5 rounded-[2.5rem]">
                              <p className="text-[9px] font-bold tracking-[0.3em] text-zinc-600 uppercase">无信号排队中</p>
                           </div>
                        )}
                     </div>
                  </div>
               </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center p-12 overflow-y-auto scrollbar-hide">
                <div className="w-full max-w-4xl flex flex-col items-center">
                  <div className="text-center mb-16">
                     <h2 className="text-3xl md:text-4xl font-bold tracking-[0.2em] mb-4 text-zinc-100 uppercase">库节点同步</h2>
                     <p className="text-zinc-500 font-medium tracking-[0.3em] text-[8px]">Neural Library Integration</p>
                  </div>
                  
                  <div className="flex gap-4 w-full max-w-lg mb-20 bg-white/5 p-2 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-2xl focus-within:border-white/20 transition-all">
                    <input type="text" placeholder="输入网易云歌单 ID 或链接..." className="bg-transparent border-none rounded-xl px-7 flex-1 focus:outline-none font-medium tracking-wide text-[9px] placeholder:text-zinc-700 text-zinc-100" value={playlistId} onChange={(e) => setPlaylistId(e.target.value)} />
                    <button onClick={() => handleImportPlaylist()} disabled={loading} className="px-8 py-3 rounded-xl font-bold tracking-widest text-[9px] transition-all shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-50 text-black bg-zinc-200">{loading ? '同步中...' : '部署'}</button>
                  </div>

                  {isLoggedIn && userPlaylists.length > 0 && (
                    <div className="w-full mb-24">
                       <div className="flex items-center gap-4 justify-center mb-12 opacity-40">
                          <div className="h-px w-10 bg-current"></div>
                          <h3 className="text-zinc-200 font-bold tracking-[0.3em] text-[9px] uppercase">你的收藏节点</h3>
                          <div className="h-px w-10 bg-current"></div>
                       </div>
                       <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 px-4">
                          {userPlaylists.map(pl => (
                            <div key={pl.id} onClick={() => handleImportPlaylist(pl.id)} className="group p-4 rounded-[2rem] bg-white/5 border border-white/5 hover:border-white/20 hover:bg-white/[0.08] cursor-pointer transition-all duration-700 backdrop-blur-md shadow-2xl hover:-translate-y-1.5">
                              <div className="w-full aspect-square rounded-[1.5rem] overflow-hidden mb-5 shadow-xl relative">
                                <img src={pl.cover} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[2s]" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                   <Play className="text-white" size={20} fill="white" />
                                </div>
                              </div>
                              <div className="font-bold text-zinc-100 text-[10px] tracking-wide truncate mb-1.5 px-1 text-center opacity-80 group-hover:opacity-100">{pl.name}</div>
                              <div className="text-[7px] font-medium text-zinc-400 tracking-wide text-center uppercase">{pl.trackCount} 首信号</div>
                            </div>
                          ))}
                       </div>
                    </div>
                  )}

                  {recentPlaylists.length > 0 && (
                    <div className="w-full pb-20 opacity-60 hover:opacity-100 transition-opacity">
                       <div className="flex items-center gap-4 justify-center mb-10">
                          <div className="h-px w-8 bg-zinc-800"></div>
                          <h3 className="text-zinc-400 font-bold tracking-[0.2em] text-[8px] uppercase">历史同步记录</h3>
                          <div className="h-px w-8 bg-zinc-800"></div>
                       </div>
                       <div className="grid grid-cols-3 md:grid-cols-6 gap-5 px-4">
                          {recentPlaylists.map(pl => (
                            <div key={pl.id} onClick={() => handleImportPlaylist(pl.id)} className="group p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 cursor-pointer transition-all">
                              <div className="w-full aspect-square rounded-xl overflow-hidden mb-4 shadow-lg">
                                {pl.cover ? <img src={pl.cover} className="w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700" /> : <div className="w-full h-full bg-zinc-900 flex items-center justify-center"><ListMusic className="text-zinc-700" size={16} /></div>}
                              </div>
                              <div className="font-medium text-zinc-300 text-[8px] tracking-tight truncate opacity-60 group-hover:opacity-100 text-center">{pl.name}</div>
                            </div>
                          ))}
                       </div>
                    </div>
                  )}
                </div>
            </div>
          )}
        </section>
      </main>

      <footer className="h-24 bg-black/60 backdrop-blur-3xl border-t border-white/10 px-10 flex flex-col justify-center relative z-20">
        <canvas ref={visualizerCanvasRef} className="absolute top-0 left-0 w-full h-10 pointer-events-none opacity-20" width={1200} height={120} />
        <div className="flex items-center gap-5 px-1 mb-2.5 relative z-10">
          <span className="text-[8px] font-bold text-zinc-400 tabular-nums w-10 tracking-widest">{formatTime(currentTime)}</span>
          <div className="flex-1 relative group py-2">
             <input type="range" min="0" max={duration || 0} value={currentTime} onChange={(e) => audioRef.current && (audioRef.current.currentTime = Number(e.target.value))} className="w-full h-[1px] bg-white/10 rounded-full appearance-none cursor-pointer group-hover:bg-white/20 transition-all" style={{ accentColor: dominantColor }} />
          </div>
          <span className="text-[8px] font-bold text-zinc-400 tabular-nums w-10 tracking-widest text-right">{formatTime(duration)}</span>
        </div>
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-5 w-1/3">
            <div onClick={() => setView('lyrics')} className="w-11 h-11 bg-zinc-950 rounded-xl overflow-hidden border border-white/10 flex-shrink-0 cursor-pointer group relative shadow-xl transition-all duration-500 hover:scale-105 active:scale-95" style={{ boxShadow: `0 10px 30px -5px ${dominantColor}22` }}>
              {currentSong?.cover ? <img src={currentSong.cover} className="w-full h-full object-cover group-hover:opacity-40 transition-all duration-500" /> : <Music className="text-zinc-800 m-3" size={16} />}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500"><AlignLeft size={16} className="text-zinc-100" /></div>
            </div>
            <div className="min-w-0">
              <div className="font-bold text-zinc-100 text-[13px] tracking-tight truncate leading-tight mb-1">{currentSong?.name || '未在播放'}</div>
              <div className="text-[8px] font-medium text-zinc-500 tracking-wider uppercase opacity-80">{currentSong?.artist || 'Waiting for Signal'}</div>
            </div>
          </div>
          <div className="flex items-center gap-10 justify-center w-1/3">
            <button 
              onClick={() => setRecommendMode(!recommendMode)} 
              className="transition-all hover:scale-110 active:scale-90 flex flex-col items-center gap-1.5"
              style={{ color: recommendMode ? '#10b981' : '#3f3f46' }}
            >
              <div className={`p-1.5 rounded-lg transition-all duration-500 ${recommendMode ? 'bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'hover:bg-white/10'}`}>
                <Heart size={16} fill={recommendMode ? 'currentColor' : 'none'} strokeWidth={2.5} />
              </div>
              <span className="text-[6px] font-bold tracking-widest opacity-40">AI MODE</span>
            </button>
            <div className="w-px h-5 bg-white/10 mx-1"></div>
            <button onClick={() => {const modes:any=['sequential','shuffle','repeat-one']; setPlayMode(modes[(modes.indexOf(playMode)+1)%3])}} className="transition-all hover:scale-110 opacity-20 hover:opacity-100" style={{ color: playMode !== 'sequential' ? dominantColor : 'inherit' }}>{playMode==='sequential'?<Repeat size={16}/>:playMode==='shuffle'?<Shuffle size={16}/>:<Repeat1 size={16}/>}</button>
            <button onClick={handlePrevious} disabled={!currentSong} className="text-zinc-400 hover:text-white transition-all hover:scale-110 disabled:opacity-10"><SkipBack size={20} fill="currentColor" /></button>
            <button onClick={togglePlay} disabled={!currentSong} className="w-12 h-12 rounded-2xl text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl relative overflow-hidden group" style={{ backgroundColor: dominantColor, boxShadow: `0 8px 30px -5px ${dominantColor}66` }}>
               <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
               <div className="relative z-10">{isPlaying ? <Pause size={24} fill="black" /> : <Play size={24} fill="black" className="ml-0.5" />}</div>
            </button>
            <button onClick={handleNext} disabled={!currentSong} className="text-zinc-400 hover:text-white transition-all hover:scale-110 disabled:opacity-10"><SkipForward size={20} fill="currentColor" /></button>
          </div>
          <div className="flex items-center gap-4 justify-end w-1/3 pr-4">
            <Volume2 size={12} className="text-zinc-400" />
            <div className="w-20 group relative py-2">
               <input type="range" min="0" max={1} step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-full h-[1px] bg-white/10 rounded-full appearance-none cursor-pointer group-hover:bg-white/20 transition-all" style={{ accentColor: dominantColor }} />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function NavIcon({ icon, active, onClick, activeColor }: { icon: any, active: boolean, onClick: () => void, activeColor: string }) {
  return (<button onClick={onClick} className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-700 ${active ? 'bg-zinc-100 shadow-2xl scale-110' : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/10'}`} style={{ color: active ? 'black' : undefined, backgroundColor: active ? activeColor : undefined }}>{icon}</button>);
}

export default App;
