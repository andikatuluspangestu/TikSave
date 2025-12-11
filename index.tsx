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

  const handleDownload = async () => {
    if (!result) return;
    setIsDownloading(true);
    setError(null);

    const fileUrl = selectedFormat === 'video' ? result.playUrl : result.musicUrl!;
    const ext = selectedFormat === 'video' ? 'mp4' : 'mp3';
    const filename = `tiksave-${result.id}.${ext}`;
    
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
        // Fallback: Open in new tab but with download attribute set (best effort)
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

  // 1. Home View
  const renderHome = () => (
    <div className="animate-fade-in pb-8">
      {/* Header */}
      <header className="px-5 py-4 flex justify-between items-center sticky top-0 z-20 bg-light-bg/80 dark:bg-dark-bg/80 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-orange-500 flex items-center justify-center text-white shadow-glow">
            <i className="fas fa-arrow-down text-sm"></i>
          </div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Video Downloader</h1>
        </div>
        <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="w-9 h-9 rounded-full bg-white dark:bg-dark-card border border-light-border dark:border-dark-border flex items-center justify-center text-gray-600 dark:text-gray-300 shadow-sm transition-transform active:scale-95">
            <i className={`fas fa-${theme === 'light' ? 'moon' : 'sun'}`}></i>
        </button>
      </header>

      <div className="px-5 mt-2">
        {/* Input Area */}
        <div className="relative group z-10">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
            <i className="fas fa-link"></i>
          </div>
          <input 
            type="text" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleProcess()}
            placeholder="Search or Paste Video Link"
            className="w-full pl-10 pr-24 py-4 rounded-2xl bg-white dark:bg-dark-input text-gray-800 dark:text-gray-100 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all border border-transparent focus:border-primary/20"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {url && (
                <button onClick={() => setUrl('')} className="p-2 text-gray-400 hover:text-gray-600">
                    <i className="fas fa-times-circle"></i>
                </button>
            )}
            {!url && (
                 <button onClick={handlePaste} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-xs font-medium rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 transition-colors">
                    Paste
                 </button>
            )}
            <button 
                onClick={() => handleProcess()} 
                disabled={isLoading}
                className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 active:scale-95 transition-transform disabled:opacity-70"
            >
                {isLoading ? <div className="loader w-4 h-4 border-2"></div> : <i className="fas fa-search"></i>}
            </button>
          </div>
        </div>

        {error && <p className="text-red-500 text-xs mt-2 px-2"><i className="fas fa-exclamation-circle mr-1"></i> {error}</p>}

        {/* Banner */}
        <div className="mt-6 relative overflow-hidden rounded-3xl bg-gradient-to-r from-orange-100 to-orange-50 dark:from-orange-900/20 dark:to-dark-card border border-orange-100 dark:border-orange-900/30 p-5 flex items-center justify-between">
           <div className="z-10 relative">
             <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs">
                    <i className="fas fa-film"></i>
                </div>
                <span className="font-bold text-gray-800 dark:text-white">Watch & Save</span>
             </div>
             <p className="text-sm text-gray-500 dark:text-gray-400 max-w-[150px] leading-tight">
               Download your favorite TikToks without watermark.
             </p>
           </div>
           <button onClick={() => handleProcess("https://www.tiktok.com/@tiktok/video/7285437815250439457")} className="z-10 bg-white dark:bg-primary text-primary dark:text-white px-4 py-2 rounded-full text-xs font-bold shadow-md active:scale-95 transition-transform">
              Try Demo
           </button>
           {/* Decorative circles */}
           <div className="absolute -right-5 -bottom-10 w-32 h-32 bg-orange-400/20 rounded-full blur-2xl"></div>
           <div className="absolute right-10 -top-5 w-20 h-20 bg-yellow-400/20 rounded-full blur-xl"></div>
        </div>

        {/* Short Videos (History) */}
        {history.length > 0 && (
            <div className="mt-8">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-800 dark:text-white">Recent Downloads</h3>
                    <span onClick={() => {setHistory([]); localStorage.removeItem('tiksave-history')}} className="text-xs text-gray-400 cursor-pointer hover:text-primary transition-colors">Clear All</span>
                </div>
                <div className="flex overflow-x-auto gap-4 pb-4 no-scrollbar">
                    {history.map((h, i) => (
                        <div key={i} className="flex-shrink-0 w-32 group cursor-pointer" onClick={() => {
                            setResult(h.data);
                            setActiveTab('download');
                        }}>
                            <div className="relative aspect-[3/4] rounded-xl overflow-hidden mb-2 bg-gray-200 dark:bg-dark-card">
                                <img src={h.data.cover} className="w-full h-full object-cover" loading="lazy" />
                                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                                    <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white">
                                        <i className="fas fa-play text-xs ml-0.5"></i>
                                    </div>
                                </div>
                            </div>
                            <p className="text-xs font-medium text-gray-800 dark:text-white truncate">{h.data.title || 'Video'}</p>
                            <p className="text-[10px] text-gray-500 truncate">@{h.data.author.nickname}</p>
                        </div>
                    ))}
                </div>
            </div>
        )}

        <div className="mt-12 text-center">
            <p className="text-xs text-gray-400 dark:text-gray-600">Build With 🤍 by Andika Tulus Pangestu</p>
        </div>
      </div>
    </div>
  );

  // 2. Download/Result View
  const renderDownload = () => {
      if (!result) return (
          <div className="flex flex-col items-center justify-center h-[80vh] px-8 text-center animate-fade-in">
              <div className="w-20 h-20 bg-gray-100 dark:bg-dark-card rounded-full flex items-center justify-center text-gray-300 mb-4">
                  <i className="fas fa-cloud-download-alt text-3xl"></i>
              </div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">No Video Selected</h2>
              <p className="text-gray-500 text-sm mb-6">Go to Home and paste a link to start downloading.</p>
              <button onClick={() => setActiveTab('home')} className="px-6 py-3 bg-primary text-white rounded-full text-sm font-semibold shadow-glow">Go Home</button>
          </div>
      );

      return (
        <div className="pb-8 animate-slide-up">
            <header className="px-5 py-4 flex items-center gap-4 sticky top-0 z-20 bg-light-bg/80 dark:bg-dark-bg/80 backdrop-blur-md">
                <button onClick={() => setActiveTab('home')} className="w-8 h-8 flex items-center justify-center text-gray-600 dark:text-white bg-white dark:bg-dark-card rounded-full shadow-sm">
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h1 className="text-lg font-bold text-gray-900 dark:text-white">Download</h1>
            </header>

            <div className="px-5 mt-2">
                {/* Preview Card */}
                <div className="bg-white dark:bg-dark-card p-3 rounded-2xl shadow-soft border border-light-border dark:border-dark-border mb-6">
                    <div className="flex gap-4">
                        <div className="w-24 aspect-[3/4] rounded-lg overflow-hidden bg-gray-200 shrink-0 relative">
                             <img src={result.cover} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0 py-1">
                            <h3 className="font-bold text-gray-900 dark:text-white line-clamp-2 text-sm mb-1">{result.title || "TikTok Video"}</h3>
                            <div className="flex items-center gap-2 mb-3">
                                <img src={result.author.avatar} className="w-5 h-5 rounded-full" />
                                <span className="text-xs text-gray-500 truncate">@{result.author.nickname}</span>
                            </div>
                            <div className="flex gap-3 text-xs text-gray-400">
                                <span><i className="fas fa-play mr-1"></i>{result.stats?.plays}</span>
                                <span><i className="fas fa-heart mr-1"></i>{result.stats?.likes}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Video Player */}
                <div className="w-full aspect-video rounded-2xl overflow-hidden bg-black mb-6 shadow-lg relative group">
                    <video 
                        src={result.playUrl} 
                        poster={result.cover} 
                        controls 
                        className="w-full h-full object-contain"
                    />
                </div>

                {/* Format Selection List */}
                <div className="space-y-3 mb-8">
                    <h3 className="font-bold text-gray-800 dark:text-white mb-2">Select Format</h3>
                    
                    {/* Option 1: Video */}
                    <div 
                        onClick={() => setSelectedFormat('video')}
                        className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${selectedFormat === 'video' ? 'bg-orange-50 dark:bg-orange-900/10 border-primary' : 'bg-white dark:bg-dark-card border-light-border dark:border-dark-border'}`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedFormat === 'video' ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                                <i className="fas fa-video"></i>
                            </div>
                            <div>
                                <p className="font-semibold text-sm text-gray-900 dark:text-white">Video (No Watermark)</p>
                                <p className="text-xs text-gray-500">MP4 • HD Quality</p>
                            </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedFormat === 'video' ? 'border-primary' : 'border-gray-300'}`}>
                            {selectedFormat === 'video' && <div className="w-2.5 h-2.5 rounded-full bg-primary"></div>}
                        </div>
                    </div>

                    {/* Option 2: Audio */}
                    {result.musicUrl && (
                        <div 
                            onClick={() => setSelectedFormat('audio')}
                            className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${selectedFormat === 'audio' ? 'bg-orange-50 dark:bg-orange-900/10 border-primary' : 'bg-white dark:bg-dark-card border-light-border dark:border-dark-border'}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedFormat === 'audio' ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                                    <i className="fas fa-music"></i>
                                </div>
                                <div>
                                    <p className="font-semibold text-sm text-gray-900 dark:text-white">Audio Only</p>
                                    <p className="text-xs text-gray-500">MP3 • Original Audio</p>
                                </div>
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedFormat === 'audio' ? 'border-primary' : 'border-gray-300'}`}>
                                {selectedFormat === 'audio' && <div className="w-2.5 h-2.5 rounded-full bg-primary"></div>}
                            </div>
                        </div>
                    )}
                </div>

                {error && <p className="text-red-500 text-xs mb-4 text-center">{error}</p>}

                {/* Download Button */}
                <button 
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="w-full py-4 bg-primary hover:bg-orange-600 text-white font-bold rounded-2xl shadow-glow active:scale-[0.98] transition-all flex items-center justify-center gap-2"
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
                <p className="text-center text-xs text-gray-400 mt-4">Saved to device downloads folder</p>
            </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen font-sans selection:bg-primary selection:text-white transition-colors duration-300">
        <main className="max-w-md mx-auto min-h-screen bg-light-bg dark:bg-dark-bg relative shadow-2xl shadow-black/5 overflow-hidden">
            {activeTab === 'home' && renderHome()}
            {activeTab === 'download' && renderDownload()}
        </main>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);