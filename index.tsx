import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";

// Types
interface VideoData {
  id: string;
  url: string; // The original URL entered
  playUrl: string; // No watermark video URL
  musicUrl?: string; // Audio URL
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

const ProgressBar = () => (
  <div className="progress-bar-container rounded-full mt-3">
    <div className="progress-bar-value rounded-full"></div>
  </div>
);

const App = () => {
  // --- State ---
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const [isDownloadingAudio, setIsDownloadingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VideoData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // --- Effects ---

  useEffect(() => {
    const savedTheme = localStorage.getItem("tiksave-theme") || localStorage.getItem("tiksavex-theme") as "light" | "dark" | null;
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (systemPrefersDark) {
      setTheme("dark");
    }

    const savedHistory = localStorage.getItem("tiksave-history") || localStorage.getItem("tiksavex-history");
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("tiksave-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("tiksave-history", JSON.stringify(history));
  }, [history]);

  // --- Handlers ---

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const validateUrl = (input: string) => {
    try {
      const u = new URL(input);
      return u.hostname.includes("tiktok.com");
    } catch {
      return false;
    }
  };

  const handlePaste = async () => {
    try {
        const text = await navigator.clipboard.readText();
        setUrl(text);
        // Optional: immediately process if valid
        if (validateUrl(text)) {
            // handleProcess(text); // Uncomment if auto-process is desired
        }
    } catch (e) {
        setError("Please allow clipboard access or paste manually.");
        setTimeout(() => setError(null), 3000);
    }
  };

  const handleProcess = async (inputUrl: string = url) => {
    setError(null);
    setResult(null);
    
    if (!inputUrl.trim()) {
      setError("Please paste a URL first.");
      return;
    }

    if (!validateUrl(inputUrl)) {
      setError("This doesn't look like a valid TikTok URL.");
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
          author: {
            nickname: data.data.author.nickname,
            avatar: data.data.author.avatar,
          },
          stats: {
            plays: typeof data.data.play_count === 'number' ? data.data.play_count.toLocaleString() : data.data.play_count,
            likes: typeof data.data.digg_count === 'number' ? data.data.digg_count.toLocaleString() : data.data.digg_count
          }
        };

        setResult(videoData);
        addToHistory(videoData);
      } else {
        setError(data.msg || "Failed to fetch video details. Please try again.");
      }
    } catch (err) {
      console.error(err);
      setError("Network error. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const addToHistory = (item: VideoData) => {
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.data.id !== item.id);
      const newHistory = [{ timestamp: Date.now(), data: item }, ...filtered];
      return newHistory.slice(0, 10);
    });
  };

  const handleDownload = async (fileUrl: string, id: string, type: 'video' | 'audio') => {
    const setLoader = type === 'video' ? setIsDownloadingVideo : setIsDownloadingAudio;
    setLoader(true);
    
    try {
      const response = await fetch(fileUrl);
      if(!response.ok) throw new Error("Fetch failed");
      
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `tiksave-${id}.${type === 'video' ? 'mp4' : 'mp3'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      // Fallback for CORS issues or simple direct download
      window.open(fileUrl, '_blank');
    } finally {
      setLoader(false);
    }
  };

  // --- UI Components ---

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-primary selection:text-white transition-colors duration-300">
      {/* Header */}
      <header className="py-6 px-6 flex justify-between items-center max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-primary/30">
                <i className="fas fa-bolt"></i>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">TikSave</h1>
        </div>
        <button
          onClick={toggleTheme}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-white dark:bg-dark-border shadow-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Toggle Theme"
        >
          {theme === "light" ? <i className="fas fa-moon"></i> : <i className="fas fa-sun"></i>}
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-md mx-auto px-4 pb-12">
        
        {/* Hero */}
        <div className="text-center mt-8 mb-8 animate-fade-in">
          <h2 className="text-3xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
            Download TikTok Videos
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            No watermark. Fast. Unlimited.
          </p>
        </div>

        {/* Input Card */}
        <div className="bg-light-card dark:bg-dark-card p-2 rounded-2xl shadow-xl shadow-gray-200/50 dark:shadow-none border border-light-border dark:border-dark-border">
          <div className="relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
               <i className="fas fa-link"></i>
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste link here..."
              className="w-full pl-10 pr-20 py-4 rounded-xl bg-gray-50 dark:bg-[#15171e] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm sm:text-base"
              onKeyDown={(e) => e.key === "Enter" && handleProcess(url)}
            />
            {/* Paste Button */}
            <button 
                onClick={handlePaste}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            >
                Paste
            </button>
          </div>
          
          <button
            onClick={() => handleProcess(url)}
            disabled={isLoading}
            className="w-full mt-2 bg-primary hover:bg-blue-600 text-white font-semibold py-4 rounded-xl transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 overflow-hidden relative"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                  <div className="loader border-white/30 border-t-white w-4 h-4"></div>
                  <span>Processing...</span>
              </div>
            ) : (
              <>
                <span>Download Video</span>
                <i className="fas fa-arrow-right text-sm"></i>
              </>
            )}
          </button>
          
          {/* Progress Bar (Visible when processing) */}
          {isLoading && <ProgressBar />}
        </div>

        {/* Error Message */}
        {error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl border border-red-100 dark:border-red-900/30 flex items-start gap-2 animate-fade-in">
                <i className="fas fa-circle-exclamation mt-0.5"></i>
                <span>{error}</span>
            </div>
        )}

        {/* Result Card */}
        {result && (
          <div className="mt-8 animate-slide-up">
            <div className="bg-white dark:bg-dark-card rounded-2xl overflow-hidden shadow-xl border border-light-border dark:border-dark-border">
              {/* Preview Header */}
              <div className="p-4 border-b border-gray-100 dark:border-dark-border flex items-center gap-3">
                 <img src={result.author.avatar} alt="Author" className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700" />
                 <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">{result.author.nickname}</h3>
                    <p className="text-xs text-gray-500 truncate">Creator</p>
                 </div>
              </div>

              {/* Video Player */}
              <div className="relative aspect-video bg-gray-100 dark:bg-black group">
                 <video 
                    src={result.playUrl} 
                    poster={result.cover} 
                    controls 
                    loop 
                    playsInline 
                    className="w-full h-full object-contain bg-black"
                 />
              </div>
              
              {/* Progress Bar (Visible when downloading) */}
              {(isDownloadingVideo || isDownloadingAudio) && (
                  <div className="w-full px-5 pt-4">
                     <p className="text-xs text-primary mb-1 font-medium text-center">
                         {isDownloadingVideo ? 'Downloading Video...' : 'Downloading Audio...'}
                     </p>
                     <ProgressBar />
                  </div>
              )}

              {/* Info & Actions */}
              <div className="p-5">
                <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 mb-5 leading-relaxed">
                    {result.title || "No caption provided."}
                </p>

                <div className="space-y-3">
                    {/* Video Download */}
                    <button
                        onClick={() => handleDownload(result.playUrl, result.id, 'video')}
                        disabled={isDownloadingVideo || isDownloadingAudio}
                        className="w-full bg-primary hover:bg-blue-600 disabled:opacity-70 disabled:cursor-not-allowed text-white font-medium py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-primary/25"
                    >
                        {isDownloadingVideo ? (
                            <>
                                <div className="loader border-white/30 border-t-white w-4 h-4"></div>
                                <span>Saving Video...</span>
                            </>
                        ) : (
                            <>
                                <i className="fas fa-video"></i>
                                Save Video (No Watermark)
                            </>
                        )}
                    </button>

                    {/* Audio Download */}
                    {result.musicUrl && (
                        <button
                            onClick={() => handleDownload(result.musicUrl!, result.id, 'audio')}
                            disabled={isDownloadingVideo || isDownloadingAudio}
                            className="w-full bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 disabled:opacity-70 disabled:cursor-not-allowed font-medium py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                        >
                            {isDownloadingAudio ? (
                                <>
                                    <div className="loader border-indigo-600/30 border-t-indigo-600 w-4 h-4"></div>
                                    <span>Saving Audio...</span>
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-music"></i>
                                    Download Audio (MP3)
                                </>
                            )}
                        </button>
                    )}
                </div>
              </div>
            </div>
            
            <div className="mt-6 text-center">
                <button 
                    onClick={() => {
                        setResult(null);
                        setUrl("");
                    }}
                    className="text-gray-400 hover:text-primary text-sm transition-colors flex items-center justify-center gap-2 mx-auto"
                >
                    <i className="fas fa-arrow-left"></i> Download Another
                </button>
            </div>
          </div>
        )}

        {/* History Section */}
        {history.length > 0 && !result && (
            <div className="mt-12 animate-fade-in">
                <div className="flex items-center justify-between mb-4 px-2">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white">Recent Downloads</h3>
                    <button 
                        onClick={() => {
                            setHistory([]);
                            localStorage.removeItem('tiksave-history');
                        }}
                        className="text-xs font-medium text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-900/10 px-2 py-1 rounded-lg transition-colors"
                    >
                        Clear History
                    </button>
                </div>
                
                <div className="space-y-3">
                    {history.map((item, index) => (
                        <div 
                            key={`${item.data.id}-${index}`}
                            onClick={() => {
                                setUrl(item.data.url);
                                handleProcess(item.data.url);
                            }}
                            className="flex items-center gap-3 p-3 bg-white dark:bg-dark-card rounded-xl border border-light-border dark:border-dark-border cursor-pointer hover:border-primary/50 dark:hover:border-primary/50 hover:shadow-md transition-all group"
                        >
                            <div className="relative w-16 h-16 shrink-0">
                                <img 
                                    src={item.data.cover} 
                                    alt="Thumb" 
                                    className="w-full h-full rounded-lg object-cover bg-gray-200 dark:bg-gray-800"
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                                    <i className="fas fa-play text-white text-xs"></i>
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-1 group-hover:text-primary transition-colors">
                                    {item.data.title || "Video"}
                                </p>
                                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                    <span>{item.data.author.nickname}</span>
                                    <span>•</span>
                                    <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                                </p>
                            </div>
                            <div className="text-gray-300 dark:text-gray-600 group-hover:text-primary pr-2">
                                <i className="fas fa-chevron-right text-sm"></i>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-gray-400 dark:text-gray-600">
        <p className="font-medium">TikSave &copy; {new Date().getFullYear()}</p>
        <p className="mt-1 opacity-75">Not affiliated with TikTok or ByteDance.</p>
      </footer>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);