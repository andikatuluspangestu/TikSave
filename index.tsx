import React, { useState, useEffect, useRef } from "react";
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
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [autoDownload, setAutoDownload] = useState(false);
  
  // Selection state for download page
  const [selectedFormat, setSelectedFormat] = useState<'video' | 'audio'>('video');

  // --- Effects ---
  useEffect(() => {
    // Theme
    const savedTheme = localStorage.getItem("tiksave-theme") as "light" | "dark" | null;
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (savedTheme) setTheme(savedTheme);
    else if (systemPrefersDark) setTheme("dark");

    // History
    const savedHistory = localStorage.getItem("tiksave-history");
    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch (e) { console.error(e); }
    }

    // Settings
    const savedAutoDL = localStorage.getItem("tiksave-auto-download");
    if (savedAutoDL) setAutoDownload(JSON.parse(savedAutoDL));

    // Share Target
    const params = new URLSearchParams(window.location.search);
    const sharedText = params.get('text') || params.get('url');
    if (sharedText) {
        const urlMatch = sharedText.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch && urlMatch[0] && urlMatch[0].includes("tiktok.com")) {
            const extracted = urlMatch[0];
            setUrl(extracted);
            handleProcess(extracted);
            window.history.replaceState({}, document.title, "/");
        }
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("tiksave-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("tiksave-history", JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem("tiksave-auto-download", JSON.stringify(autoDownload));
  }, [autoDownload]);

  // --- Handlers ---
  const handleProcess = async (inputUrl: string = url) => {
    setError(null);
    if (!inputUrl.trim() || !inputUrl.includes("tiktok.com")) {
      setError("Please paste a valid TikTok link.");
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(inputUrl)}`);
      const data = await response.json();
      if (data.code === 0) {
        const videoData: VideoData = {
          id: data.data.id,
          url: inputUrl,
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
        setActiveTab('download'); // Switch to download view

        // Trigger Auto Download if enabled
        if (autoDownload) {
          // Pass the data directly to handleDownload to ensure we don't wait for state update
          setTimeout(() => handleDownload(videoData), 500); 
        }
      } else {
        setError(data.msg || "Failed to fetch video.");
      }
    } catch (err) {
      setError("Network error. Check connection.");
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

  const downloadBlob = (blob: Blob, filename: string) => {
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
  };

  const handleDownload = async (dataOverride?: VideoData) => {
    // Use override data (for auto-download) or current result state
    const targetVideo = dataOverride || result;
    if (!targetVideo) return;
    
    setIsDownloading(true);
    setError(null);

    // If auto-downloading, default to video format
    const formatToUse = dataOverride ? 'video' : selectedFormat;
    const fileUrl = formatToUse === 'video' ? targetVideo.playUrl : targetVideo.musicUrl!;
    const ext = formatToUse === 'video' ? 'mp4' : 'mp3';
    const filename = `tiksave-${targetVideo.id}.${ext}`;
    
    try {
      // Attempt 1: Direct Fetch
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error("Direct fetch failed");
      const blob = await response.blob();
      downloadBlob(blob, filename);
    } catch (directError) {
      console.warn("Direct fetch failed, trying proxy...", directError);
      
      try {
        // Attempt 2: CORS Proxy
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(fileUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error("Proxy fetch failed");
        const blob = await response.blob();
        downloadBlob(blob, filename);
      } catch (proxyError) {
        console.error("All download methods failed", proxyError);
        // Fallback: Open in new tab
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = filename;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setError("Automatic download failed. Opening video...");
      }
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

  // 1. Settings Modal
  const renderSettings = () => (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${showSettings ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowSettings(false)}></div>
        <div className={`bg-white dark:bg-dark-card w-full max-w-sm rounded-3xl p-6 shadow-2xl transform transition-transform duration-200 ${showSettings ? 'scale-100' : 'scale-95'}`}>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">Settings</h2>
                <button onClick={() => setShowSettings(false)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500">
                    <i className="fas fa-times"></i>
                </button>
            </div>
            
            <div className="space-y-4">
                {/* Auto Download Toggle */}
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

                {/* Dark Mode Toggle */}
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
            
            <div className="mt-8 text-center">
                <p className="text-xs text-gray-400">Version 1.0.0 • TikSave</p>
            </div>
        </div>
    </div>
  );

  // 2. Home View
  const renderHome = () => (
    <div className="animate-fade-in relative h-screen flex flex-col">
      {/* Header - Settings Icon */}
      <header className="px-6 py-6 flex justify-between items-center absolute top-0 left-0 right-0 z-10">
        <button onClick={() => setShowSettings(true)} className="w-10 h-10 rounded-full bg-white dark:bg-dark-card border border-light-border dark:border-dark-border flex items-center justify-center text-gray-600 dark:text-gray-300 shadow-sm transition-transform active:scale-95 hover:bg-gray-50 dark:hover:bg-gray-800">
            <i className="fas fa-cog"></i>
        </button>
        {/* Optional: Add other header items here if needed */}
      </header>

      {/* Center Content */}
      <div className="flex-1 flex flex-col justify-center px-6 -mt-10">
        <div className="w-full max-w-lg mx-auto text-center space-y-8">
            
            {/* Logo Section */}
            <div className="flex flex-col items-center gap-3">
                 <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center text-white shadow-glow mb-2 transform hover:scale-105 transition-transform duration-300">
                    <i className="fas fa-arrow-down text-3xl"></i>
                </div>
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
                    Tik<span className="text-primary">Save</span>
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Download TikTok videos without watermark</p>
            </div>

            {/* Input Area */}
            <div className="relative group w-full">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
                    <i className="fas fa-link"></i>
                </div>
                <input 
                    type="text" 
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleProcess()}
                    placeholder="Paste TikTok link here"
                    className="w-full pl-11 pr-24 py-5 rounded-2xl bg-white dark:bg-dark-input text-gray-800 dark:text-gray-100 placeholder-gray-400 shadow-soft focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all border border-gray-100 dark:border-dark-border focus:border-primary/20 text-lg"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {url && (
                        <button onClick={() => setUrl('')} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                            <i className="fas fa-times-circle"></i>
                        </button>
                    )}
                    {!url && (
                        <button onClick={handlePaste} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-xs font-semibold rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-200 transition-colors">
                            Paste
                        </button>
                    )}
                    <button 
                        onClick={() => handleProcess()} 
                        disabled={isLoading}
                        className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 active:scale-95 transition-transform disabled:opacity-70 hover:bg-orange-600"
                    >
                        {isLoading ? <div className="loader w-5 h-5 border-2"></div> : <i className="fas fa-arrow-right"></i>}
                    </button>
                </div>
            </div>
            
            {error && <p className="text-red-500 text-sm bg-red-50 dark:bg-red-900/10 py-2 px-4 rounded-lg inline-block"><i className="fas fa-exclamation-triangle mr-2"></i>{error}</p>}
        
        </div>
      </div>

      {/* Bottom History */}
      {history.length > 0 && (
        <div className="pb-8 px-6 w-full max-w-lg mx-auto">
             <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Recent History</h3>
                <button onClick={() => {setHistory([]); localStorage.removeItem('tiksave-history')}} className="text-xs text-primary hover:text-orange-600 transition-colors">Clear</button>
            </div>
            <div className="flex overflow-x-auto gap-3 pb-2 no-scrollbar mask-linear-fade">
                {history.map((h, i) => (
                    <div key={i} className="flex-shrink-0 w-24 group cursor-pointer" onClick={() => {
                        setResult(h.data);
                        setActiveTab('download');
                    }}>
                        <div className="relative aspect-[3/4] rounded-xl overflow-hidden mb-1 bg-gray-200 dark:bg-dark-card border border-gray-100 dark:border-dark-border">
                            <img src={h.data.cover} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" loading="lazy" />
                            <div className="absolute inset-0 bg-black/10 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                <i className="fas fa-play text-white opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition-all"></i>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      )}
    </div>
  );

  // 3. Download/Result View (Mostly unchanged but cleaner)
  const renderDownload = () => {
      if (!result) return (
          <div className="flex flex-col items-center justify-center h-screen px-8 text-center animate-fade-in">
              <button onClick={() => setActiveTab('home')} className="mb-8 px-6 py-3 bg-gray-100 dark:bg-dark-card rounded-full text-sm font-semibold">Back to Home</button>
          </div>
      );

      return (
        <div className="pb-8 animate-slide-up min-h-screen">
            <header className="px-5 py-6 flex items-center gap-4 sticky top-0 z-20 bg-light-bg/90 dark:bg-dark-bg/90 backdrop-blur-md">
                <button onClick={() => setActiveTab('home')} className="w-10 h-10 flex items-center justify-center text-gray-600 dark:text-white bg-white dark:bg-dark-card rounded-full shadow-sm border border-light-border dark:border-dark-border hover:bg-gray-50">
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Download</h1>
            </header>

            <div className="px-5 mt-2 max-w-lg mx-auto">
                {/* Preview Card */}
                <div className="bg-white dark:bg-dark-card p-4 rounded-2xl shadow-soft border border-light-border dark:border-dark-border mb-6 flex gap-4 items-center">
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-200 shrink-0 relative">
                         <img src={result.cover} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 dark:text-white line-clamp-1 text-base mb-1">{result.title || "TikTok Video"}</h3>
                        <div className="flex items-center gap-2 mb-2">
                            <img src={result.author.avatar} className="w-5 h-5 rounded-full" />
                            <span className="text-xs text-gray-500 truncate">@{result.author.nickname}</span>
                        </div>
                    </div>
                </div>

                {/* Video Player */}
                <div className="w-full aspect-[9/16] max-h-[50vh] rounded-2xl overflow-hidden bg-black mb-8 shadow-lg mx-auto">
                    <video 
                        src={result.playUrl} 
                        poster={result.cover} 
                        controls 
                        className="w-full h-full object-contain"
                    />
                </div>

                {/* Format Selection List */}
                <div className="space-y-3 mb-8">
                    <div 
                        onClick={() => setSelectedFormat('video')}
                        className={`p-4 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${selectedFormat === 'video' ? 'bg-orange-50 dark:bg-orange-900/10 border-primary ring-1 ring-primary/50' : 'bg-white dark:bg-dark-card border-light-border dark:border-dark-border'}`}
                    >
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg ${selectedFormat === 'video' ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                                <i className="fas fa-video"></i>
                            </div>
                            <div>
                                <p className="font-bold text-gray-900 dark:text-white">Video (No Watermark)</p>
                                <p className="text-xs text-gray-500">MP4 • High Quality</p>
                            </div>
                        </div>
                        {selectedFormat === 'video' && <i className="fas fa-check-circle text-primary text-xl"></i>}
                    </div>

                    {result.musicUrl && (
                        <div 
                            onClick={() => setSelectedFormat('audio')}
                            className={`p-4 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${selectedFormat === 'audio' ? 'bg-orange-50 dark:bg-orange-900/10 border-primary ring-1 ring-primary/50' : 'bg-white dark:bg-dark-card border-light-border dark:border-dark-border'}`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg ${selectedFormat === 'audio' ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                                    <i className="fas fa-music"></i>
                                </div>
                                <div>
                                    <p className="font-bold text-gray-900 dark:text-white">Audio Only</p>
                                    <p className="text-xs text-gray-500">MP3 • Original Audio</p>
                                </div>
                            </div>
                             {selectedFormat === 'audio' && <i className="fas fa-check-circle text-primary text-xl"></i>}
                        </div>
                    )}
                </div>

                {error && <p className="text-red-500 text-sm mb-4 text-center bg-red-50 dark:bg-red-900/20 py-2 rounded-lg">{error}</p>}

                {/* Download Button */}
                <button 
                    onClick={() => handleDownload()}
                    disabled={isDownloading}
                    className="w-full py-4 bg-primary hover:bg-orange-600 text-white font-bold rounded-2xl shadow-glow active:scale-[0.98] transition-all flex items-center justify-center gap-3 text-lg"
                >
                    {isDownloading ? (
                        <>
                            <div className="loader w-5 h-5"></div>
                            <span>Downloading...</span>
                        </>
                    ) : (
                        <>
                            <i className="fas fa-download"></i>
                            <span>Download {selectedFormat === 'video' ? 'Video' : 'Audio'}</span>
                        </>
                    )}
                </button>
            </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen font-sans selection:bg-primary selection:text-white transition-colors duration-300">
        <main className="max-w-md mx-auto min-h-screen bg-light-bg dark:bg-dark-bg relative shadow-2xl shadow-black/5 overflow-hidden">
            {renderSettings()}
            {activeTab === 'home' && renderHome()}
            {activeTab === 'download' && renderDownload()}
        </main>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);