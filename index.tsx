import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

// --- Types ---
interface VideoData {
  id: string;
  url: string;
  playUrl: string;
  musicUrl?: string;
  cover: string;
  title: string;
  author: {
    nickname: string;
    avatar: string;
  };
  stats?: {
    plays: string;
    likes: string;
  };
}

interface HistoryItem {
  timestamp: number;
  data: VideoData;
}

const App = () => {
  // --- State ---
  const [activeTab, setActiveTab] = useState<'home' | 'download'>('home');
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VideoData | null>(null);
  
  // Lazy State Initialization for Performance
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem("tiksave-history");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      const saved = localStorage.getItem("tiksave-theme") as "light" | "dark" | null;
      if (saved) return saved;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch { return 'light'; }
  });
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState<'general' | 'about'>('general');
  const [autoDownload, setAutoDownload] = useState(() => {
     if (typeof window === 'undefined') return false;
     const saved = localStorage.getItem("tiksave-auto-download");
     return saved ? JSON.parse(saved) : false;
  });

  // --- Helpers ---
  const extractUrl = (text: string): string | null => {
    const match = text.match(/https?:\/\/(?:www\.|vm\.|vt\.|m\.|t\.)?tiktok\.com\/[^\s]+/);
    if (!match) return null;
    return match[0].replace(/[.,;!?)]+$/, "");
  };

  const validateUrl = (input: string): { isValid: boolean; cleanUrl: string | null; error?: string } => {
    if (!input || !input.trim()) {
        return { isValid: false, cleanUrl: null, error: "Please paste a TikTok link." };
    }
    
    // Check domain
    if (!input.includes("tiktok.com")) {
         return { isValid: false, cleanUrl: null, error: "That doesn't look like a valid TikTok link." };
    }

    const cleanUrl = extractUrl(input);
    if (!cleanUrl) {
         return { isValid: false, cleanUrl: null, error: "Could not find a valid URL in the text." };
    }

    // Specific Checks
    const isShortLink = /v[tm]\.tiktok\.com/.test(cleanUrl);
    const isMobileLink = /m\.tiktok\.com/.test(cleanUrl);
    const isStandardLink = /tiktok\.com\/@[\w.-]+\/video\/\d+/.test(cleanUrl);
    
    if (!isShortLink && !isMobileLink && !isStandardLink) {
         if (cleanUrl.includes("/@") && !cleanUrl.includes("/video/")) {
             return { isValid: false, cleanUrl: null, error: "This looks like a profile link. Please provide a video link." };
         }
    }
    
    return { isValid: true, cleanUrl };
  };

  // --- Effects ---
  
  // Use useLayoutEffect for Theme to prevent flicker
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("tiksave-theme", theme);
  }, [theme]);

  // Regular Effects
  useEffect(() => {
    localStorage.setItem("tiksave-history", JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem("tiksave-auto-download", JSON.stringify(autoDownload));
  }, [autoDownload]);

  useEffect(() => {
    // Share Target Handling
    const params = new URLSearchParams(window.location.search);
    const sharedText = params.get('text') || params.get('url');
    if (sharedText) {
        const { isValid, cleanUrl } = validateUrl(sharedText);
        if (isValid && cleanUrl) {
            setUrl(cleanUrl);
            setTimeout(() => handleProcess(cleanUrl), 100);
            window.history.replaceState({}, document.title, "/");
        }
    }
  }, []);

  // --- Handlers ---
  const handleProcess = async (inputUrl: string = url) => {
    setError(null);
    
    const { isValid, cleanUrl, error: validationError } = validateUrl(inputUrl);

    if (!isValid || !cleanUrl) {
      setError(validationError || "Invalid URL");
      return;
    }
    
    if (inputUrl !== cleanUrl) {
        setUrl(cleanUrl);
    }
    
    setIsLoading(true);
    try {
      const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}&hd=1`);
      const data = await response.json();
      
      if (data.code === 0) {
        const videoData: VideoData = {
          id: data.data.id,
          url: cleanUrl,
          playUrl: data.data.play,
          musicUrl: data.data.music,
          cover: data.data.cover,
          title: data.data.title,
          author: { nickname: data.data.author.nickname, avatar: data.data.author.avatar },
          stats: {
            plays: typeof data.data.play_count === 'number' ? data.data.play_count.toLocaleString() : data.data.play_count,
            likes: typeof data.data.digg_count === 'number' ? data.data.digg_count.toLocaleString() : data.data.digg_count
          }
        };
        setResult(videoData);
        addToHistory(videoData);
        setActiveTab('download');

        if (autoDownload) {
          setTimeout(() => handleDownload('video', videoData), 500); 
        }
      } else {
        const msg = data.msg || "Failed to fetch video.";
        if (msg.toLowerCase().includes("private")) {
            setError("This video appears to be private or deleted.");
        } else if (msg.includes("parsing")) {
            setError("Could not process this video. It might be region-restricted.");
        } else {
            setError(msg);
        }
      }
    } catch (err) {
      setError("Network error. Please check your connection.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const addToHistory = (item: VideoData) => {
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.data.id !== item.id);
      return [{ timestamp: Date.now(), data: item }, ...filtered].slice(0, 10);
    });
  };

  const handleDownload = async (type: 'video' | 'audio', dataOverride?: VideoData) => {
    const targetVideo = dataOverride || result;
    if (!targetVideo) return;
    
    setIsDownloading(true);
    setError(null);

    const fileUrl = type === 'video' ? targetVideo.playUrl : targetVideo.musicUrl!;
    if (!fileUrl) {
        setError("Download link not available.");
        setIsDownloading(false);
        return;
    }

    const ext = type === 'video' ? 'mp4' : 'mp3';
    const filename = `tiksave-${targetVideo.id}.${ext}`;
    const mimeType = type === 'video' ? 'video/mp4' : 'audio/mpeg';
    
    try {
      let blob: Blob | null = null;
      
      // Strategy 1: Direct Fetch
      try {
          const response = await fetch(fileUrl);
          if (response.ok) blob = await response.blob();
      } catch (e) { 
        // Direct fetch failed, continue to proxies
      }

      // Strategy 2: CorsProxy.io
      if (!blob) {
          try {
             const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(fileUrl)}`;
             const response = await fetch(proxyUrl);
             if (response.ok) blob = await response.blob();
          } catch (e) { 
            // Proxy 1 failed
          }
      }

      // Strategy 3: AllOrigins (Backup)
      if (!blob) {
          try {
              const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(fileUrl)}`;
              const response = await fetch(proxyUrl);
              if (response.ok) blob = await response.blob();
          } catch (e) {
             // Proxy 2 failed
          }
      }

      if (blob) {
          const finalBlob = new Blob([blob], { type: mimeType });
          const blobUrl = window.URL.createObjectURL(finalBlob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.setAttribute('download', filename);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
      } else {
         throw new Error("Unable to download file via any method.");
      }
      
    } catch (e) {
      console.error("Download failed", e);
      // Removed the fallback that opens a new tab/window
      setError("Download failed. The server might be blocking requests.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePaste = async () => {
      try {
          const text = await navigator.clipboard.readText();
          setUrl(text);
      } catch (e) {
          setError("Clipboard permission denied");
      }
  };

  // --- Views ---

  const renderSettings = () => (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${showSettings ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowSettings(false); setSettingsView('general'); }}></div>
        <div className={`bg-white dark:bg-dark-card w-full max-w-sm rounded-3xl p-6 shadow-2xl transform transition-transform duration-200 ${showSettings ? 'scale-100' : 'scale-95'}`}>
            <div className="flex justify-between items-center mb-6">
                <div className="flex gap-4">
                    <button 
                        onClick={() => setSettingsView('general')}
                        className={`text-lg font-bold transition-colors ${settingsView === 'general' ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}
                    >
                        Settings
                    </button>
                    <button 
                        onClick={() => setSettingsView('about')}
                        className={`text-lg font-bold transition-colors ${settingsView === 'about' ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}
                    >
                        About
                    </button>
                </div>
                <button onClick={() => { setShowSettings(false); setSettingsView('general'); }} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500">
                    <i className="fas fa-times"></i>
                </button>
            </div>
            
            {settingsView === 'general' ? (
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-bg rounded-xl">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                                <i className="fas fa-bolt"></i>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-800 dark:text-white">Auto Download</p>
                                <p className="text-xs text-gray-500">Download immediately after search</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={autoDownload} onChange={(e) => setAutoDownload(e.target.checked)} className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-bg rounded-xl">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                                <i className="fas fa-moon"></i>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-800 dark:text-white">Dark Mode</p>
                                <p className="text-xs text-gray-500">Easier on the eyes</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={theme === 'dark'} onChange={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                        </label>
                    </div>
                </div>
            ) : (
                 <div className="space-y-6 text-center py-4">
                    <div className="flex justify-center">
                         <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-[#25F4EE] to-[#FE2C55] p-0.5">
                            <div className="w-full h-full bg-white dark:bg-dark-card rounded-2xl flex items-center justify-center">
                                 <i className="fa-brands fa-tiktok text-4xl text-gray-800 dark:text-white"></i>
                            </div>
                         </div>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">TikSave</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Video Downloader & Saver</p>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
                        <p>Version 1.2.1 (Build 2024)</p>
                        <p>TikSave helps you save your favorite moments without watermarks. Fast, free, and secure.</p>
                    </div>
                    <div className="pt-4 border-t border-gray-100 dark:border-white/5">
                        <a href="#" className="text-primary hover:text-orange-600 text-sm font-medium">Privacy Policy</a>
                        <span className="mx-2 text-gray-300">•</span>
                        <a href="#" className="text-primary hover:text-orange-600 text-sm font-medium">Terms of Service</a>
                    </div>
                 </div>
            )}
        </div>
    </div>
  );

  const renderHistoryItem = (h: HistoryItem, i: number, vertical: boolean = false) => (
    <div key={i} className={`group cursor-pointer ${vertical ? 'w-full flex gap-4 items-center bg-transparent p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl transition-colors' : 'flex-shrink-0 w-24'}`} onClick={() => {
        setResult(h.data);
        setActiveTab('download');
    }}>
        <div className={`relative rounded-xl overflow-hidden bg-gray-200 dark:bg-dark-card border border-gray-100 dark:border-dark-border ${vertical ? 'w-16 h-20 flex-shrink-0' : 'aspect-[3/4] mb-1'}`}>
            <img src={h.data.cover} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" loading="lazy" />
            <div className={`absolute inset-0 bg-black/10 group-hover:bg-black/30 transition-colors flex items-center justify-center`}>
                <i className={`fas fa-play text-white opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition-all ${vertical ? 'text-xs' : ''}`}></i>
            </div>
        </div>
        {vertical && (
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm line-clamp-2 leading-tight">{h.data.title || 'No Title'}</p>
                <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                     <i className="fas fa-user-circle text-[10px]"></i>
                     <span className="truncate">@{h.data.author.nickname}</span>
                </div>
            </div>
        )}
    </div>
  );

  const renderHome = () => (
    <div className="animate-fade-in relative h-screen w-full flex flex-col md:flex-row md:items-start overflow-hidden">
      {/* Header Mobile - Settings Icon */}
      <header className="md:hidden px-6 py-6 flex justify-end items-center absolute top-0 left-0 right-0 z-20 pointer-events-none">
        <button onClick={() => setShowSettings(true)} className="pointer-events-auto w-10 h-10 rounded-full bg-white dark:bg-dark-card border border-light-border dark:border-dark-border flex items-center justify-center text-gray-600 dark:text-gray-300 shadow-sm transition-transform active:scale-95 hover:bg-gray-50 dark:hover:bg-gray-800">
            <i className="fas fa-cog"></i>
        </button>
      </header>
      
      {/* Header Desktop - LOGO REMOVED */}
      <header className="hidden md:flex px-8 py-6 justify-end items-center fixed top-0 left-0 right-0 z-50 pointer-events-none w-full max-w-[1920px] mx-auto">
         <button onClick={() => setShowSettings(true)} className="pointer-events-auto w-10 h-10 rounded-full bg-white dark:bg-dark-card border border-light-border dark:border-white/10 flex items-center justify-center text-gray-600 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
            <i className="fas fa-cog"></i>
         </button>
      </header>

      {/* Main Content Area (Input) */}
      <div className={`flex-1 flex flex-col h-screen px-6 md:px-0 relative z-10 w-full transition-all duration-300 ${history.length > 0 ? 'md:mr-80 lg:mr-96' : ''}`}>
        
        {/* Centered Content Wrapper */}
        <div className="flex-1 flex flex-col justify-center items-center w-full max-w-lg md:max-w-2xl mx-auto text-center space-y-6 md:space-y-10">
            
            {/* Logo Section */}
            <div className="flex flex-col items-center gap-4 md:gap-6">
                 {/* Mobile Logo Only */}
                 <div className="relative group md:hidden scale-90">
                    <div className="absolute -inset-1 bg-gradient-to-r from-[#25F4EE] to-[#FE2C55] rounded-3xl blur opacity-30 group-hover:opacity-50 transition duration-500"></div>
                    <div className="relative w-16 h-16 bg-white dark:bg-dark-card rounded-3xl flex items-center justify-center shadow-xl border border-gray-100 dark:border-white/5">
                        <div className="relative">
                            <i className="fa-brands fa-tiktok text-3xl text-gray-900 dark:text-white"></i>
                            <div className="absolute -bottom-2 -right-2 bg-primary text-white w-6 h-6 rounded-xl flex items-center justify-center shadow-lg border-2 border-white dark:border-dark-card">
                                <i className="fas fa-arrow-down text-[10px]"></i>
                            </div>
                        </div>
                    </div>
                 </div>
                 
                 {/* Desktop Large Logo */}
                 <div className="hidden md:block relative group mb-2">
                     <i className="fa-brands fa-tiktok text-8xl text-gray-900 dark:text-white opacity-90 drop-shadow-2xl"></i>
                     <div className="absolute bottom-0 right-0 bg-gradient-to-br from-primary to-orange-600 text-white w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg border-4 border-light-bg dark:border-dark-bg transform translate-x-1/4 translate-y-1/4">
                        <i className="fas fa-arrow-down text-lg"></i>
                     </div>
                 </div>

                <div className="space-y-2">
                    <h1 className="text-3xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tighter">
                        Tik<span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-[#FE2C55]">Save</span>
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm md:text-lg font-medium max-w-md mx-auto px-4 leading-relaxed">
                        Paste link below to download instantly.
                    </p>
                </div>
            </div>

            {/* Input Area */}
            <div className="relative group w-full text-left max-w-md md:max-w-xl mx-auto">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
                    <i className="fas fa-link text-lg"></i>
                </div>
                <input 
                    type="text" 
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleProcess()}
                    placeholder="Paste link here" 
                    className="w-full pl-12 pr-14 py-4 md:py-5 rounded-2xl bg-white dark:bg-dark-card text-gray-800 dark:text-gray-100 placeholder-gray-400 shadow-soft md:shadow-2xl md:shadow-black/5 focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all border border-gray-100 dark:border-white/5 focus:border-primary/50 text-base md:text-lg"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {url && (
                        <button onClick={() => setUrl('')} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                            <i className="fas fa-times-circle"></i>
                        </button>
                    )}
                    <button 
                        onClick={() => handleProcess()} 
                        disabled={isLoading}
                        className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 active:scale-95 transition-transform disabled:opacity-70 hover:bg-orange-600"
                    >
                        {isLoading ? <div className="loader w-4 h-4 border-2"></div> : <i className="fas fa-download text-sm md:text-base"></i>}
                    </button>
                </div>
            </div>
            
            {error && <p className="text-red-500 text-xs md:text-sm bg-red-50 dark:bg-red-900/10 py-1.5 px-3 rounded-lg inline-block animate-fade-in border border-red-100 dark:border-red-900/20"><i className="fas fa-exclamation-triangle mr-2"></i>{error}</p>}
        </div>

        {/* Mobile History (Compact Bottom Strip) */}
        {history.length > 0 && (
            <div className="md:hidden pb-6 px-4 w-full max-w-lg mx-auto shrink-0 z-20 relative">
                 <div className="flex justify-between items-center mb-2 px-1">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Recent</h3>
                    <button onClick={() => {setHistory([]); localStorage.removeItem('tiksave-history')}} className="text-[10px] text-primary hover:text-orange-600 transition-colors bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-md">CLEAR</button>
                </div>
                <div className="flex overflow-x-auto gap-3 pb-1 no-scrollbar mask-linear-fade px-1">
                    {history.map((h, i) => renderHistoryItem(h, i, false))}
                </div>
            </div>
        )}

        {/* Footer (Compact) */}
        <footer className="pb-4 pt-2 text-center text-gray-400 dark:text-gray-600 text-[10px] font-medium shrink-0">
             Build with 🤍 by andikatuluspgstu
        </footer>
      </div>

      {/* History Side Panel (Desktop) */}
      {history.length > 0 && (
          <div className="hidden md:flex flex-col w-72 lg:w-80 h-screen fixed right-0 top-0 bg-white dark:bg-dark-card border-l border-gray-100 dark:border-white/5 overflow-hidden z-40 shadow-2xl shadow-black/5 pt-20">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-white/50 dark:bg-black/20 backdrop-blur-sm shrink-0">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">Recent Downloads</h3>
                  <button onClick={() => {setHistory([]); localStorage.removeItem('tiksave-history')}} className="text-[10px] text-primary hover:text-orange-600 transition-colors px-2 py-1 rounded-full bg-orange-50 dark:bg-orange-900/10">Clear All</button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
                  {history.map((h, i) => renderHistoryItem(h, i, true))}
              </div>
          </div>
      )}
    </div>
  );

  const renderDownload = () => {
      if (!result) return (
          <div className="flex flex-col items-center justify-center h-screen px-8 text-center animate-fade-in overflow-hidden">
              <button onClick={() => setActiveTab('home')} className="mb-8 px-6 py-3 bg-gray-100 dark:bg-dark-card rounded-full text-sm font-semibold">Back to Home</button>
          </div>
      );

      return (
        <div className="animate-slide-up h-screen w-full flex flex-col md:flex-row bg-light-bg dark:bg-dark-bg overflow-hidden">
            {/* Desktop: Left Side (Video Player) */}
            <div className="md:w-1/2 lg:w-7/12 md:bg-black h-[40vh] md:h-screen relative group shrink-0">
                <header className="md:hidden px-4 py-4 flex items-center gap-4 absolute top-0 z-20 w-full bg-gradient-to-b from-black/60 to-transparent">
                    <button onClick={() => setActiveTab('home')} className="w-8 h-8 flex items-center justify-center text-white bg-white/20 backdrop-blur-md rounded-full">
                        <i className="fas fa-arrow-left text-sm"></i>
                    </button>
                    <h1 className="text-lg font-bold text-white shadow-black drop-shadow-md">Download</h1>
                </header>
                
                <button onClick={() => setActiveTab('home')} className="hidden md:flex absolute top-8 left-8 w-12 h-12 items-center justify-center text-white bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full z-20 transition-colors">
                    <i className="fas fa-arrow-left"></i>
                </button>

                <div className="w-full h-full bg-black flex items-center justify-center">
                     <video 
                        src={result.playUrl} 
                        poster={result.cover} 
                        controls 
                        className="w-full h-full object-contain"
                    />
                </div>
            </div>

            {/* Desktop: Right Side (Details & Controls) */}
            <div className="flex-1 h-[60vh] md:h-screen overflow-y-auto no-scrollbar bg-white dark:bg-dark-card md:border-l border-gray-100 dark:border-white/5">
                <div className="px-5 py-6 md:p-16 max-w-lg mx-auto md:max-w-xl md:h-full md:flex md:flex-col md:justify-center">
                    
                    {/* Mobile Preview Card */}
                    <div className="flex gap-4 items-center md:hidden mb-6">
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-200 shrink-0 relative">
                            <img src={result.cover} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-gray-900 dark:text-white line-clamp-1 text-sm mb-1">{result.title || "TikTok Video"}</h3>
                            <div className="flex items-center gap-2">
                                <img src={result.author.avatar} className="w-4 h-4 rounded-full" />
                                <span className="text-xs text-gray-500 truncate">@{result.author.nickname}</span>
                            </div>
                        </div>
                    </div>

                    {/* Desktop Details */}
                    <div className="hidden md:block mb-10">
                         <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-4 line-clamp-3 leading-tight">{result.title || "TikTok Video"}</h2>
                         <div className="flex items-center gap-4 mb-6">
                            <div className="flex items-center gap-3 bg-gray-50 dark:bg-white/5 px-4 py-2 rounded-full">
                                <img src={result.author.avatar} className="w-8 h-8 rounded-full" />
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">@{result.author.nickname}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                                <span className="flex items-center gap-2"><i className="fas fa-play"></i> {result.stats?.plays || '0'}</span>
                                <span className="flex items-center gap-2"><i className="fas fa-heart"></i> {result.stats?.likes || '0'}</span>
                            </div>
                        </div>
                        <div className="h-px w-full bg-gray-100 dark:bg-white/10"></div>
                    </div>

                    <div className="space-y-4 mb-10">
                        {error && <p className="text-red-500 text-sm mb-6 text-center bg-red-50 dark:bg-red-900/20 py-3 rounded-xl font-medium">{error}</p>}
                        
                        <button 
                            onClick={() => handleDownload('video')}
                            disabled={isDownloading}
                            className="w-full py-4 md:py-5 bg-primary hover:bg-orange-600 text-white font-bold rounded-2xl shadow-xl shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 text-base md:text-lg"
                        >
                            {isDownloading ? (
                                <>
                                    <div className="loader w-5 h-5 border-2"></div>
                                    <span>Downloading...</span>
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-video"></i>
                                    <span>Download Video (HD)</span>
                                </>
                            )}
                        </button>
                        
                        {result.musicUrl && (
                            <button 
                                onClick={() => handleDownload('audio')}
                                disabled={isDownloading}
                                className="w-full py-4 md:py-5 bg-white dark:bg-white/5 border-2 border-gray-100 dark:border-white/10 hover:border-primary dark:hover:border-primary text-gray-700 dark:text-white font-bold rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-3 text-base md:text-lg"
                            >
                                <i className="fas fa-music text-gray-400 dark:text-gray-500"></i>
                                <span>Download Audio</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className="h-screen overflow-hidden font-sans selection:bg-primary selection:text-white transition-colors duration-300 bg-light-bg dark:bg-dark-bg text-gray-900 dark:text-white">
        <main className="w-full mx-auto h-screen relative overflow-hidden transition-all duration-300">
            {renderSettings()}
            {activeTab === 'home' && renderHome()}
            {activeTab === 'download' && renderDownload()}
        </main>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);