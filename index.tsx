import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import JSZip from "jszip";

// --- Translations ---
const translations = {
  en: {
    home: "Home",
    discover: "Discover",
    saved: "Saved",
    history: "History",
    settings: "Settings",
    about: "About",
    pasteLink: "Paste link here",
    download: "Download",
    invalidUrl: "Invalid URL",
    pasteClipboard: "Paste from clipboard",
    linkCopied: "Link copied!",
    downloadStarted: "Download started!",
    batchDownload: "Download All Photos",
    batchStarted: "Zipping images...",
    clear: "Clear",
    recent: "Recent",
    newest: "Newest",
    oldest: "Oldest",
    az: "A-Z",
    za: "Z-A",
    trending: "Trending",
    back: "Back",
    installTitle: "Install TikSave",
    installDesc: "Add to home screen for instant access.",
    notNow: "Not Now",
    install: "Install",
    autoDownload: "Auto Download",
    darkMode: "Dark Mode",
    language: "Language",
    tutorialTitle: "How to Use",
    step1: "1. Copy a video link from TikTok",
    step2: "2. Paste it here or use Auto-Paste",
    step3: "3. Download Video or Audio instantly",
    gotIt: "Got it!",
    smartPasteDetected: "Link detected from clipboard!",
    useLink: "Use Link",
    noFavorites: "No saved videos yet.",
    emptyHistory: "No history yet.",
    loading: "Loading...",
    privateError: "This video appears to be private or deleted.",
    networkError: "Network error. Check connection."
  },
  id: {
    home: "Beranda",
    discover: "Jelajahi",
    saved: "Tersimpan",
    history: "Riwayat",
    settings: "Pengaturan",
    about: "Tentang",
    pasteLink: "Tempel tautan di sini",
    download: "Unduh",
    invalidUrl: "URL tidak valid",
    pasteClipboard: "Tempel dari papan klip",
    linkCopied: "Tautan disalin!",
    downloadStarted: "Unduhan dimulai!",
    batchDownload: "Unduh Semua Foto",
    batchStarted: "Mengompres foto...",
    clear: "Hapus",
    recent: "Terbaru",
    newest: "Paling Baru",
    oldest: "Paling Lama",
    az: "A-Z",
    za: "Z-A",
    trending: "Sedang Tren",
    back: "Kembali",
    installTitle: "Pasang TikSave",
    installDesc: "Tambahkan ke layar utama untuk akses cepat.",
    notNow: "Nanti",
    install: "Pasang",
    autoDownload: "Unduh Otomatis",
    darkMode: "Mode Gelap",
    language: "Bahasa",
    tutorialTitle: "Cara Menggunakan",
    step1: "1. Salin tautan video dari TikTok",
    step2: "2. Tempel di sini atau gunakan Auto-Paste",
    step3: "3. Unduh Video atau Audio instan",
    gotIt: "Mengerti!",
    smartPasteDetected: "Tautan terdeteksi dari papan klip!",
    useLink: "Gunakan",
    noFavorites: "Belum ada video tersimpan.",
    emptyHistory: "Belum ada riwayat.",
    loading: "Memuat...",
    privateError: "Video ini sepertinya pribadi atau dihapus.",
    networkError: "Masalah jaringan. Cek koneksi."
  }
};

// --- Types ---
interface VideoData {
  id: string;
  url: string;
  playUrl: string;
  hdPlayUrl?: string;
  musicUrl?: string;
  cover: string;
  title: string;
  images?: string[]; // Added for Slideshow support
  author: {
    nickname: string;
    avatar: string;
  };
  stats?: {
    plays: string;
    likes: string;
  };
  size?: number;
  hdSize?: number;
}

interface HistoryItem {
  timestamp: number;
  data: VideoData;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

const App = () => {
  // --- State ---
  const [activeTab, setActiveTab] = useState<'home' | 'download'>('home');
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [result, setResult] = useState<VideoData | null>(null);
  
  // Sidebar States
  const [showDiscover, setShowDiscover] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  // New States
  const [lang, setLang] = useState<'en' | 'id'>(() => (localStorage.getItem('tiksave-lang') as 'en'|'id') || 'en');
  const [favorites, setFavorites] = useState<VideoData[]>(() => {
     try { return JSON.parse(localStorage.getItem('tiksave-favorites') || '[]'); } catch { return []; }
  });
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem('tiksave-tutorial-seen'));
  const [detectedLink, setDetectedLink] = useState<string | null>(null);

  // Trending State
  const [trendingVideos, setTrendingVideos] = useState<VideoData[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(false);
  const [currentKeyword, setCurrentKeyword] = useState("");

  // Toast State
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // History Sort State
  const [sortOrder, setSortOrder] = useState<'date-desc' | 'date-asc' | 'title-asc' | 'title-desc'>('date-desc');
  
  // PWA Install State & Usage Tracking
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [downloadCount, setDownloadCount] = useState(() => {
     if (typeof window === 'undefined') return 0;
     return parseInt(localStorage.getItem('tiksave-download-count') || '0');
  });
  
  // History
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

  const t = translations[lang];

  // --- Helpers ---
  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast(t.linkCopied, "success");
    } catch (err) {
      addToast("Failed to copy", "error");
    }
  };

  const toggleFavorite = (video: VideoData) => {
    setFavorites(prev => {
      const exists = prev.find(v => v.id === video.id);
      let newFavs;
      if (exists) {
        newFavs = prev.filter(v => v.id !== video.id);
        addToast("Removed from Saved", "info");
      } else {
        newFavs = [video, ...prev];
        addToast("Added to Saved", "success");
      }
      localStorage.setItem('tiksave-favorites', JSON.stringify(newFavs));
      return newFavs;
    });
  };

  const isFavorite = (id: string) => favorites.some(v => v.id === id);

  const extractUrl = (text: string): string | null => {
    const match = text.match(/https?:\/\/(?:www\.|vm\.|vt\.|m\.|t\.)?tiktok\.com\/[^\s]+/);
    if (!match) return null;
    return match[0].replace(/[.,;!?)]+$/, "");
  };

  const validateUrl = (input: string): { isValid: boolean; cleanUrl: string | null; error?: string } => {
    if (!input || !input.trim()) return { isValid: false, cleanUrl: null, error: t.pasteLink };
    if (!input.includes("tiktok.com")) return { isValid: false, cleanUrl: null, error: t.invalidUrl };

    const cleanUrl = extractUrl(input);
    if (!cleanUrl) return { isValid: false, cleanUrl: null, error: t.invalidUrl };
    
    return { isValid: true, cleanUrl };
  };

  const formatSize = (bytes?: number) => {
      if (!bytes) return '';
      const mb = bytes / (1024 * 1024);
      return `${mb.toFixed(1)} MB`;
  };

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

  const checkClipboard = async () => {
    try {
      if (document.visibilityState === 'visible') {
        const text = await navigator.clipboard.readText();
        const { isValid, cleanUrl } = validateUrl(text);
        if (isValid && cleanUrl && cleanUrl !== url) {
           setDetectedLink(cleanUrl);
        } else {
           setDetectedLink(null);
        }
      }
    } catch (e) { }
  };

  const fetchTrending = async () => {
    if (trendingVideos.length > 0) return; 

    setIsLoadingTrending(true);
    const keywords = ["daster", "pargoy", "atas bawah", "indo viral"];
    const randomKeyword = keywords[Math.floor(Math.random() * keywords.length)];
    setCurrentKeyword(randomKeyword);

    try {
      const response = await fetch(`https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(randomKeyword)}&count=12`);
      const data = await response.json();
      
      if (data.code === 0 && data.data) {
        const list = Array.isArray(data.data) ? data.data : (data.data.videos || []);
        
        // SAFE MAPPING to prevent crashes
        const mapped: VideoData[] = list.map((item: any) => ({
          id: item.video_id || item.id || Math.random().toString(),
          url: `https://www.tiktok.com/@${item.author?.unique_id || 'user'}/video/${item.video_id}`,
          playUrl: item.play,
          hdPlayUrl: item.hdplay,
          musicUrl: item.music,
          cover: item.cover,
          title: item.title || '',
          images: item.images,
          author: { 
              nickname: item.author?.nickname || 'TikTok User', 
              avatar: item.author?.avatar || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' 
          },
          stats: {
            plays: item.play_count ? (typeof item.play_count === 'number' ? item.play_count.toLocaleString() : item.play_count) : '0',
            likes: item.digg_count ? (typeof item.digg_count === 'number' ? item.digg_count.toLocaleString() : item.digg_count) : '0'
          }
        }));
        setTrendingVideos(mapped);
      }
    } catch (e) {
      console.error("Fetch trending failed", e);
      addToast(t.networkError, "error");
    } finally {
      setIsLoadingTrending(false);
    }
  };

  // --- Effects ---
  useEffect(() => {
    // Only capture the event, do not show modal immediately
    const handler = (e: any) => { 
        e.preventDefault(); 
        setInstallPrompt(e); 
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('focus', checkClipboard);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('focus', checkClipboard);
    };
  }, []);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("tiksave-theme", theme);
  }, [theme]);

  useEffect(() => localStorage.setItem("tiksave-history", JSON.stringify(history)), [history]);
  useEffect(() => localStorage.setItem("tiksave-auto-download", JSON.stringify(autoDownload)), [autoDownload]);
  useEffect(() => localStorage.setItem("tiksave-lang", lang), [lang]);

  useEffect(() => {
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

  useEffect(() => {
      if (showDiscover) fetchTrending();
  }, [showDiscover]);

  // --- Handlers ---
  const handleInstallApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setShowInstallModal(false);
  };

  const handleProcess = async (inputUrl: string = url) => {
    const { isValid, cleanUrl, error: validationError } = validateUrl(inputUrl);

    if (!isValid || !cleanUrl) {
      addToast(validationError || t.invalidUrl, "error");
      return;
    }
    
    if (inputUrl !== cleanUrl) setUrl(cleanUrl);
    setDetectedLink(null); 
    
    setIsLoading(true);
    try {
      const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}&hd=1`);
      const data = await response.json();
      
      if (data.code === 0) {
        const videoData: VideoData = {
          id: data.data.id,
          url: cleanUrl,
          playUrl: data.data.play,
          hdPlayUrl: data.data.hdplay,
          musicUrl: data.data.music,
          cover: data.data.cover,
          title: data.data.title,
          images: data.data.images,
          author: { 
              nickname: data.data.author?.nickname || 'User', 
              avatar: data.data.author?.avatar || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' 
          },
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
        addToast(t.loading.replace("...", " OK!"), "success");

        // Increment usage count for PWA prompt
        const newCount = downloadCount + 1;
        setDownloadCount(newCount);
        localStorage.setItem('tiksave-download-count', newCount.toString());
        
        // Trigger Install Modal on 2nd successful download if prompt is available
        if (newCount === 2 && installPrompt) {
            setShowInstallModal(true);
        }

        if (autoDownload && !videoData.images) {
          const targetUrl = videoData.hdPlayUrl || videoData.playUrl;
          const suffix = videoData.hdPlayUrl ? '1080p' : '720p';
          setTimeout(() => handleDownload(targetUrl, 'video', suffix), 500); 
        }
      } else {
        const msg = data.msg || "Failed";
        if (msg.toLowerCase().includes("private")) addToast(t.privateError, "error");
        else addToast(msg, "error");
      }
    } catch (err) {
      addToast(t.networkError, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const addToHistory = (item: VideoData) => {
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.data.id !== item.id);
      return [{ timestamp: Date.now(), data: item }, ...filtered].slice(0, 50);
    });
  };

  const fetchBlob = async (url: string) => {
      const strategies = [
          () => fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`).then(r => r.blob()),
          () => fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`).then(r => r.blob()),
          () => fetch(url, { referrerPolicy: 'no-referrer' }).then(r => r.blob())
      ];
      for (const s of strategies) {
          try {
              const b = await s();
              if (b.size > 0) return b;
          } catch(e){}
      }
      throw new Error("Failed to fetch blob");
  };

  const handleDownload = async (fileUrl: string, type: 'video' | 'audio' | 'image', label: string = '') => {
    if (!result || !fileUrl) return;
    setIsDownloading(true);

    let ext = 'mp4';
    if (type === 'audio') ext = 'mp3';
    if (type === 'image') ext = 'jpg';

    const cleanTitle = (result.title || 'video').replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    const filename = `tiksave_${result.id}_${cleanTitle}_${label}.${ext}`;
    
    try {
      const blob = await fetchBlob(fileUrl);
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
      addToast(t.downloadStarted, "success");
    } catch (e) {
      addToast("Download failed. Try manual.", "error");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleBatchDownload = async () => {
    if (!result || !result.images) return;
    setIsDownloading(true);
    addToast(t.batchStarted, "info");
    
    try {
        const zip = new JSZip();
        const folder = zip.folder(`tiksave_${result.id}`);
        
        const promises = result.images.map(async (imgUrl, i) => {
            try {
                const blob = await fetchBlob(imgUrl);
                folder?.file(`image_${i + 1}.jpg`, blob);
            } catch (e) { console.error("Failed image", i); }
        });

        await Promise.all(promises);
        const content = await zip.generateAsync({ type: "blob" });
        
        const blobUrl = window.URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `tiksave_slides_${result.id}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addToast(t.downloadStarted, "success");
    } catch(e) {
        addToast("Batch download failed.", "error");
    } finally {
        setIsDownloading(false);
    }
  };

  const handlePaste = async () => {
      try {
          const text = await navigator.clipboard.readText();
          setUrl(text);
      } catch (e) { addToast("Clipboard denied", "error"); }
  };

  // --- Renderers ---
  const renderTutorial = () => {
      if (!showTutorial) return null;
      return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 animate-fade-in bg-black/80 backdrop-blur-sm">
           <div className="bg-white dark:bg-dark-card w-full max-w-sm rounded-3xl p-8 text-center shadow-2xl animate-slide-up border border-white/10 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-purple-500"></div>
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                 <i className="fas fa-magic text-3xl text-primary"></i>
              </div>
              <h2 className="text-2xl font-bold mb-2 dark:text-white">{t.tutorialTitle}</h2>
              <div className="text-left space-y-4 my-6 text-gray-600 dark:text-gray-300 text-sm">
                  <p className="flex items-center gap-3"><span className="w-6 h-6 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-xs font-bold">1</span> {t.step1}</p>
                  <p className="flex items-center gap-3"><span className="w-6 h-6 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-xs font-bold">2</span> {t.step2}</p>
                  <p className="flex items-center gap-3"><span className="w-6 h-6 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-xs font-bold">3</span> {t.step3}</p>
              </div>
              <button 
                  onClick={() => { setShowTutorial(false); localStorage.setItem('tiksave-tutorial-seen', 'true'); }}
                  className="w-full py-3 bg-primary hover:bg-orange-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-primary/30"
              >
                  {t.gotIt}
              </button>
           </div>
        </div>
      );
  };

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
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t.installTitle}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t.installDesc}</p>
               </div>
            </div>
            <div className="flex gap-3">
               <button onClick={() => setShowInstallModal(false)} className="flex-1 py-3 rounded-xl font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">{t.notNow}</button>
               <button onClick={handleInstallApp} className="flex-1 py-3 rounded-xl font-semibold text-white bg-primary hover:bg-orange-600 transition-colors shadow-lg shadow-primary/30">{t.install}</button>
            </div>
         </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className={`fixed inset-0 z-[110] flex items-center justify-center p-4 transition-opacity duration-200 ${showSettings ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowSettings(false); setSettingsView('general'); }}></div>
        <div className={`bg-white dark:bg-dark-card w-full max-w-sm rounded-3xl p-6 shadow-2xl transform transition-transform duration-200 ${showSettings ? 'scale-100' : 'scale-95'}`}>
            <div className="flex justify-between items-center mb-6">
                <div className="flex gap-4">
                    <button onClick={() => setSettingsView('general')} className={`text-lg font-bold transition-colors ${settingsView === 'general' ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>{t.settings}</button>
                    <button onClick={() => setSettingsView('about')} className={`text-lg font-bold transition-colors ${settingsView === 'about' ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>{t.about}</button>
                </div>
                <button onClick={() => { setShowSettings(false); setSettingsView('general'); }} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500"><i className="fas fa-times"></i></button>
            </div>
            
            {settingsView === 'general' ? (
                <div className="space-y-4">
                    {/* Auto Download */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-bg rounded-xl">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center"><i className="fas fa-bolt"></i></div>
                            <span className="font-semibold text-gray-800 dark:text-white">{t.autoDownload}</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={autoDownload} onChange={(e) => setAutoDownload(e.target.checked)} className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                        </label>
                    </div>

                    {/* Dark Mode */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-bg rounded-xl">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center"><i className="fas fa-moon"></i></div>
                            <span className="font-semibold text-gray-800 dark:text-white">{t.darkMode}</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={theme === 'dark'} onChange={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                        </label>
                    </div>

                    {/* Language */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-bg rounded-xl">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center"><i className="fas fa-language"></i></div>
                            <span className="font-semibold text-gray-800 dark:text-white">{t.language}</span>
                        </div>
                        <div className="flex gap-1 bg-gray-200 dark:bg-gray-700 p-1 rounded-lg">
                           <button onClick={() => setLang('en')} className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${lang === 'en' ? 'bg-white dark:bg-dark-card shadow-sm text-primary' : 'text-gray-500'}`}>EN</button>
                           <button onClick={() => setLang('id')} className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${lang === 'id' ? 'bg-white dark:bg-dark-card shadow-sm text-primary' : 'text-gray-500'}`}>ID</button>
                        </div>
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
                        <p>Version 2.0.2 (Crash Fixes)</p>
                    </div>
                 </div>
            )}
        </div>
    </div>
  );

  const renderHistoryItem = (h: {data: VideoData}, i: number, vertical: boolean) => (
    <div key={i} className={`group cursor-pointer ${vertical ? 'w-full flex gap-4 items-center bg-transparent p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl transition-colors' : 'flex-shrink-0 w-24'}`} onClick={() => { setResult(h.data); setActiveTab('download'); if(showHistory) setShowHistory(false); }}>
        <div className={`relative rounded-xl overflow-hidden bg-gray-200 dark:bg-dark-card border border-gray-100 dark:border-dark-border ${vertical ? 'w-16 h-20 flex-shrink-0' : 'aspect-[3/4] mb-1'}`}>
            <img src={h.data.cover} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" loading="lazy" />
            <div className="absolute inset-0 flex items-center justify-center"><i className="fas fa-play text-white opacity-0 group-hover:opacity-100 drop-shadow-md"></i></div>
            {h.data.images && <div className="absolute top-1 right-1 bg-black/50 rounded-full p-1"><i className="fas fa-images text-white text-[8px]"></i></div>}
        </div>
        {vertical && (
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm line-clamp-2">{h.data.title || 'No Title'}</p>
                <div className="flex items-center gap-1 mt-1 text-xs text-gray-500"><i className="fas fa-user-circle"></i><span className="truncate">@{h.data.author.nickname}</span></div>
            </div>
        )}
    </div>
  );

  // --- Sidebar Renderers ---
  
  const renderDiscoverSidebar = () => (
      <>
          <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] transition-opacity duration-300 ${showDiscover ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setShowDiscover(false)}></div>
          <div className={`fixed inset-y-0 left-0 w-full md:w-[420px] bg-white dark:bg-dark-card z-[100] transform transition-transform duration-300 ease-out shadow-2xl ${showDiscover ? 'translate-x-0' : '-translate-x-full'}`}>
              <div className="flex flex-col h-full relative">
                  <header className="p-5 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-white/90 dark:bg-dark-card/90 backdrop-blur-xl z-20 flex-shrink-0">
                      <div className="flex flex-col">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><i className="fas fa-compass text-primary"></i> {t.discover}</h2>
                        {currentKeyword && <span className="text-xs text-gray-500 dark:text-gray-400 capitalize mt-1">Ref: {currentKeyword}</span>}
                      </div>
                      <button onClick={() => setShowDiscover(false)} className="w-9 h-9 flex items-center justify-center bg-gray-100 dark:bg-white/10 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"><i className="fas fa-times"></i></button>
                  </header>
                  <div className="flex-1 overflow-y-auto p-4 no-scrollbar relative z-10">
                      {isLoadingTrending ? (
                           <div className="grid grid-cols-2 gap-3">{[1,2,3,4,5,6].map(i => <div key={i} className="aspect-[3/4] bg-gray-200 dark:bg-white/5 rounded-xl animate-pulse"></div>)}</div>
                      ) : (
                           <div className="grid grid-cols-2 gap-3">
                               {trendingVideos.map((item, idx) => (
                                   <div key={idx} onClick={() => { setResult(item); addToHistory(item); setActiveTab('download'); setShowDiscover(false); }} className="relative group cursor-pointer rounded-xl overflow-hidden aspect-[3/4] bg-gray-200 dark:bg-dark-card shadow-sm border border-gray-100 dark:border-white/5">
                                       <img src={item.cover} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                                       <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90"></div>
                                       <div className="absolute bottom-2 left-2 right-2 text-white">
                                           <div className="flex items-center gap-1.5 mb-1">
                                               <div className="w-4 h-4 rounded-full overflow-hidden border border-white/30"><img src={item.author?.avatar || 'https://cdn-icons-png.flaticon.com/512/847/847969.png'} className="w-full h-full object-cover"/></div>
                                               <span className="text-[10px] font-semibold truncate opacity-90">{item.author?.nickname || 'User'}</span>
                                           </div>
                                            <div className="flex items-center justify-between text-[10px] opacity-70">
                                               <span className="flex items-center gap-1"><i className="fas fa-play"></i> {item.stats?.plays || '0'}</span>
                                           </div>
                                       </div>
                                       {item.images && <div className="absolute top-2 right-2 bg-black/60 px-1.5 py-0.5 rounded-full text-[9px] text-white font-bold"><i className="fas fa-images mr-1"></i> Slide</div>}
                                   </div>
                               ))}
                           </div>
                      )}
                  </div>
              </div>
          </div>
      </>
  );

  const renderSavedSidebar = () => (
      <>
          <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] transition-opacity duration-300 ${showSaved ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setShowSaved(false)}></div>
          <div className={`fixed inset-y-0 right-0 w-full md:w-[420px] bg-white dark:bg-dark-card z-[100] transform transition-transform duration-300 ease-out shadow-2xl ${showSaved ? 'translate-x-0' : 'translate-x-full'}`}>
              <div className="flex flex-col h-full relative">
                  <header className="p-5 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-white/90 dark:bg-dark-card/90 backdrop-blur-xl z-20 flex-shrink-0">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><i className="fas fa-heart text-red-500"></i> {t.saved}</h2>
                      <button onClick={() => setShowSaved(false)} className="w-9 h-9 flex items-center justify-center bg-gray-100 dark:bg-white/10 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"><i className="fas fa-times"></i></button>
                  </header>
                  <div className="flex-1 overflow-y-auto p-4 no-scrollbar relative z-10">
                     {favorites.length === 0 ? (
                         <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                             <i className="far fa-heart text-4xl mb-4 opacity-50"></i>
                             <p>{t.noFavorites}</p>
                         </div>
                     ) : (
                         <div className="grid grid-cols-2 gap-3">
                             {favorites.map((item, idx) => (
                                <div key={idx} className="relative group">
                                   <div onClick={() => { setResult(item); setActiveTab('download'); setShowSaved(false); }} className="cursor-pointer rounded-xl overflow-hidden aspect-[3/4] bg-gray-200 dark:bg-dark-card border border-gray-100 dark:border-white/5">
                                       <img src={item.cover} className="w-full h-full object-cover" loading="lazy" />
                                       <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors"></div>
                                       <div className="absolute bottom-2 left-2 text-white text-[10px] font-medium drop-shadow-md truncate w-3/4">@{item.author.nickname}</div>
                                   </div>
                                   <button onClick={(e) => { e.stopPropagation(); toggleFavorite(item); }} className="absolute top-2 right-2 w-7 h-7 bg-white dark:bg-black/50 rounded-full flex items-center justify-center text-red-500 shadow-sm z-10 hover:scale-110 transition-transform"><i className="fas fa-heart text-xs"></i></button>
                                </div>
                             ))}
                         </div>
                     )}
                  </div>
              </div>
          </div>
      </>
  );

  const renderHistorySidebar = () => (
      <>
          <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] transition-opacity duration-300 ${showHistory ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setShowHistory(false)}></div>
          <div className={`fixed inset-y-0 right-0 w-full md:w-[420px] bg-white dark:bg-dark-card z-[100] transform transition-transform duration-300 ease-out shadow-2xl ${showHistory ? 'translate-x-0' : 'translate-x-full'}`}>
              <div className="flex flex-col h-full relative">
                  <header className="p-5 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-white/90 dark:bg-dark-card/90 backdrop-blur-xl z-20 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">{t.history}</h2>
                        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as any)} className="bg-transparent text-[10px] font-medium text-gray-500 dark:text-gray-400 border-none outline-none cursor-pointer hover:text-primary transition-colors appearance-none ml-2">
                            <option value="date-desc">{t.newest}</option>
                            <option value="date-asc">{t.oldest}</option>
                            <option value="title-asc">{t.az}</option>
                            <option value="title-desc">{t.za}</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                         <button onClick={() => {setHistory([]); localStorage.removeItem('tiksave-history')}} className="text-[10px] text-primary hover:text-orange-600 transition-colors px-3 py-1.5 rounded-full bg-orange-50 dark:bg-orange-900/10 font-bold">{t.clear}</button>
                         <button onClick={() => setShowHistory(false)} className="w-9 h-9 flex items-center justify-center bg-gray-100 dark:bg-white/10 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"><i className="fas fa-times"></i></button>
                      </div>
                  </header>
                  <div className="flex-1 overflow-y-auto p-4 no-scrollbar relative z-10 space-y-2">
                     {history.length === 0 ? (
                         <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                             <i className="fas fa-history text-4xl mb-4 opacity-50"></i>
                             <p>{t.emptyHistory}</p>
                         </div>
                     ) : (
                         getSortedHistory().map((h, i) => renderHistoryItem(h, i, true))
                     )}
                  </div>
              </div>
          </div>
      </>
  );

  const renderHome = () => (
    <div className="animate-fade-in relative h-screen w-full flex flex-col md:flex-row md:items-start overflow-hidden">
      {/* Mobile Header */}
      <header className="md:hidden px-6 py-6 flex justify-between items-center absolute top-0 left-0 right-0 z-40 pointer-events-none">
        <div className="flex gap-3 pointer-events-auto">
            <button onClick={() => setShowDiscover(true)} className="w-10 h-10 rounded-full bg-white dark:bg-dark-card border border-light-border dark:border-dark-border flex items-center justify-center text-primary shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800"><i className="fas fa-compass"></i></button>
            <button onClick={() => setShowSaved(true)} className="w-10 h-10 rounded-full bg-white dark:bg-dark-card border border-light-border dark:border-dark-border flex items-center justify-center text-red-500 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800"><i className="fas fa-heart"></i></button>
            <button onClick={() => setShowHistory(true)} className="w-10 h-10 rounded-full bg-white dark:bg-dark-card border border-light-border dark:border-dark-border flex items-center justify-center text-gray-600 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800"><i className="fas fa-history"></i></button>
        </div>
        <button onClick={() => setShowSettings(true)} className="pointer-events-auto w-10 h-10 rounded-full bg-white dark:bg-dark-card border border-light-border dark:border-dark-border flex items-center justify-center text-gray-600 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800"><i className="fas fa-cog"></i></button>
      </header>
      
      {/* Desktop Header */}
      <header className="hidden md:flex px-8 py-6 justify-between items-center fixed top-0 left-0 right-0 z-40 pointer-events-none w-full max-w-[1920px] mx-auto">
         <div className="flex gap-4 pointer-events-auto">
             <button onClick={() => setShowDiscover(true)} className="px-5 py-2.5 rounded-full bg-white dark:bg-dark-card border border-light-border dark:border-white/10 flex items-center gap-2 text-gray-900 dark:text-white font-bold shadow-sm hover:bg-gray-50 transition-colors"><i className="fas fa-compass text-primary"></i> {t.discover}</button>
             <button onClick={() => setShowSaved(true)} className="px-5 py-2.5 rounded-full bg-white dark:bg-dark-card border border-light-border dark:border-white/10 flex items-center gap-2 text-gray-900 dark:text-white font-bold shadow-sm hover:bg-gray-50 transition-colors"><i className="fas fa-heart text-red-500"></i> {t.saved}</button>
             <button onClick={() => setShowHistory(true)} className="px-5 py-2.5 rounded-full bg-white dark:bg-dark-card border border-light-border dark:border-white/10 flex items-center gap-2 text-gray-900 dark:text-white font-bold shadow-sm hover:bg-gray-50 transition-colors"><i className="fas fa-history text-gray-500"></i> {t.history}</button>
         </div>
         <button onClick={() => setShowSettings(true)} className="pointer-events-auto w-10 h-10 rounded-full bg-white dark:bg-dark-card border border-light-border dark:border-white/10 flex items-center justify-center text-gray-600 dark:text-gray-300 shadow-sm hover:bg-gray-50 transition-colors"><i className="fas fa-cog"></i></button>
      </header>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col h-screen px-6 md:px-0 relative z-10 w-full transition-all duration-300`}>
        <div className="flex-1 flex flex-col justify-center items-center w-full max-w-lg md:max-w-2xl mx-auto text-center space-y-6 md:space-y-10">
            <div className="flex flex-col items-center gap-4 md:gap-6">
                 <div className="hidden md:block relative group mb-2">
                     <i className="fa-brands fa-tiktok text-8xl text-gray-900 dark:text-white opacity-90 drop-shadow-2xl"></i>
                     <div className="absolute bottom-0 right-0 bg-gradient-to-br from-primary to-orange-600 text-white w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg border-4 border-light-bg dark:border-dark-bg transform translate-x-1/4 translate-y-1/4"><i className="fas fa-arrow-down text-lg"></i></div>
                 </div>
                 <div className="space-y-2">
                    <h1 className="text-3xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tighter">Tik<span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-[#FE2C55]">Save</span></h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm md:text-lg font-medium max-w-md mx-auto px-4 leading-relaxed">{t.pasteLink}</p>
                 </div>
            </div>

            <div className="relative group w-full text-left max-w-md md:max-w-xl mx-auto">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400"><i className="fas fa-link text-lg"></i></div>
                <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleProcess()} placeholder={t.pasteLink} className="w-full pl-12 pr-14 py-4 md:py-5 rounded-2xl bg-white dark:bg-dark-card text-gray-800 dark:text-gray-100 placeholder-gray-400 shadow-soft md:shadow-2xl md:shadow-black/5 focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all border border-gray-100 dark:border-white/5 focus:border-primary/50 text-base md:text-lg" />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {url && <button onClick={() => setUrl('')} className="p-2 text-gray-400 hover:text-gray-600 transition-colors"><i className="fas fa-times-circle"></i></button>}
                    <button onClick={() => handleProcess()} disabled={isLoading} className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 active:scale-95 transition-transform disabled:opacity-70 hover:bg-orange-600">{isLoading ? <div className="loader w-4 h-4 border-2"></div> : <i className="fas fa-download text-sm md:text-base"></i>}</button>
                </div>
            </div>
            
            <div className="flex flex-col items-center gap-2">
                 <button onClick={handlePaste} className="text-xs font-semibold text-primary hover:text-orange-600 flex items-center gap-2 bg-primary/5 px-3 py-1.5 rounded-full transition-colors"><i className="fas fa-paste"></i> {t.pasteClipboard}</button>
                 {detectedLink && (
                    <div className="animate-fade-in bg-gray-900 text-white text-xs py-2 px-4 rounded-full flex items-center gap-3 cursor-pointer shadow-xl hover:scale-105 transition-transform" onClick={() => { setUrl(detectedLink); handleProcess(detectedLink); }}>
                        <span>{t.smartPasteDetected}</span>
                        <span className="font-bold text-primary">{t.useLink}</span>
                    </div>
                 )}
            </div>
        </div>

        {/* Mobile Recent */}
        {history.length > 0 && (
            <div className="md:hidden pb-6 px-4 w-full max-w-lg mx-auto shrink-0 z-20 relative">
                 <div className="flex justify-between items-center mb-2 px-1">
                    <div className="flex items-center gap-2">
                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t.recent}</h3>
                    </div>
                    <button onClick={() => setShowHistory(true)} className="text-[10px] text-primary hover:text-orange-600 transition-colors bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-md font-bold">View All</button>
                </div>
                <div className="flex overflow-x-auto gap-3 pb-1 no-scrollbar mask-linear-fade px-1">
                    {getSortedHistory().slice(0, 5).map((h, i) => renderHistoryItem(h, i, false))}
                </div>
            </div>
        )}

        <footer className="pb-4 pt-2 text-center text-gray-400 dark:text-gray-600 text-[10px] font-medium shrink-0">Build with 🤍 by andikatuluspgstu</footer>
      </div>
    </div>
  );

  const renderDownload = () => {
    if (!result) return null;
    return (
      <div className="animate-fade-in min-h-screen p-6 flex flex-col items-center max-w-4xl mx-auto pt-20">
         <div className="w-full flex justify-between items-center mb-8 px-4">
            <button onClick={() => { setActiveTab('home'); setUrl(''); }} className="w-10 h-10 rounded-full bg-white dark:bg-dark-card border border-gray-200 dark:border-white/10 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/20 transition-colors shadow-sm"><i className="fas fa-arrow-left"></i></button>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t.download}</h2>
            <div className="w-10"></div>
         </div>

         <div className="w-full bg-white dark:bg-dark-card rounded-3xl p-6 shadow-xl border border-gray-100 dark:border-white/5 flex flex-col md:flex-row gap-8">
             {/* Media Preview */}
             <div className="w-full md:w-1/3 shrink-0">
                <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-gray-200 dark:bg-black/50 relative shadow-inner">
                   <img src={result.cover} className="w-full h-full object-cover" />
                   {result.stats && (
                     <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-4 text-xs font-bold text-white drop-shadow-md bg-black/30 py-1 backdrop-blur-sm">
                        <span className="flex items-center gap-1"><i className="fas fa-play"></i> {result.stats.plays}</span>
                        <span className="flex items-center gap-1"><i className="fas fa-heart"></i> {result.stats.likes}</span>
                     </div>
                   )}
                </div>
             </div>

             {/* Details & Actions */}
             <div className="flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                   <img src={result.author.avatar} className="w-12 h-12 rounded-full border border-gray-200 dark:border-white/10 bg-gray-100 object-cover" />
                   <div className="overflow-hidden">
                      <h3 className="font-bold text-gray-900 dark:text-white text-lg truncate">@{result.author.nickname}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{result.title}</p>
                   </div>
                </div>

                <div className="flex-1 space-y-3">
                   {result.images ? (
                       <div className="space-y-3">
                         <div className="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-2xl border border-orange-100 dark:border-orange-900/20 text-center">
                            <p className="text-orange-600 dark:text-orange-400 font-bold mb-2"><i className="fas fa-images"></i> Slideshow</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{result.images.length} Photos</p>
                            <button onClick={handleBatchDownload} disabled={isDownloading} className="w-full py-3 bg-primary hover:bg-orange-600 text-white rounded-xl font-bold shadow-lg shadow-primary/30 transition-all flex items-center justify-center gap-2">
                               {isDownloading ? <div className="loader w-4 h-4 border-2 rounded-full border-white/30 border-t-white animate-spin"></div> : <><i className="fas fa-download"></i> {t.batchDownload}</>}
                            </button>
                         </div>
                       </div>
                   ) : (
                       <div className="space-y-3">
                          <button onClick={() => handleDownload(result.playUrl, 'video', 'no_wm')} disabled={isDownloading} className="w-full py-3 bg-primary hover:bg-orange-600 text-white rounded-xl font-bold shadow-lg shadow-primary/30 transition-all flex items-center justify-between px-6">
                             <span className="flex items-center gap-2"><i className="fas fa-download"></i> Video (No WM)</span>
                             <span className="text-xs opacity-70">{formatSize(result.size)}</span>
                          </button>
                          
                          {result.hdPlayUrl && (
                              <button onClick={() => handleDownload(result.hdPlayUrl!, 'video', 'hd_no_wm')} disabled={isDownloading} className="w-full py-3 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-bold shadow-lg transition-all flex items-center justify-between px-6">
                                 <span className="flex items-center gap-2"><i className="fas fa-bolt"></i> HD Video</span>
                                 <span className="text-xs opacity-70">{formatSize(result.hdSize)}</span>
                              </button>
                          )}
                       </div>
                   )}
                   
                   {result.musicUrl && (
                      <button onClick={() => handleDownload(result.musicUrl!, 'audio', 'audio')} disabled={isDownloading} className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold shadow-lg shadow-green-500/30 transition-all flex items-center justify-center gap-2 mt-4">
                         <i className="fas fa-music"></i> Audio (MP3)
                      </button>
                   )}

                   <div className="pt-4 border-t border-gray-100 dark:border-white/5 mt-4">
                        <button onClick={() => { if(result.url) copyToClipboard(result.url); }} className="w-full py-2.5 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                             <i className="fas fa-link"></i> Copy Original Link
                        </button>
                   </div>
                </div>
             </div>
         </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg transition-colors duration-200 font-sans">
      {renderInstallModal()}
      {renderTutorial()}
      {renderSettings()}
      {renderDiscoverSidebar()}
      {renderSavedSidebar()}
      {renderHistorySidebar()}

      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[120] flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4">
        {toasts.map(toast => (
          <div key={toast.id} className={`pointer-events-auto px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-slide-down backdrop-blur-md ${toast.type === 'error' ? 'bg-red-500/90 text-white' : toast.type === 'success' ? 'bg-green-500/90 text-white' : 'bg-gray-800/90 text-white'}`}>
             <i className={`fas ${toast.type === 'success' ? 'fa-check-circle' : toast.type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}`}></i>
             <span className="text-sm font-bold flex-1">{toast.message}</span>
          </div>
        ))}
      </div>

      {activeTab === 'home' ? renderHome() : renderDownload()}
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);