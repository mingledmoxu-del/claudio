import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { Radio, Music, MessageSquare, Search, Play, Pause, ListMusic, PlusCircle, Mic2, Send, Cloud, Sun, CloudRain, SkipBack, SkipForward, Volume2, Shuffle, Repeat, Repeat1, AlignLeft } from 'lucide-react';
import axios from 'axios';

const socket = io('http://localhost:3000');
const API_BASE = 'http://localhost:3000/api';
const SERVER_URL = 'http://localhost:3000';

function App() {
  const [status, setStatus] = useState('Disconnected');
  const [searchQuery, setSearchQuery] = useState('');
  const [playlistId, setPlaylistId] = useState('');
  const [recentPlaylists, setRecentPlaylists] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentSong, setCurrentSong] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [view, setView] = useState<'player' | 'import' | 'chat' | 'lyrics'>('player');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [currentSegue, setCurrentSegue] = useState('');
  const [weather, setWeather] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [playMode, setPlayMode] = useState<'sequential' | 'shuffle' | 'repeat-one'>('sequential');
  const [recommendMode, setRecommendMode] = useState(false);
  
  // Visuals state
  const [dominantColor, setDominantColor] = useState('#6366f1');
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [scene, setScene] = useState<string | null>(null);

  const MOOD_CONFIG: Record<string, { color: string, filter: string }> = {
    HAPPY: { color: '#fbbf24', filter: 'brightness(1.2) saturate(1.2)' },
    SAD: { color: '#3b82f6', filter: 'grayscale(0.4) brightness(0.8)' },
    CALM: { color: '#10b981', filter: 'sepia(0.1) brightness(0.9)' },
    TIRED: { color: '#8b5cf6', filter: 'blur(1px) brightness(0.7)' },
    EXCITED: { color: '#ef4444', filter: 'contrast(1.3) saturate(1.5)' },
  };

  // Lyrics state
  const [lyrics, setLyrics] = useState<{time: number, text: string}[]>([]);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsRef = useRef<HTMLAudioElement | null>(null);
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
        ttsRef.current.onended = () => setIsBroadcasting(false);
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

    fetchWeather();
    fetchRecentPlaylists();

    return () => {
      socket.off('connect'); socket.off('disconnect'); socket.off('chat-reply');
      socket.off('auto-broadcast'); socket.off('player-command');
      window.removeEventListener('click', handleFirstInteraction);
    };
  }, [isPlaying, currentSong, playMode, searchResults, recommendMode]);

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
        const next = lyrics[i + 1];
        return currentTime >= l.time && (!next || currentTime < next.time);
      });
      if (index !== -1 && index !== currentLyricIndex) setCurrentLyricIndex(index);
    }
  }, [currentTime, lyrics]);

  useEffect(() => {
    if (view === 'lyrics' && lyricsScrollRef.current && currentLyricIndex !== -1) {
      const timer = setTimeout(() => {
        if (!lyricsScrollRef.current) return;
        const activeLine = lyricsScrollRef.current.children[currentLyricIndex] as HTMLElement;
        if (activeLine) {
          activeLine.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [currentLyricIndex, view]);

  useEffect(() => {
    if (!analyser || !visualizerCanvasRef.current) return;
    const canvas = visualizerCanvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
      requestAnimationFrame(draw);
      if (!isPlaying) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength);
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, `${dominantColor}00`);
        gradient.addColorStop(1, dominantColor);
        ctx.fillStyle = gradient;
        ctx.shadowBlur = 15;
        ctx.shadowColor = dominantColor;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
      }
    };
    const animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [analyser, isPlaying, dominantColor]);

  const extractDominantColor = (imgUrl: string) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imgUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = 1; canvas.height = 1;
      ctx.drawImage(img, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      setDominantColor(`rgb(${r}, ${g}, ${b})`);
    };
    img.onerror = () => setDominantColor('#6366f1');
  };

  const fetchLyrics = async (id: string) => {
    try {
      const resp = await axios.get(`${API_BASE}/music/lyric/${id}`);
      if (resp.data.lyric) parseLyrics(resp.data.lyric);
      else setLyrics([{ time: 0, text: 'No Lyrics Found' }]);
    } catch (err) { setLyrics([{ time: 0, text: 'Lyrics failed to load' }]); }
  };

  const parseLyrics = (lrc: string) => {
    const lines = lrc.split('\n');
    const parsed = lines.map(line => {
      const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
      if (match) {
        const minutes = parseInt(match[1]);
        const seconds = parseFloat(match[2]);
        return { time: minutes * 60 + seconds, text: match[3].trim() };
      }
      return null;
    }).filter((l): l is {time: number, text: string} => l !== null && l.text !== '');
    setLyrics(parsed);
  };

  const fadeVolume = (target: number, durationMs: number = 2500) => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    const startVolume = audio.volume;
    const startTime = performance.now();
    const animate = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const easeProgress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      if (audio) {
        audio.volume = startVolume + (target - startVolume) * easeProgress;
        if (progress < 1) requestAnimationFrame(animate);
        else audio.volume = target;
      }
    };
    requestAnimationFrame(animate);
  };

  const fetchWeather = async () => {
    try {
      const resp = await axios.get(`${API_BASE}/weather`);
      setWeather(resp.data);
    } catch (err) {}
  };

  const handleImportPlaylist = async () => {
    if (!playlistId.trim()) return;
    setLoading(true);
    try {
      const resp = await axios.get(`${API_BASE}/music/playlist/${playlistId}`);
      setSearchResults(resp.data);
      setView('player');
      setPlaylistId('');
      fetchRecentPlaylists();
    } catch (err) { alert('Import Failed'); } finally { setLoading(false); }
  };

  const fetchRecentPlaylists = async () => {
    try {
      const resp = await axios.get(`${API_BASE}/playlists`);
      setRecentPlaylists(resp.data);
    } catch (err) {}
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: chatInput }]);
    socket.emit('chat-message', chatInput);
    setChatInput('');
    setIsTyping(true);
  };

  const startBroadcastAndPlay = async (song: any) => {
    setIsBroadcasting(true);
    setCurrentSegue('正在准备播报...');
    const broadcastPromise = axios.post(`${API_BASE}/ai/broadcast`, { nextSong: song, lastSong: currentSong });
    const musicUrlPromise = axios.get(`${API_BASE}/music/url/${song.id}`);
    try {
      const aiResp = await broadcastPromise;
      const musicResp = await musicUrlPromise;
      setCurrentSegue(aiResp.data.segue);
      const songUrl = musicResp.data.url;
      if (aiResp.data.audioUrl && ttsRef.current) {
        ttsRef.current.src = `${SERVER_URL}${aiResp.data.audioUrl}`;
        ttsRef.current.play();
        if (songUrl && audioRef.current) {
          audioRef.current.src = songUrl;
          audioRef.current.volume = volume * 0.15;
          audioRef.current.play();
          setIsPlaying(true);
          setCurrentSong({ ...song, url: songUrl });
        }
        ttsRef.current.onended = () => { setIsBroadcasting(false); fadeVolume(volume, 2000); };
      } else { skipToSong({ ...song, url: songUrl }); }
    } catch (err) { const musicResp = await musicUrlPromise; skipToSong({ ...song, url: musicResp.data.url }); }
  };

  const skipToSong = (song: any) => { setIsBroadcasting(false); actuallyPlaySong(song); };

  const actuallyPlaySong = async (song: any) => {
    try {
      const resp = await axios.get(`${API_BASE}/music/url/${song.id}`);
      if (resp.data.url) {
        setCurrentSong({ ...song, url: resp.data.url });
        if (audioRef.current) { audioRef.current.src = resp.data.url; audioRef.current.play(); setIsPlaying(true); }
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
        if (ttsRef.current) ttsRef.current.onended = () => fadeVolume(volume, 2000);
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
      className="h-screen bg-black text-zinc-100 flex flex-col font-sans overflow-hidden relative transition-all duration-1000"
      style={{ filter: currentMoodConfig?.filter || 'none' }}
    >
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full mix-blend-screen filter blur-[120px] opacity-30 animate-blob" style={{ backgroundColor: currentMoodConfig?.color || dominantColor }}></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full mix-blend-screen filter blur-[100px] opacity-20 animate-blob" style={{ backgroundColor: currentMoodConfig?.color || dominantColor, animationDelay: '2s' }}></div>
      </div>
      <div className="noise-overlay"></div>

      <audio ref={audioRef} crossOrigin="anonymous" onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)} onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)} onEnded={() => playMode === 'repeat-one' ? (audioRef.current && (audioRef.current.currentTime = 0, audioRef.current.play())) : handleNext()} />
      <audio ref={ttsRef} />
      
      <header className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20 backdrop-blur-2xl z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-2xl transition-all duration-1000" style={{ backgroundColor: dominantColor, boxShadow: `0 0 20px ${dominantColor}66` }}><Radio size={24} /></div>
          <div><h1 className="text-xl font-black tracking-tighter uppercase italic">Claudio AI</h1><p className="text-[10px] text-zinc-500 uppercase tracking-[0.3em] font-bold">Studio Engine v2.0</p></div>
        </div>
        <div className="flex items-center gap-6">
          {scene && (
            <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10 animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: currentMoodConfig?.color || dominantColor }}></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{scene}</span>
            </div>
          )}
          {weather && (
            <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-white/5 rounded-full border border-white/5 backdrop-blur-md">
              <div className="text-indigo-400">{weather.weather.includes('雨') ? <CloudRain size={18} /> : weather.weather.includes('云') ? <Cloud size={18} /> : <Sun size={18} />}</div>
              <div className="text-xs font-bold tracking-tight"><span>{weather.city}</span><span className="mx-2 opacity-20">|</span><span className="text-zinc-400">{weather.weather}</span><span className="ml-2" style={{ color: dominantColor }}>{weather.temp}°C</span></div>
            </div>
          )}
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${status === 'Connected' ? 'border-green-500/20 text-green-500 bg-green-500/5' : 'border-red-500/20 text-red-500 bg-red-500/5'}`}>{status}</div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 relative z-10">
        <nav className="hidden md:flex md:w-20 border-r border-white/5 p-4 flex-col items-center gap-6 bg-black/20 backdrop-blur-xl flex-shrink-0">
          <NavIcon icon={<Music size={22} />} active={view === 'player'} onClick={() => setView('player')} activeColor={dominantColor} />
          <NavIcon icon={<AlignLeft size={22} />} active={view === 'lyrics'} onClick={() => setView('lyrics')} activeColor={dominantColor} />
          <NavIcon icon={<PlusCircle size={22} />} active={view === 'import'} onClick={() => setView('import')} activeColor={dominantColor} />
          <NavIcon icon={<MessageSquare size={22} />} active={view === 'chat'} onClick={() => setView('chat')} activeColor={dominantColor} />
        </nav>
        
        <section className="flex-1 overflow-y-auto relative flex flex-col bg-transparent min-h-0">
          {isBroadcasting && (
            <div className="absolute inset-0 bg-black/90 backdrop-blur-3xl z-40 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-1000">
               <div className="relative mb-24">
                  <div className="absolute inset-0 rounded-full animate-ping scale-[2] opacity-10" style={{ backgroundColor: currentMoodConfig?.color || dominantColor }}></div>
                  <div className="w-32 h-32 rounded-full flex items-center justify-center relative shadow-2xl transition-all duration-1000" style={{ backgroundColor: currentMoodConfig?.color || dominantColor, boxShadow: `0 0 100px ${currentMoodConfig?.color || dominantColor}44` }}>
                    <Mic2 size={48} className="text-black" />
                  </div>
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-white text-black text-[10px] font-black uppercase tracking-[0.3em] rounded-full whitespace-nowrap">On Air</div>
               </div>
              <div className="max-w-5xl space-y-12">
                <h3 className="text-zinc-500 font-bold uppercase tracking-[0.8em] text-[10px] opacity-50">Transmitting Atmosphere</h3>
                <p 
                  className="text-4xl md:text-6xl font-serif italic text-white leading-[1.6] px-12"
                  style={{ fontFamily: "'Playfair Display', 'Noto Serif SC', serif", textShadow: '0 0 40px rgba(255,255,255,0.1)' }}
                >
                  {currentSegue === '正在准备播报...' ? 
                    <span className="opacity-20 animate-pulse font-sans not-italic tracking-widest text-2xl">Initializing Neural Voice...</span> : 
                    `“ ${currentSegue} ”`
                  }
                </p>
              </div>
              <button onClick={() => setIsBroadcasting(false)} className="mt-24 px-12 py-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-zinc-500 text-[10px] font-black uppercase tracking-[0.4em] transition-all hover:scale-105 active:scale-95">Interrupt Transmission</button>
            </div>
          )}

          {view === 'player' ? (
             <div className="flex-1 overflow-y-auto p-12 scrollbar-hide">
                <div className="max-w-5xl mx-auto">
                    <form onSubmit={(e) => e.preventDefault()} className="relative mb-16">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-500" size={24} />
                        <input type="text" placeholder="DISCOVER NEW SOUNDS..." className="w-full bg-white/5 border border-white/5 rounded-3xl py-6 pl-16 pr-6 focus:outline-none focus:border-white/10 transition-all font-black uppercase tracking-widest text-sm backdrop-blur-md" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </form>
                    <div className="grid gap-3">
                        {searchResults.map(song => (
                            <div key={song.id} onClick={() => startBroadcastAndPlay(song)} className="flex items-center gap-6 p-4 rounded-2xl hover:bg-white/5 border border-transparent hover:border-white/5 cursor-pointer group transition-all backdrop-blur-sm">
                                <div className="w-16 h-16 bg-zinc-900 rounded-2xl overflow-hidden flex items-center justify-center relative shadow-xl">
                                    {song.cover ? <img src={song.cover} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" /> : <Music className="text-zinc-800" />}
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-500"><Play size={28} fill="white" className="ml-1" /></div>
                                </div>
                                <div className="flex-1">
                                  <div className="font-black text-white text-lg tracking-tight uppercase truncate">{song.name}</div>
                                  <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-1">{song.artist}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
             </div>
          ) : view === 'lyrics' ? (
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
               <div className="md:w-1/3 p-12 flex flex-col justify-center items-center md:items-start text-center md:text-left border-r border-white/5 bg-black/10 backdrop-blur-sm">
                  {currentSong ? (
                    <>
                      <div className="w-64 h-64 rounded-3xl overflow-hidden shadow-2xl mb-8 border border-white/10 transition-all duration-1000" style={{ boxShadow: `0 30px 60px -12px ${dominantColor}44` }}>
                        <img src={currentSong.cover} className="w-full h-full object-cover" />
                      </div>
                      <h2 className="text-4xl font-black tracking-tighter uppercase italic text-white mb-2">{currentSong.name}</h2>
                      <p className="text-lg font-bold uppercase tracking-[0.3em] text-zinc-500 mb-8">{currentSong.artist}</p>
                      <div className="flex gap-4">
                        <button onClick={togglePlay} className="px-8 py-3 rounded-full font-black uppercase tracking-widest text-[10px] transition-all" style={{ backgroundColor: dominantColor, color: 'black' }}>{isPlaying ? 'Pause' : 'Play Now'}</button>
                        <button onClick={() => setView('player')} className="px-8 py-3 rounded-full font-black uppercase tracking-widest text-[10px] bg-white/5 border border-white/10 text-white">Back</button>
                      </div>
                    </>
                  ) : (
                    <div className="text-zinc-700 font-black uppercase italic text-2xl">No Active Link</div>
                  )}
               </div>
               <div ref={lyricsScrollRef} className="flex-1 overflow-y-auto px-12 py-[30vh] space-y-10 scrollbar-hide text-center md:text-left relative">
                  {lyrics.length > 0 ? lyrics.map((line, i) => (
                    <div key={i} className={`transition-all duration-700 cursor-pointer ${i === currentLyricIndex ? 'text-4xl font-bold opacity-100' : 'text-xl font-medium opacity-20 hover:opacity-50 tracking-wide'}`} style={{ color: i === currentLyricIndex ? 'white' : undefined, textShadow: i === currentLyricIndex ? `0 0 30px ${dominantColor}aa` : 'none' }} onClick={() => audioRef.current && (audioRef.current.currentTime = line.time)}>{line.text}</div>
                  )) : (<div className="text-zinc-800 text-4xl font-black uppercase italic animate-pulse">Syncing...</div>)}
               </div>
            </div>
          ) : view === 'chat' ? (
             <div className="flex-1 flex flex-col p-8 max-w-5xl mx-auto w-full overflow-hidden">
                <div className="flex-1 overflow-y-auto space-y-6 pr-4 scrollbar-hide">
                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[75%] p-6 rounded-3xl text-sm font-bold leading-relaxed shadow-2xl ${m.role === 'user' ? 'bg-indigo-600 text-white shadow-indigo-500/20' : 'bg-white/5 border border-white/5 backdrop-blur-xl text-zinc-200'}`}>{m.content}</div>
                        </div>
                    ))}
                    {isTyping && <div className="bg-white/5 border border-white/5 backdrop-blur-xl p-4 rounded-2xl w-fit animate-pulse text-zinc-500 text-[10px] font-black uppercase tracking-widest">Neural link active...</div>}
                    <div ref={chatEndRef} />
                </div>
                <form onSubmit={handleSendMessage} className="mt-8 flex gap-4">
                  <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="SEND COMMAND..." className="flex-1 bg-white/5 border border-white/5 rounded-2xl px-6 py-5 focus:outline-none focus:border-white/10 font-black uppercase tracking-widest text-xs backdrop-blur-xl" />
                  <button type="submit" className="p-5 rounded-2xl transition-all shadow-2xl hover:scale-105 active:scale-95" style={{ backgroundColor: dominantColor }}><Send size={24} className="text-black" /></button>
                </form>
             </div>
          ) : (
            <div className="flex-1 flex flex-col items-center p-12 overflow-y-auto scrollbar-hide">
                <div className="w-full max-w-5xl flex flex-col items-center py-12">
                  <h2 className="text-6xl font-black italic tracking-tighter mb-4 uppercase">Sync Library</h2>
                  <p className="text-zinc-500 font-bold uppercase tracking-[0.4em] text-[10px] mb-12 text-center">Neural Cloud Import Engine</p>
                  
                  <div className="flex gap-4 w-full max-w-2xl mb-24">
                    <input type="text" placeholder="PLAYLIST ID..." className="bg-white/5 border border-white/5 rounded-3xl p-6 flex-1 focus:outline-none focus:border-white/10 font-black uppercase tracking-widest text-sm backdrop-blur-xl" value={playlistId} onChange={(e) => setPlaylistId(e.target.value)} />
                    <button onClick={handleImportPlaylist} disabled={loading} className="px-10 rounded-3xl font-black uppercase tracking-widest text-xs transition-all shadow-2xl hover:scale-105 active:scale-95 disabled:opacity-50 text-black" style={{ backgroundColor: dominantColor }}>{loading ? 'SYNCING...' : 'IMPORT'}</button>
                  </div>

                  {recentPlaylists.length > 0 && (
                    <div className="w-full">
                       <h3 className="text-zinc-600 font-black uppercase tracking-[0.5em] text-[10px] mb-8 text-center">Recent Nodes</h3>
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {recentPlaylists.map(pl => (
                            <div key={pl.id} onClick={() => { setPlaylistId(pl.id); setTimeout(handleImportPlaylist, 100); }} className="group p-6 rounded-3xl bg-white/5 border border-white/5 hover:border-white/10 cursor-pointer transition-all backdrop-blur-md shadow-2xl hover:-translate-y-1">
                              <div className="w-full aspect-square rounded-2xl overflow-hidden mb-6 shadow-2xl">
                                {pl.cover ? <img src={pl.cover} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" /> : <ListMusic className="m-12 text-zinc-800" />}
                              </div>
                              <div className="font-black text-white text-sm tracking-tight uppercase truncate">{pl.name}</div>
                              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-2">ID: {pl.id}</div>
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

      <footer className="h-32 bg-black/40 backdrop-blur-3xl border-t border-white/5 px-8 flex flex-col justify-center relative z-20">
        <canvas ref={visualizerCanvasRef} className="absolute top-0 left-0 w-full h-16 pointer-events-none opacity-40" width={1200} height={120} />
        <div className="flex items-center gap-4 px-2 mb-2 relative z-10">
          <span className="text-[10px] font-black text-zinc-600 tabular-nums w-10">{formatTime(currentTime)}</span>
          <input type="range" min="0" max={duration || 0} value={currentTime} onChange={(e) => audioRef.current && (audioRef.current.currentTime = Number(e.target.value))} className="flex-1 h-[2px] bg-white/10 rounded-full appearance-none cursor-pointer" style={{ accentColor: dominantColor }} />
          <span className="text-[10px] font-black text-zinc-600 tabular-nums w-10">{formatTime(duration)}</span>
        </div>
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-6 w-1/3">
            <div onClick={() => setView('lyrics')} className="w-16 h-16 bg-zinc-900 rounded-2xl overflow-hidden border border-white/5 flex-shrink-0 cursor-pointer group relative shadow-2xl transition-transform hover:scale-105 active:scale-95" style={{ boxShadow: `0 20px 40px -10px ${dominantColor}33` }}>
              {currentSong?.cover ? <img src={currentSong.cover} className="w-full h-full object-cover group-hover:opacity-40 transition-all duration-500" /> : <Music className="text-zinc-800 m-5" size={24} />}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500"><AlignLeft size={24} className="text-white" /></div>
            </div>
            <div className="min-w-0">
              <div className="font-black text-white text-lg tracking-tighter uppercase truncate leading-none mb-1">{currentSong?.name || 'OFFLINE'}</div>
              <div className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">{currentSong?.artist || 'WAITING FOR SYNC'}</div>
            </div>
          </div>
          <div className="flex items-center gap-8 justify-center w-1/3">
            <button 
              onClick={() => setRecommendMode(!recommendMode)} 
              className="transition-all hover:scale-110 active:scale-90 flex flex-col items-center gap-1"
              title="AI 智能推荐模式"
              style={{ color: recommendMode ? '#fbbf24' : '#3f3f46' }}
            >
              <div className={`p-1.5 rounded-md transition-all ${recommendMode ? 'bg-yellow-500/10 shadow-[0_0_15px_rgba(251,191,36,0.2)]' : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
              </div>
              <span className="text-[8px] font-black uppercase tracking-tighter">AI Mode</span>
            </button>
            <div className="w-px h-8 bg-white/5 mx-2"></div>
            <button onClick={() => {const modes:any=['sequential','shuffle','repeat-one']; setPlayMode(modes[(modes.indexOf(playMode)+1)%3])}} className="transition-all hover:scale-110 active:scale-90" style={{ color: playMode !== 'sequential' ? dominantColor : '#3f3f46' }}>{playMode==='sequential'?<Repeat size={20}/>:playMode==='shuffle'?<Shuffle size={20}/>:<Repeat1 size={20}/>}</button>
            <button onClick={handlePrevious} disabled={!currentSong} className="text-zinc-600 hover:text-white transition-all hover:scale-110 disabled:opacity-20"><SkipBack size={28} fill="currentColor" /></button>
            <button onClick={togglePlay} disabled={!currentSong} className="w-16 h-16 rounded-full text-black flex items-center justify-center hover:scale-110 active:scale-90 transition-all shadow-2xl" style={{ backgroundColor: dominantColor, boxShadow: `0 0 30px ${dominantColor}66` }}>{isPlaying ? <Pause size={32} fill="black" /> : <Play size={32} fill="black" className="ml-1" />}</button>
            <button onClick={handleNext} disabled={!currentSong} className="text-zinc-600 hover:text-white transition-all hover:scale-110 disabled:opacity-20"><SkipForward size={28} fill="currentColor" /></button>
          </div>
          <div className="flex items-center gap-4 justify-end w-1/3 pr-2">
            <Volume2 size={16} className="text-zinc-600" />
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-24 h-1 bg-white/10 rounded-full appearance-none cursor-pointer" style={{ accentColor: dominantColor }} />
          </div>
        </div>
      </footer>
    </div>
  );
}

function NavIcon({ icon, active, onClick, activeColor }: { icon: any, active: boolean, onClick: () => void, activeColor: string }) {
  return (<button onClick={onClick} className={`p-4 rounded-2xl transition-all duration-500 ${active ? 'bg-white shadow-2xl scale-110' : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5'}`} style={{ color: active ? 'black' : undefined, backgroundColor: active ? activeColor : undefined }}>{icon}</button>);
}

export default App;
