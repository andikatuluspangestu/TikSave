import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

// --- Types ---
interface VideoData {
  id: string;
  url: string;
  playUrl: string;
  hdPlayUrl?: string; // Added for HD support
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
  size?: number; // Size in bytes
  hdSize?: number; // HD Size in bytes
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
  
  // History Sort State
  const [sortOrder, setSortOrder] = useState<'date-desc' | 'date-asc' | 'title-asc' | 'title-desc'>('date-desc');
  
  // PWA Install State
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  
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

  const formatSize = (bytes?: number) => {
      if (!bytes) return '';
      const mb = bytes / (1024 * 1024);
      return `${mb.toFixed(1)} MB`;
  };

  // Get sorted history
  const getSortedHistory = () => {
    const sorted = [...history];
    switch (sortOrder) {
      case 'date-desc': return sorted.sort((a, b) => b.timestamp - a.timestamp);
      case 'date-asc': return sorted.sort((a, b) => a.timestamp - b.timestamp);
      case 'title-asc': return sorted.sort((a, b) => (a.data.title || '').localeCompare(b.data.title || ''));
      case 'title-desc': return sorted.sort((a, b) => (b.data.title || '').localeCompare(a.data.title || ''));
      default: return sorted;
    }
  };

  // --- Effects ---
  
  // PWA Install Prompt Listener
  useEffect(() => {
    const handler = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setInstallPrompt(e);
      // Update UI notify the user they can install the PWA
      setShowInstallModal(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

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
  const handleInstallApp = async () => {
    if (!installPrompt) return;
    
    // Show the install prompt
    installPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await installPrompt.userChoice;
    
    // We've used the prompt, and can't use it again, discard it
    setInstallPrompt(null);
    setShowInstallModal(false);
  };

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
          hdPlayUrl: data.data.hdplay, // Capture HD URL
          musicUrl: data.data.music,
          cover: data.data.cover,
          title: data.data.title,
          author: { nickname: data.data.author.nickname, avatar: data.data.author.avatar },
          stats: {
            plays: typeof data.data.play_count === 'number' ? data.data.play_count.toLocaleString() : data.data.play_count,
            likes: typeof data.data.digg_count === 'number' ? data.data.digg_count.toLocaleString() : data.data.digg_count
          },
          size: data.data.size,
          hdSize: data.data.hd_size
        };
        setResult(videoData);
        addToHistory(videoData);
        setActiveTab('download');

        if (autoDownload) {
          // Prefer HD if available
          const targetUrl = videoData.hdPlayUrl || videoData.playUrl;
          const suffix = videoData.hdPlayUrl ? '1080p' : '720p';
          setTimeout(() => handleDownload(targetUrl, 'video', suffix), 500); 
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

  // Refactored to accept specific URL and label
  const handleDownload = async (fileUrl: string, type: 'video' | 'audio', label: string = '') => {
    if (!result || !fileUrl) return;
    
    setIsDownloading(true);
    setError(null);

    const ext = type === 'video' ? 'mp4' : 'mp3';
    // Use a clean filename with label
    const cleanTitle = (result.title || 'video').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const filename = `tiksave_${result.id}_${cleanTitle}_${label}.${ext}`;
    
    // Force application/octet-stream to ensure the browser downloads the file 
    // instead of playing it in a new tab/player.
    const mimeType = 'application/octet-stream';
    
    try {
      let blob: Blob | null = null;
      
      // Defined strategies to attempt sequential downloading.
      // Proxies are prioritized because direct fetch almost always fails due to CORS.
      const strategies = [
          // 1. CorsProxy.io (Usually fastest)
          async () => {
               const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(fileUrl)}`);
               if (!res.ok) throw new Error('CorsProxy failed');
               return await res.blob();
          },
          // 2. CodeTabs Proxy (Good backup)
          async () => {
              const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(fileUrl)}`);
               if (!res.ok) throw new Error('CodeTabs failed');
               return await res.blob();
          },
          // 3. ThingProxy (Another backup)
          async () => {
              const res = await fetch(`https://thingproxy.freeboard.io/fetch/${fileUrl}`);
               if (!res.ok) throw new Error('ThingProxy failed');
               return await res.blob();
          },
          // 4. AllOrigins (Raw)
          async () => {
               const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(fileUrl)}`);
               if (!res.ok) throw new Error('AllOrigins failed');
               return await res.blob();
          },
          // 5. Direct Fetch (Last resort - mostly for debugging or if CDN allows)
          async () => {
              const res = await fetch(fileUrl, { referrerPolicy: 'no-referrer', credentials: 'omit' });
              if (!res.ok) throw new Error('Direct fetch failed');
              return await res.blob();
          }
      ];

      for (const strategy of strategies) {
          try {
              blob = await strategy();
              if (blob && blob.size > 0) break;
          } catch (e) {
              continue;
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
          
          setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
      } else {
         throw new Error("Unable to download file via any method.");
      }
      
    } catch (e) {
      console.error("Download failed", e);
      setError("Download failed. The server might be blocking requests. Please try again in a few moments.");
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
  const renderInstallModal = () => {
    if (!showInstallModal) return null;
    return (
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 animate-fade-in">
         <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowInstallModal(false)}></div>
         <div className="bg-white dark:bg-dark-card w-full max-w-sm rounded-3xl p-6 shadow-2xl relative transform transition-all animate-slide-up border border-gray-100 dark:border-white/10">
            <div className="flex items-start gap-4 mb-4">
               <div className="w-12 h-12 bg-gray-100 dark:bg-white/5 rounded-xl flex items-center justify-center shrink-0 border border-gray-200 dark:border-white/5">
                  <img src="https://cdn-icons-png.flaticon.com/512/724/724933.png" className="w-8 h-8 object-contain" />
               </div>
               <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Install TikSave</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Add to your home screen for instant access.</p>
               </div>
            </div>
            <div className="flex gap-3">
               <button onClick={() => setShowInstallModal(false)} className="flex-1 py-3 rounded-xl font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">Not Now</button>
               <button onClick={handleInstallApp} className="flex-1 py-3 rounded-xl font-semibold text-white bg-primary hover:bg-orange-600 transition-colors shadow-lg shadow-primary/30">Install</button>
            </div>
         </div>
      </div>
    );
  };

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
                    <div className="flex items-center gap-2">
                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Recent</h3>
                        <select
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value as any)}
                            className="bg-transparent text-[10px] font-bold text-primary dark:text-primaryLight border-none outline-none cursor-pointer p-0"
                        >
                            <option value="date-desc">Newest</option>
                            <option value="date-asc">Oldest</option>
                            <option value="title-asc">A-Z</option>
                            <option value="title-desc">Z-A</option>
                        </select>
                    </div>
                    <button onClick={() => {setHistory([]); localStorage.removeItem('tiksave-history')}} className="text-[10px] text-primary hover:text-orange-600 transition-colors bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-md">CLEAR</button>
                </div>
                <div className="flex overflow-x-auto gap-3 pb-1 no-scrollbar mask-linear-fade px-1">
                    {getSortedHistory().map((h, i) => renderHistoryItem(h, i, false))}
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
                  <div className="flex items-center gap-2">
                       <h3 className="text-base font-bold text-gray-900 dark:text-white">Recent</h3>
                       <select
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value as any)}
                            className="bg-transparent text-[10px] font-medium text-gray-500 dark:text-gray-400 border-none outline-none cursor-pointer hover:text-primary transition-colors appearance-none"
                        >
                            <option value="date-desc">Newest</option>
                            <option value="date-asc">Oldest</option>
                            <option value="title-asc">Name (A-Z)</option>
                            <option value="title-desc">Name (Z-A)</option>
                        </select>
                  </div>
                  <button onClick={() => {setHistory([]); localStorage.removeItem('tiksave-history')}} className="text-[10px] text-primary hover:text-orange-600 transition-colors px-2 py-1 rounded-full bg-orange-50 dark:bg-orange-900/10">Clear</button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
                  {getSortedHistory().map((h, i) => renderHistoryItem(h, i, true))}
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

      // Prepare Download Options
      const options = [];
      
      // HD Option (if available and distinct)
      if (result.hdPlayUrl) {
          options.push({ 
              label: 'MP4', 
              quality: 'HD 1080p', 
              url: result.hdPlayUrl, 
              size: result.hdSize, 
              type: 'video' as const, 
              suffix: '1080p' 
          });
      }
      
      // Standard Option (Always valid if hdPlayUrl is missing or distinct)
      // Check if standard is different from HD to avoid duplicates, though TikWM usually provides distinct links or same link.
      // If HD exists, we label the other as 720p. If only one exists, we just show it.
      if (!result.hdPlayUrl || result.playUrl !== result.hdPlayUrl) {
           options.push({ 
              label: 'MP4', 
              quality: result.hdPlayUrl ? 'SD 720p' : 'Standard', 
              url: result.playUrl, 
              size: result.size, 
              type: 'video' as const, 
              suffix: '720p' 
          });
      }

      // Audio Option
      if (result.musicUrl) {
          options.push({ 
              label: 'MP3', 
              quality: 'Audio', 
              url: result.musicUrl, 
              size: null, 
              type: 'audio' as const, 
              suffix: 'audio' 
          });
      }

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
                        
                        <div className="w-full bg-gray-50 dark:bg-white/5 rounded-2xl overflow-hidden border border-gray-100 dark:border-white/5">
                            {options.map((opt, idx) => (
                                <button 
                                    key={idx}
                                    disabled={isDownloading}
                                    onClick={() => handleDownload(opt.url, opt.type, opt.suffix)}
                                    className="w-full flex items-center justify-between p-4 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors border-b border-gray-200 dark:border-white/5 last:border-0 group disabled:opacity-50"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${opt.type === 'video' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'}`}>
                                            <i className={`fas ${opt.type === 'video' ? 'fa-video' : 'fa-music'}`}></i>
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-gray-900 dark:text-white text-base">{opt.label}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                                {opt.quality} {opt.size ? `• ${formatSize(opt.size)}` : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-white dark:bg-white/10 flex items-center justify-center text-gray-400 group-hover:text-primary transition-colors shadow-sm">
                                        {isDownloading ? <div className="loader w-3 h-3 border-2 border-gray-400"></div> : <i className="fas fa-download text-xs"></i>}
                                    </div>
                                </button>
                            ))}
                        </div>
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
            {renderInstallModal()}
            {activeTab === 'home' && renderHome()}
            {activeTab === 'download' && renderDownload()}
        </main>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);