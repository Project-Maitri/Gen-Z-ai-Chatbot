import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, ThinkingLevel, LiveServerMessage, Modality } from '@google/genai';
import { Send, ArrowUp, Mic, MicOff, Volume2, Square, VolumeX, BrainCircuit, Zap, MessageSquare, Info, Loader2, Users, Settings2, Play, Pause, Copy, Check, Globe, Share2, AudioLines, X, Bookmark, Pin, Edit2, Trash2, MoreVertical, Menu, MonitorUp, MonitorOff, Image as ImageIcon, Plus, Bot, Sparkles, Flame, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { motion, AnimatePresence, useMotionValue, animate } from 'motion/react';
import html2canvas from 'html2canvas';

// Global error suppression for Google/SDK errors to prevent platform toasts
// We define this at the top level to catch errors as early as possible
let globalSetError: ((msg: string | null) => void) | null = null;

const isSuppressedError = (msg: string) => {
  const lowerMsg = String(msg).toLowerCase();
  return lowerMsg.includes('quota') || 
         lowerMsg.includes('429') || 
         lowerMsg.includes('503') ||
         lowerMsg.includes('service unavailable') ||
         lowerMsg.includes('resource_exhausted') ||
         lowerMsg.includes('limit') ||
         lowerMsg.includes('exceeded') ||
         lowerMsg.includes('safety') ||
         lowerMsg.includes('blocked') ||
         lowerMsg.includes('gemini') ||
         lowerMsg.includes('google') ||
         lowerMsg.includes('model output error') ||
         lowerMsg.includes('token limit') ||
         lowerMsg.includes('traffic') ||
         lowerMsg.includes('busy') ||
         lowerMsg.includes('ethereum');
};

const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const msg = args.map(arg => {
    try {
      if (arg instanceof Error) return arg.message;
      return typeof arg === 'string' ? arg : JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(' ');

  if (isSuppressedError(msg)) {
    if (globalSetError && !msg.includes('ethereum')) globalSetError("Traffic limit exceeded. Please try again later.");
    return; // Suppress the actual console output
  }
  originalConsoleError.apply(console, args);
};

const originalOnError = window.onerror;
window.onerror = (msg, url, line, col, error) => {
  const errorMsg = String(msg);
  if (isSuppressedError(errorMsg)) {
    if (globalSetError && !errorMsg.includes('ethereum')) globalSetError("Traffic limit exceeded. Please try again later.");
    return true; // Suppress
  }
  if (originalOnError) {
    return originalOnError(msg, url, line, col, error);
  }
  return false;
};

window.addEventListener('unhandledrejection', (event) => {
  const reason = (event.reason?.message || String(event.reason));
  if (isSuppressedError(reason)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (globalSetError && !reason.includes('ethereum')) globalSetError("Traffic limit exceeded. Please try again later.");
  }
}, true);

window.addEventListener('error', (event) => {
  if (isSuppressedError(event.message)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (globalSetError && !event.message.includes('ethereum')) globalSetError("Traffic limit exceeded. Please try again later.");
  }
}, true);

// Helper to convert raw PCM16 base64 to WAV base64
const createWavFromPcmBase64 = (base64Pcm: string, sampleRate: number = 24000): string => {
  try {
    const binaryString = atob(base64Pcm);
    const pcmLength = binaryString.length;
    const wavLength = 44 + pcmLength;
    const buffer = new ArrayBuffer(wavLength);
    const view = new DataView(buffer);

    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmLength, true); // ChunkSize
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, 1, true); // NumChannels (1 channel)
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
    view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
    view.setUint16(34, 16, true); // BitsPerSample

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, pcmLength, true);

    // Write PCM data
    const pcmData = new Uint8Array(buffer, 44);
    for (let i = 0; i < pcmLength; i++) {
      pcmData[i] = binaryString.charCodeAt(i);
    }

    // Convert back to base64 safely
    let wavBinaryString = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000; // 32768
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      // Use Array.from to convert Uint8Array to regular array for apply
      wavBinaryString += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(wavBinaryString);
  } catch (e) {
    console.warn("Error converting PCM to WAV:", e);
    return base64Pcm; // Fallback
  }
};

// Initialize Gemini API safely
let ai: any = null;
const initAI = (key: string | null) => {
  if (key && key !== 'undefined' && key.trim() !== '') {
    try {
      ai = new GoogleGenAI({ apiKey: key });
      console.log("Gemini API initialized successfully.");
    } catch (e) {
      console.error("Failed to initialize Gemini API:", e);
      ai = null;
    }
  } else {
    ai = null;
  }
};

const getApiKey = () => {
  const key = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
  if (!key) {
    console.warn("Gemini API Key is missing in environment variables.");
  } else {
    console.log("Gemini API Key found (length: " + key.length + ")");
  }
  return key;
};

// Safe localStorage helper to prevent crashes in iframes with blocked third-party cookies
const safeStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }
};

// Initial load
try {
  initAI(getApiKey());
} catch (e) {
  console.error("Initial AI setup failed:", e);
}

function highlightMarkdown(text: string, cleanIndex: number) {
  const cleanText = text.replace(/[*_#`]/g, '');
  if (cleanIndex >= cleanText.length) return text;

  // Find the start of the sentence (search backwards for sentence boundaries)
  let sentenceStart = cleanIndex;
  while (sentenceStart > 0 && !/[.?!।\n]/.test(cleanText[sentenceStart - 1])) {
    sentenceStart--;
  }
  
  // Skip leading whitespace of the sentence
  while (sentenceStart < cleanText.length && /\s/.test(cleanText[sentenceStart])) {
    sentenceStart++;
  }
  
  if (sentenceStart >= cleanText.length) return text;

  // Find the end of the current sentence
  let sentenceEnd = cleanIndex;
  while (sentenceEnd < cleanText.length && !/[.?!।\n]/.test(cleanText[sentenceEnd])) {
    sentenceEnd++;
  }
  
  // Include the punctuation mark if present
  if (sentenceEnd < cleanText.length) {
    sentenceEnd++;
  }

  const cleanEndIndex = sentenceEnd;

  let cIndex = 0;
  let originalStartIndex = -1;
  let originalEndIndex = -1;

  for (let i = 0; i <= text.length; i++) {
    const isMarkdownChar = i < text.length && /[*_#`]/.test(text[i]);
    
    if (cIndex === sentenceStart && originalStartIndex === -1 && !isMarkdownChar) {
      originalStartIndex = i;
    }
    
    if (cIndex === cleanEndIndex && originalEndIndex === -1) {
      originalEndIndex = i;
      break;
    }
    
    if (i < text.length && !isMarkdownChar) {
      cIndex++;
    }
  }

  if (originalStartIndex !== -1 && originalEndIndex !== -1) {
    const prefix = originalStartIndex === 0 ? '&#8203;' : '';
    return (
      prefix +
      text.substring(0, originalStartIndex) +
      '<span id="current-spoken-word">' +
      text.substring(originalStartIndex, originalEndIndex) +
      '</span>' +
      text.substring(originalEndIndex)
    );
  }

  return text;
}

const FloatingStopButton = ({ stopAudio, isPlaying, titleText }: { stopAudio: () => void, isPlaying: boolean, titleText: string }) => {
  const [position, setPosition] = useState<{ top: number, right: number } | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const el = document.getElementById('current-spoken-word');
      const container = document.getElementById('chat-messages-container');
      
      if (el && container) {
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Calculate right position relative to viewport
        // We want it just inside the right edge of the chat container
        const rightOffset = document.documentElement.clientWidth - containerRect.right + 16;
        
        // Hide if outside the container's visible area
        if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
          setPosition(null);
        } else {
          setPosition({
            top: rect.top + rect.height / 2,
            right: rightOffset
          });
        }
      } else {
        setPosition(null);
      }
    };

    const interval = setInterval(updatePosition, 50);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isPlaying]);

  if (position === null) return null;

  return (
    <button
      onClick={stopAudio}
      className="fixed z-50 text-red-600 hover:text-red-700 bg-white/90 border border-red-200 hover:bg-white rounded-full p-2.5 shadow-xl transition-all flex items-center justify-center cursor-pointer animate-in fade-in zoom-in duration-200"
      style={{ 
        top: `${position.top}px`, 
        right: `${position.right}px`,
        transform: 'translateY(-50%)'
      }}
      title={titleText}
    >
      <Square size={18} className="fill-current" />
    </button>
  );
};

import { SYSTEM_INSTRUCTION } from './systemInstruction';

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: { data: string, mimeType: string };
};

type SavedChat = {
  id: string;
  name: string;
  messages: Message[];
  timestamp: number;
  isPinned?: boolean;
};

const translations: Record<string, any> = {
  en: {
    title: "Nard",
    subtitle: "AI Messenger, E-MAITRI.",
    you: "You",
    copy: "Copy",
    copied: "Copied",
    listen: "Listen",
    stop: "Stop",
    back: "Back",
    listenAgain: "Listen again",
    speaking: "Nard is speaking...",
    listening: "Nard is listening...",
    thinking: "is thinking...",
    liveChatOn: "Live Voice Chat is on: Please speak",
    stopVoiceChat: "Stop Voice Chat",
    startVoiceChat: "Start Live Voice Chat",
    voiceTyping: "Voice Typing",
    stopVoiceTyping: "Stop Voice Typing",
    speechNotSupported: "Speech recognition is not supported in this browser.",
    liveChat: "Live Chat",
    typeMessage: "Type a message or use the mic! Talk directly to Nard using the last voice chat button!",
    typeMessages: [
      "Type your message here",
      "Send message by speaking into the mic",
      "Live chat with the pink voice chat button"
    ],
    userNameLabel: "Bot Name",
    userNamePlaceholder: "Enter bot's name",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "Settings",
    language: "Language",
    speechRate: "Speech Rate",
    adjustRate: "Adjust voice speed",
    speechPitch: "Speech Pitch",
    adjustPitch: "Adjust voice pitch",
    q1: "What is Digital Governance?",
    q2: "Explain the three-tier structure.",
    q3: "How does Booth Management work?",
    q4: "What is Family Alliance Movement?",
    initialMessage: "Hello Gen-Z! Welcome to the E-Maitri portal! Tell me friend, how can I help you? What information do you need?",
    initialMessageWithName: "Hello Gen-Z!🙏 I am {botName}! Welcome to the E-Maitri portal!✨ How can I help you! What information do you need?👋",
    errorTraffic: "Sorry, there is too much traffic right now or the quota is exhausted. Please try again later.",
    errorTech: "Sorry, a technical issue occurred. Please try again.",
    premiumQuotaExceeded: "Premium voice quota exceeded. Falling back to standard voice.",
    newChat: "New Chat",
    moreOptions: "More Options",
    chattingIn: "Chatting in",
    saveChat: "Save Chat",
    enterChatName: "Enter chat name...",
    cancel: "Cancel",
    save: "Save",
    chatHistory: "Chat History",
    noSavedChats: "No saved chats yet.",
    voiceEngine: "Voice Engine",
    standard: "Standard",
    premium: "Premium",
    clearChatHistory: "Clear Chat History",
    clearAll: "Clear All",
    areYouSureClear: "Are you sure you want to delete all saved chats? This cannot be undone.",
    uploadImage: "Upload Screenshot / Image",
    screenOn: "Screen On",
    screenOff: "Screen Off",
    stopGenerating: "Stop Generating",
    maxChatsError: "You can only save up to 10 chats. Please delete an old chat to save a new one.",
    edit: "Edit",
    share: "Share",
    pinChat: "Pin Chat",
    unpinChat: "Unpin Chat",
    renameChat: "Rename Chat",
    deleteChat: "Delete Chat",
    loading: "Loading...",
    chooseLanguage: "Choose your preferred language",
    chooseVoiceEngine: "Choose between standard and premium AI voices",
    selectPremiumVoice: "Select a high-quality AI voice model",
    selectStandardVoice: "Choose a device voice",
    autoSelect: "Auto-select (Default)",
    fenrirDesc: "Fenrir (Strong, Authoritative Male)",
    charonDesc: "Charon (Calm, Measured Male)",
    puckDesc: "Puck (Friendly, Energetic Male)",
    koreDesc: "Kore (Calm, Measured Female)",
    zephyrDesc: "Zephyr (Strong, Authoritative Female)",
    errorMicPermission: "Microphone permission denied. Please enable it in your browser settings.",
    errorMicNotFound: "No microphone found. Please connect a microphone and try again."
  },
  hi: {
    title: "नॉर्ड",
    subtitle: "एआई मैसेंजर, ई-मैत्री.",
    you: "आप",
    copy: "कॉपी करें",
    copied: "कॉपी किया गया",
    listen: "सुनें",
    stop: "रोकें",
    back: "वापस",
    listenAgain: "फिर से सुनें",
    speaking: "नॉर्ड बोल रहे हैं...",
    listening: "नॉर्ड सुन रहे हैं...",
    thinking: "सोच रहे हैं...",
    liveChatOn: "लाइव वॉइस चैट चालू है: कृपया बोलें",
    stopVoiceChat: "वॉइस चैट बंद करें",
    startVoiceChat: "लाइव वॉइस चैट शुरू करें",
    voiceTyping: "बोलकर टाइप करें",
    stopVoiceTyping: "बोलना बंद करें",
    speechNotSupported: "आपके ब्राउज़र में स्पीच रिकग्निशन सपोर्ट नहीं है।",
    liveChat: "लाइव चैट",
    typeMessage: "संदेश टाइप करें या माइक से बोलकर टाइप करें! आप आखिरी वाइस चैट बटन से नॉर्ड से सीधी बातचीत करें!",
    typeMessages: [
      "यहां अपना संदेश टाइप करें",
      "माइक से बोलकर संदेश भेजें",
      "गुलाबी वायस चैट बटन से लाइव चैट करें"
    ],
    userNameLabel: "बॉट का नाम",
    userNamePlaceholder: "बॉट का नाम दर्ज करें",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "सेटिंग्स",
    language: "भाषा (Language)",
    speechRate: "भाषण दर",
    adjustRate: "आवाज की गति समायोजित करें",
    speechPitch: "भाषण पिच",
    adjustPitch: "आवाज की पिच समायोजित करें",
    q1: "डिजिटल गवर्नेंस क्या है?",
    q2: "त्रि-स्तरीय संरचना को समझाएं।",
    q3: "बूथ प्रबंधन कैसे काम करता है?",
    q4: "पारिवारिक गठबंधन आंदोलन क्या है?",
    initialMessage: "नमस्ते जेन-जी! ई-मैत्री पोर्टल में आपका स्वागत है! बताइए मित्र मैं आपको किस तरह से सहयोग कर सकता हूं? आपको क्या जानकारी चाहिए?",
    initialMessageWithName: "नमस्ते जेन-जी!🙏 मैं {botName} हूं! ई-मैत्री पोर्टल में आपका स्वागत है!✨ मैं आपको किस तरह से सहयोग कर सकता हूं! आपको क्या जानकारी चाहिए?👋",
    errorTraffic: "क्षमा करें, अभी अधिक ट्रैफिक है या कोटा समाप्त हो गया है। कृपया कुछ समय बाद पुनः प्रयास करें।",
    errorTech: "क्षमा करें, एक तकनीकी त्रुटि हुई। कृपया पुनः प्रयास करें।",
    premiumQuotaExceeded: "प्रीमियम वॉइस कोटा समाप्त हो गया है। मानक वॉइस पर स्विच किया जा रहा है।",
    newChat: "नई चैट",
    moreOptions: "और विकल्प",
    chattingIn: "चैटिंग इन",
    saveChat: "चैट सेव करें",
    enterChatName: "चैट का नाम दर्ज करें...",
    cancel: "रद्द करें",
    save: "सेव करें",
    chatHistory: "चैट हिस्ट्री",
    noSavedChats: "अभी तक कोई सेव की गई चैट नहीं है।",
    voiceEngine: "वॉइस इंजन",
    standard: "मानक",
    premium: "प्रीमियम",
    clearChatHistory: "चैट हिस्ट्री साफ़ करें",
    clearAll: "सभी साफ़ करें",
    areYouSureClear: "क्या आप वाकई सभी सेव की गई चैट हटाना चाहते हैं? इसे वापस नहीं लाया जा सकता।",
    uploadImage: "स्क्रीनशॉट / इमेज अपलोड करें",
    screenOn: "स्क्रीन ऑन",
    screenOff: "स्क्रीन ऑफ",
    stopGenerating: "जनरेट करना बंद करें",
    maxChatsError: "आप केवल 10 चैट ही सेव कर सकते हैं। कृपया नई चैट सेव करने के लिए पुरानी चैट डिलीट करें।",
    edit: "संपादित करें",
    share: "शेयर करें",
    pinChat: "चैट पिन करें",
    unpinChat: "चैट अनपिन करें",
    renameChat: "चैट का नाम बदलें",
    deleteChat: "चैट डिलीट करें",
    loading: "लोड हो रहा है...",
    chooseLanguage: "अपनी पसंदीदा भाषा चुनें",
    chooseVoiceEngine: "मानक और प्रीमियम एआई आवाज़ों के बीच चुनें",
    selectPremiumVoice: "एक उच्च गुणवत्ता वाला एआई वॉयस मॉडल चुनें",
    selectStandardVoice: "डिवाइस की आवाज़ चुनें",
    autoSelect: "स्वतः चुनें (डिफ़ॉल्ट)",
    fenrirDesc: "फेनरिर (मजबूत, आधिकारिक पुरुष)",
    charonDesc: "कैरन (शांत, नपा-तुला पुरुष)",
    puckDesc: "पक (दोस्ताना, ऊर्जावान पुरुष)",
    koreDesc: "कोरे (शांत, नपा-तुला महिला)",
    zephyrDesc: "ज़ेफिर (मजबूत, आधिकारिक महिला)",
    errorMicPermission: "माइक्रोफ़ोन की अनुमति नहीं मिली। कृपया अपने ब्राउज़र सेटिंग्स में इसे सक्षम करें।",
    errorMicNotFound: "कोई माइक्रोफ़ोन नहीं मिला। कृपया माइक्रोफ़ोन कनेक्ट करें और पुनः प्रयास करें।"
  },
  bho: {
    title: "नॉर्ड",
    subtitle: "एआई मैसेंजर, ई-मैत्री.",
    you: "रउआ",
    copy: "कॉपी करीं",
    copied: "कॉपी हो गइल",
    listen: "सुनीं",
    stop: "रोकीं",
    back: "पाछे",
    listenAgain: "फेरु से सुनीं",
    speaking: "नॉर्ड बोल रहल बाड़े...",
    listening: "नॉर्ड सुन रहल बाड़े...",
    thinking: "सोच रहल बाड़े...",
    liveChatOn: "लाइव वॉइस चैट चालू बा: कृपया बोलीं",
    stopVoiceChat: "वॉइस चैट बंद करीं",
    startVoiceChat: "लाइव वॉइस चैट शुरू करीं",
    voiceTyping: "बोल के टाइप करीं",
    stopVoiceTyping: "बोलल बंद करीं",
    speechNotSupported: "रउआ ब्राउज़र में स्पीच रिकग्निशन सपोर्ट नइखे।",
    liveChat: "लाइव चैट",
    typeMessage: "संदेश टाइप करीं...",
    typeMessages: [
      "इहाँ आपन संदेस टाइप करीं",
      "माइक से बोल के संदेस भेजीं",
      "गुलाबी वायस चैट बटन से लाइव चैट करीं"
    ],
    userNameLabel: "बॉट के नाम",
    userNamePlaceholder: "बॉट के नाम दर्ज करीं",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "सेटिंग्स",
    language: "भाषा (Language)",
    speechRate: "बोले के रफ्तार",
    adjustRate: "आवाज के रफ्तार सेट करीं",
    speechPitch: "बोले के पिच",
    adjustPitch: "आवाज के पिच सेट करीं",
    q1: "डिजिटल गवर्नेंस का ह?",
    q2: "त्रि-स्तरीय संरचना के समझाईं।",
    q3: "बूथ मैनेजमेंट कइसे काम करेला?",
    q4: "पारिवारिक गठबंधन आंदोलन का ह?",
    initialMessage: "नमस्ते जेन-जी! ई-मैत्री पोर्टल में रउआ सभे के स्वागत बा! बताईं दोस्त, हम रउआ के कइसे मदद कर सकीले? रउआ के का जानकारी चाहीं?",
    initialMessageWithName: "नमस्ते जेन-जी!🙏 हम {botName} हईं! ई-मैत्री पोर्टल में रउआ सभे के स्वागत बा!✨ बताईं, हम रउआ के कइसे मदद कर सकीले! रउआ के का जानकारी चाहीं?👋",
    errorTraffic: "माफ करीं, अभी बहुत ट्रैफिक बा या कोटा खतम हो गइल बा। कृपया कुछ देर बाद फेरु से कोशिश करीं।",
    errorTech: "माफ करीं, एगो तकनीकी दिक्कत आ गइल बा। कृपया फेरु से कोशिश करीं।",
    premiumQuotaExceeded: "प्रीमियम वॉइस कोटा खतम हो गइल बा। स्टैंडर्ड वॉइस पर स्विच हो रहल बा।",
    newChat: "नया चैट",
    moreOptions: "अउरी विकल्प",
    chattingIn: "चैटिंग इन",
    saveChat: "चैट सेव करीं",
    enterChatName: "चैट के नाम डालीं...",
    cancel: "रद्द करीं",
    save: "सेव करीं",
    chatHistory: "चैट हिस्ट्री",
    noSavedChats: "अभी ले कवनो सेव कइल चैट नइखे।",
    voiceEngine: "वॉइस इंजन",
    standard: "स्टैंडर्ड",
    premium: "प्रीमियम",
    clearChatHistory: "चैट हिस्ट्री साफ करीं",
    clearAll: "सब साफ करीं",
    areYouSureClear: "का रउआ सचमुच सभे सेव कइल चैट हटावल चाहत बानी? एकरा वापस ना लावल जा सकेला।",
    uploadImage: "स्क्रीनशॉट / इमेज अपलोड करीं",
    screenOn: "स्क्रीन ऑन",
    screenOff: "स्क्रीन ऑफ",
    stopGenerating: "जनरेट कइल बंद करीं",
    maxChatsError: "रउआ खाली 10 गो चैट सेव कर सकत बानी। नया चैट सेव करे खातिर पुरान चैट डिलीट करीं।",
    edit: "संपादित करीं",
    share: "शेयर करीं",
    pinChat: "चैट पिन करीं",
    unpinChat: "चैट अनपिन करीं",
    renameChat: "चैट के नाम बदलीं",
    deleteChat: "चैट डिलीट करीं",
    loading: "लोड हो रहल बा...",
    chooseLanguage: "आपन पसंदीदा भाषा चुनीं",
    chooseVoiceEngine: "मानक आ प्रीमियम एआई आवाज के बीच चुनीं",
    selectPremiumVoice: "एगो उच्च गुणवत्ता वाला एआई वॉयस मॉडल चुनीं",
    selectStandardVoice: "डिवाइस के आवाज चुनीं",
    autoSelect: "अपने आप चुनीं (डिफ़ॉल्ट)",
    fenrirDesc: "फेनरिर (मजबूत, आधिकारिक पुरुष)",
    charonDesc: "कैरन (शांत, नपा-तुला पुरुष)",
    puckDesc: "पक (दोस्ताना, ऊर्जावान पुरुष)"
  },
  bn: {
    title: "নর্ড",
    subtitle: "এআই মেসেঞ্জার, ই-মৈত্রী.",
    you: "আপনি",
    copy: "কপি করুন",
    copied: "কপি করা হয়েছে",
    listen: "শুনুন",
    stop: "থামান",
    back: "ফিরে যান",
    listenAgain: "আবার শুনুন",
    speaking: "নর্ড কথা বলছে...",
    listening: "নর্ড শুনছে...",
    thinking: "চিন্তা করছে...",
    liveChatOn: "লাইভ ভয়েস চ্যাট চালু আছে: দয়া করে কথা বলুন",
    stopVoiceChat: "ভয়েস চ্যাট বন্ধ করুন",
    startVoiceChat: "লাইভ ভয়েস চ্যাট শুরু করুন",
    voiceTyping: "ভয়েস টাইপিং",
    stopVoiceTyping: "ভয়েস টাইপিং বন্ধ করুন",
    liveChat: "লাইভ চ্যাট",
    typeMessage: "একটি বার্তা লিখুন...",
    typeMessages: [
      "এখানে আপনার বার্তা টাইপ করুন",
      "মাইকে কথা বলে বার্তা পাঠান",
      "গোলাপি ভয়েস চ্যাট বোতাম দিয়ে লাইভ চ্যাট করুন"
    ],
    userNameLabel: "বটের নাম",
    userNamePlaceholder: "বটের নাম লিখুন",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "সেটিংস",
    language: "ভাষা (Language)",
    speechRate: "কথা বলার গতি",
    adjustRate: "ভয়েস গতি সামঞ্জস্য করুন",
    speechPitch: "কথা বলার পিচ",
    adjustPitch: "ভয়েস পিচ সামঞ্জস্য করুন",
    q1: "ডিজিটাল গভর্নেন্স কি?",
    q2: "ত্রি-স্তরীয় কাঠামো ব্যাখ্যা করুন।",
    q3: "বুথ ম্যানেজমেন্ট কিভাবে কাজ করে?",
    q4: "ফ্যামিলি অ্যালায়েন্স মুভমেন্ট কি?",
    initialMessage: "নমস্কার জেন-জি! ই-মৈত্রী পোর্টালে আপনাকে স্বাগতম! বলুন বন্ধু, আমি আপনাকে কীভাবে সাহায্য করতে পারি? আপনার কী তথ্য দরকার?",
    initialMessageWithName: "নমস্কার জেন-জি!🙏 আমি {botName}! ই-মৈত্রী পোর্টালে আপনাকে স্বাগতম!✨ আমি আপনাকে কীভাবে সাহায্য করতে পারি! আপনার কী তথ্য দরকার?👋",
    errorTraffic: "দুঃখিত, এই মুহূর্তে খুব বেশি ট্রাফিক আছে অথবা কোটা শেষ হয়ে গেছে। দয়া করে কিছুক্ষণ পরে আবার চেষ্টা করুন।",
    errorTech: "দুঃখিত, একটি প্রযুক্তিগত সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।",
    premiumQuotaExceeded: "প্রিমিয়াম ভয়েস কোটা শেষ হয়ে গেছে। স্ট্যান্ডার্ড ভয়েসে ফিরে যাচ্ছে।",
    newChat: "নতুন চ্যাট",
    moreOptions: "আরও বিকল্প",
    chattingIn: "চ্যাটিং ইন",
    saveChat: "চ্যাট সেভ করুন",
    enterChatName: "চ্যাটের নাম লিখুন...",
    cancel: "বাতিল করুন",
    save: "সেভ করুন",
    chatHistory: "চ্যাট হিস্ট্রি",
    noSavedChats: "এখনও কোনো চ্যাট সেভ করা হয়নি।",
    voiceEngine: "ভয়েস ইঞ্জিন",
    standard: "স্ট্যান্ডার্ড",
    premium: "প্রিমিয়াম",
    clearChatHistory: "চ্যাট হিস্ট্রি মুছুন",
    clearAll: "সব মুছুন",
    areYouSureClear: "আপনি কি নিশ্চিত যে আপনি সমস্ত সেভ করা চ্যাট মুছতে চান? এটি পূর্বাবস্থায় ফেরানো যাবে না।",
    uploadImage: "স্ক্রিনশট / ছবি আপলোড করুন",
    screenOn: "স্ক্রিন অন",
    screenOff: "স্ক্রিন অফ",
    stopGenerating: "তৈরি করা বন্ধ করুন",
    maxChatsError: "আপনি শুধুমাত্র 10টি চ্যাট সেভ করতে পারবেন। নতুন চ্যাট সেভ করতে অনুগ্রহ করে একটি পুরানো চ্যাট মুছে ফেলুন।",
    edit: "সম্পাদনা করুন",
    share: "শেয়ার করুন",
    pinChat: "চ্যাট পিন করুন",
    unpinChat: "চ্যাট আনপিন করুন",
    renameChat: "চ্যাটের নাম পরিবর্তন করুন",
    deleteChat: "চ্যাট মুছুন",
    loading: "লোড হচ্ছে...",
    chooseLanguage: "আপনার পছন্দের ভাষা বেছে নিন",
    chooseVoiceEngine: "স্ট্যান্ডার্ড এবং প্রিমিয়াম এআই ভয়েসগুলির মধ্যে বেছে নিন",
    selectPremiumVoice: "একটি উচ্চ-মানের এআই ভয়েস মডেল নির্বাচন করুন",
    selectStandardVoice: "একটি ডিভাইসের ভয়েস বেছে নিন",
    autoSelect: "স্বয়ংক্রিয় নির্বাচন (ডিফল্ট)",
    fenrirDesc: "ফেনরির (শক্তিশালী, প্রামাণিক পুরুষ)",
    charonDesc: "ক্যারন (শান্ত, পরিমাপিত পুরুষ)",
    puckDesc: "পাক (বন্ধুত্বপূর্ণ, উদ্যমী পুরুষ)"
  },
  ta: {
    title: "நார்ட்",
    subtitle: "AI மெசஞ்சர், இ-மைத்ரி.",
    you: "நீங்கள்",
    copy: "நகலெடு",
    copied: "நகலெடுக்கப்பட்டது",
    listen: "கேட்க",
    stop: "நிறுத்து",
    back: "பின்னால்",
    listenAgain: "மீண்டும் கேட்க",
    speaking: "நார்ட் பேசுகிறார்...",
    listening: "நார்ட் கேட்கிறார்...",
    thinking: "யோசிக்கிறார்...",
    liveChatOn: "நேரலை குரல் அரட்டை இயக்கத்தில் உள்ளது: தயவுசெய்து பேசவும்",
    stopVoiceChat: "குரல் அரட்டையை நிறுத்து",
    startVoiceChat: "நேரலை குரல் அரட்டையைத் தொடங்கு",
    voiceTyping: "குரல் தட்டச்சு",
    stopVoiceTyping: "குரல் தட்டச்சு நிறுத்து",
    liveChat: "நேரலை அரட்டை",
    typeMessage: "ஒரு செய்தியை தட்டச்சு செய்யவும்...",
    typeMessages: [
      "உங்கள் செய்தியை இங்கே தட்டச்சு செய்யவும்",
      "மைக்கில் பேசி செய்தியை அனுப்பவும்",
      "இளஞ்சிவப்பு குரல் அரட்டை பொத்தானுடன் நேரலை அரட்டை செய்யவும்"
    ],
    userNameLabel: "பாட் பெயர்",
    userNamePlaceholder: "பாட் பெயரை உள்ளிடவும்",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "அமைப்புகள்",
    language: "மொழி (Language)",
    speechRate: "பேச்சு வேகம்",
    adjustRate: "குரல் வேகத்தை சரிசெய்யவும்",
    speechPitch: "பேச்சு சுருதி",
    adjustPitch: "குரல் சுருதியை சரிசெய்யவும்",
    q1: "டிஜிட்டல் ஆளுமை என்றால் என்ன?",
    q2: "மூன்று அடுக்கு கட்டமைப்பை விளக்குங்கள்.",
    q3: "பூத் மேலாண்மை எவ்வாறு செயல்படுகிறது?",
    q4: "குடும்ப கூட்டணி இயக்கம் என்றால் என்ன?",
    initialMessage: "வணக்கம் ஜென்-ஜி! இ-மைத்ரி போர்ட்டலுக்கு உங்களை வரவேற்கிறேன்! சொல்லுங்கள் நண்பரே, நான் உங்களுக்கு எப்படி உதவ முடியும்? உங்களுக்கு என்ன தகவல் வேண்டும்?",
    initialMessageWithName: "வணக்கம் ஜென்-ஜி!🙏 நான் {botName}! இ-மைத்ரி போர்ட்டலுக்கு உங்களை வரவேற்கிறேன்!✨ நான் உங்களுக்கு எப்படி உதவ முடியும்! உங்களுக்கு என்ன தகவல் வேண்டும்?👋",
    errorTraffic: "மன்னிக்கவும், தற்போது அதிக போக்குவரத்து உள்ளது அல்லது ஒதுக்கீடு தீர்ந்துவிட்டது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.",
    errorTech: "மன்னிக்கவும், ஒரு தொழில்நுட்ப சிக்கல் ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்.",
    premiumQuotaExceeded: "பிரீமியம் குரல் ஒதுக்கீடு முடிந்தது. நிலையான குரலுக்கு மாறுகிறது.",
    newChat: "புதிய அரட்டை",
    moreOptions: "மேலும் விருப்பங்கள்",
    chattingIn: "அரட்டையடிப்பது",
    saveChat: "அரட்டையைச் சேமி",
    enterChatName: "அரட்டை பெயரை உள்ளிடவும்...",
    cancel: "ரத்துசெய்",
    save: "சேமி",
    chatHistory: "அரட்டை வரலாறு",
    noSavedChats: "சேமிக்கப்பட்ட அரட்டைகள் எதுவும் இல்லை.",
    voiceEngine: "குரல் இயந்திரம்",
    standard: "நிலையான",
    premium: "பிரீமியம்",
    clearChatHistory: "அரட்டை வரலாற்றை அழி",
    clearAll: "அனைத்தையும் அழி",
    areYouSureClear: "சேமிக்கப்பட்ட அனைத்து அரட்டைகளையும் நிச்சயமாக அழிக்க வேண்டுமா? இதை செயல்தவிர்க்க முடியாது.",
    uploadImage: "ஸ்கிரீன்ஷாட் / படத்தைப் பதிவேற்றவும்",
    screenOn: "திரை ஆன்",
    screenOff: "திரை ஆஃப்",
    stopGenerating: "உருவாக்குவதை நிறுத்து",
    maxChatsError: "நீங்கள் 10 அரட்டைகள் வரை மட்டுமே சேமிக்க முடியும். புதியதைச் சேமிக்க பழைய அரட்டையை நீக்கவும்.",
    edit: "திருத்து",
    share: "பகிர்",
    pinChat: "அரட்டையை பின் செய்",
    unpinChat: "அரட்டையை அன்பின் செய்",
    renameChat: "அரட்டையின் பெயரை மாற்று",
    deleteChat: "அரட்டையை நீக்கு",
    loading: "ஏற்றுகிறது...",
    chooseLanguage: "உங்களுக்கு விருப்பமான மொழியைத் தேர்ந்தெடுக்கவும்",
    chooseVoiceEngine: "நிலையான மற்றும் பிரீமியம் AI குரல்களுக்கு இடையே தேர்வு செய்யவும்",
    selectPremiumVoice: "உயர்தர AI குரல் மாதிரியைத் தேர்ந்தெடுக்கவும்",
    selectStandardVoice: "சாதனத்தின் குரலைத் தேர்ந்தெடுக்கவும்",
    autoSelect: "தானியங்கு தேர்வு (இயல்புநிலை)",
    fenrirDesc: "ஃபென்ரிர் (வலுவான, அதிகாரபூர்வமான ஆண்)",
    charonDesc: "சரோன் (அமைதியான, அளவிடப்பட்ட ஆண்)",
    puckDesc: "பக் (நட்பான, ஆற்றல்மிக்க ஆண்)"
  },
  te: {
    title: "నార్డ్",
    subtitle: "ఏఐ మెసెంజర్, ఇ-మైత్రి.",
    you: "మీరు",
    copy: "కాపీ చేయండి",
    copied: "కాపీ చేయబడింది",
    listen: "వినండి",
    stop: "ఆపండి",
    back: "వెనుకకు",
    listenAgain: "మళ్ళీ వినండి",
    speaking: "నార్డ్ మాట్లాడుతున్నారు...",
    listening: "నార్డ్ వింటున్నారు...",
    thinking: "ఆలోచిస్తున్నారు...",
    liveChatOn: "లైవ్ వాయిస్ చాట్ ఆన్‌లో ఉంది: దయచేసి మాట్లాడండి",
    stopVoiceChat: "వాయిస్ చాట్‌ను ఆపండి",
    startVoiceChat: "లైవ్ వాయిస్ చాట్ ప్రారంభించండి",
    voiceTyping: "వాయిస్ టైపింగ్",
    stopVoiceTyping: "వాయిస్ టైపింగ్ ఆపండి",
    liveChat: "లైవ్ చాట్",
    typeMessage: "సందేశాన్ని టైప్ చేయండి...",
    typeMessages: [
      "మీ సందేశాన్ని ఇక్కడ టైప్ చేయండి",
      "మైక్‌లో మాట్లాడటం ద్వారా సందేశాన్ని పంపండి",
      "గులాబీ వాయిస్ చాట్ బటన్‌తో లైవ్ చాట్ చేయండి"
    ],
    userNameLabel: "బాట్ పేరు",
    userNamePlaceholder: "బాట్ పేరు నమోదు చేయండి",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "సెట్టింగ్‌లు",
    language: "భాష (Language)",
    speechRate: "మాట్లాడే వేగం",
    adjustRate: "వాయిస్ వేగాన్ని సర్దుబాటు చేయండి",
    speechPitch: "మాట్లాడే పిచ్",
    adjustPitch: "వాయిస్ పిచ్‌ను సర్దుబాటు చేయండి",
    q1: "డిజిటల్ గవర్నెన్స్ అంటే ఏమిటి?",
    q2: "మూడు అంచెల నిర్మాణాన్ని వివరించండి.",
    q3: "బూత్ మేనేజ్‌మెంట్ ఎలా పనిచేస్తుంది?",
    q4: "కుటుంబ కూటమి ఉద్యమం అంటే ఏమిటి?",
    initialMessage: "నమస్తే జెన్-జి! ఇ-మైత్రి పోర్టల్‌కు స్వాగతం! చెప్పండి మిత్రమా, నేను మీకు ఎలా సహాయం చేయగలను? మీకు ఏ సమాచారం కావాలి?",
    initialMessageWithName: "నమస్తే జెన్-జి!🙏 నేను {botName}! ఇ-మైత్రి పోర్టల్‌కు స్వాగతం!✨ నేను మీకు ఎలా సహాయం చేయగలను! మీకు ఏ సమాచారం కావాలి?👋",
    errorTraffic: "క్షమించండి, ప్రస్తుతం ట్రాఫిక్ ఎక్కువగా ఉంది లేదా కోటా ముగిసింది. దయచేసి కొద్దిసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.",
    errorTech: "క్షమించండి, సాంకేతిక సమస్య ఏర్పడింది. దయచేసి మళ్లీ ప్రయత్నించండి.",
    premiumQuotaExceeded: "ప్రీమియం వాయిస్ కోటా ముగిసింది. ప్రామాణిక వాయిస్‌కి మారుతోంది.",
    newChat: "కొత్త చాట్",
    moreOptions: "మరిన్ని ఎంపికలు",
    chattingIn: "చాటింగ్ లో",
    saveChat: "చాట్ సేవ్ చేయండి",
    enterChatName: "చాట్ పేరు నమోదు చేయండి...",
    cancel: "రద్దు చేయండి",
    save: "సేవ్ చేయండి",
    chatHistory: "చాట్ చరిత్ర",
    noSavedChats: "ఇంకా సేవ్ చేసిన చాట్‌లు లేవు.",
    voiceEngine: "వాయిస్ ఇంజిన్",
    standard: "ప్రామాణిక",
    premium: "ప్రీమియం",
    clearChatHistory: "చాట్ చరిత్రను క్లియర్ చేయండి",
    clearAll: "అన్నీ క్లియర్ చేయండి",
    areYouSureClear: "సేవ్ చేసిన అన్ని చాట్‌లను మీరు ఖచ్చితంగా తొలగించాలనుకుంటున్నారా? దీన్ని రద్దు చేయడం సాధ్యం కాదు.",
    uploadImage: "స్క్రీన్‌షాట్ / చిత్రాన్ని అప్‌లోడ్ చేయండి",
    screenOn: "స్క్రీన్ ఆన్",
    screenOff: "స్క్రీన్ ఆఫ్",
    stopGenerating: "సృష్టించడం ఆపండి",
    maxChatsError: "మీరు 10 చాట్‌ల వరకు మాత్రమే సేవ్ చేయగలరు. దయచేసి కొత్తదాన్ని సేవ్ చేయడానికి పాత చాట్‌ను తొలగించండి.",
    edit: "సవరించు",
    share: "భాగస్వామ్యం చేయండి",
    pinChat: "చాట్‌ను పిన్ చేయండి",
    unpinChat: "చాట్‌ను అన్‌పిన్ చేయండి",
    renameChat: "చాట్ పేరు మార్చండి",
    deleteChat: "చాట్‌ను తొలగించండి",
    loading: "లోడ్ అవుతోంది...",
    chooseLanguage: "మీకు ఇష్టమైన భాషను ఎంచుకోండి",
    chooseVoiceEngine: "ప్రామాణిక మరియు ప్రీమియం AI వాయిస్‌ల మధ్య ఎంచుకోండి",
    selectPremiumVoice: "అధిక-నాణ్యత AI వాయిస్ మోడల్‌ను ఎంచుకోండి",
    selectStandardVoice: "పరికరం వాయిస్‌ని ఎంచుకోండి",
    autoSelect: "స్వీయ-ఎంపిక (డిఫాల్ట్)",
    fenrirDesc: "ఫెన్రిర్ (బలమైన, అధికారిక పురుషుడు)",
    charonDesc: "చరోన్ (ప్రశాంతమైన, కొలిచిన పురుషుడు)",
    puckDesc: "పక్ (స్నేహపూర్వక, శక్తివంతమైన పురుషుడు)"
  },
  mr: {
    title: "नॉर्ड",
    subtitle: "एआय मेसेंजर, ई-मैत्री.",
    you: "तुम्ही",
    copy: "कॉपी करा",
    copied: "कॉपी केले",
    listen: "ऐका",
    stop: "थांबवा",
    back: "मागे",
    listenAgain: "पुन्हा ऐका",
    speaking: "नॉर्ड बोलत आहेत...",
    listening: "नॉर्ड ऐकत आहेत...",
    thinking: "विचार करत आहेत...",
    liveChatOn: "लाइव्ह व्हॉइस चॅट चालू आहे: कृपया बोला",
    stopVoiceChat: "व्हॉइस चॅट थांबवा",
    startVoiceChat: "लाइव्ह व्हॉइस चॅट सुरू करा",
    voiceTyping: "व्हॉइस टायपिंग",
    stopVoiceTyping: "व्हॉइस टायपिंग थांबवा",
    liveChat: "लाइव्ह चॅट",
    typeMessage: "संदेश टाइप करा...",
    typeMessages: [
      "तुमचा संदेश येथे टाईप करा",
      "माईकमध्ये बोलून संदेश पाठवा",
      "गुलाबी व्हॉइस चॅट बटणासह लाईव्ह चॅट करा"
    ],
    userNameLabel: "बॉटचे नाव",
    userNamePlaceholder: "बॉटचे नाव प्रविष्ट करा",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "सेटिंग्ज",
    language: "भाषा (Language)",
    speechRate: "बोलण्याचा वेग",
    adjustRate: "आवाजाचा वेग समायोजित करा",
    speechPitch: "बोलण्याचा पिच",
    adjustPitch: "आवाजाचा पिच समायोजित करा",
    q1: "डिजिटल गव्हर्नन्स म्हणजे काय?",
    q2: "त्रि-स्तरीय रचना स्पष्ट करा.",
    q3: "बूथ व्यवस्थापन कसे काम करते?",
    q4: "कौटुंबिक आघाडी चळवळ म्हणजे काय?",
    initialMessage: "नमस्ते जेन-जी! ई-मैत्री पोर्टलवर आपले स्वागत आहे! सांगा मित्रा, मी तुम्हाला कशी मदत करू शकतो? तुम्हाला कोणती माहिती हवी आहे?",
    initialMessageWithName: "नमस्ते जेन-जी!🙏 मी {botName} आहे! ई-मैत्री पोर्टलवर आपले स्वागत आहे!✨ मी तुम्हाला कशी मदत करू शकतो! तुम्हाला कोणती माहिती हवी आहे?👋",
    errorTraffic: "क्षमस्व, सध्या खूप ट्रॅफिक आहे किंवा कोटा संपला आहे. कृपया काही वेळानंतर पुन्हा प्रयत्न करा.",
    errorTech: "क्षमस्व, एक तांत्रिक समस्या आली. कृपया पुन्हा प्रयत्न करा.",
    premiumQuotaExceeded: "प्रीमियम व्हॉइस कोटा संपला आहे. मानक व्हॉइसवर स्विच करत आहे.",
    newChat: "नवीन चॅट",
    moreOptions: "अधिक पर्याय",
    chattingIn: "चॅटिंग इन",
    saveChat: "चॅट सेव्ह करा",
    enterChatName: "चॅटचे नाव प्रविष्ट करा...",
    cancel: "रद्द करा",
    save: "सेव्ह करा",
    chatHistory: "चॅट इतिहास",
    noSavedChats: "अद्याप कोणतेही सेव्ह केलेले चॅट नाहीत.",
    voiceEngine: "व्हॉइस इंजिन",
    standard: "मानक",
    premium: "प्रीमियम",
    clearChatHistory: "चॅट इतिहास साफ करा",
    clearAll: "सर्व साफ करा",
    areYouSureClear: "तुम्हाला खात्री आहे की तुम्हाला सर्व सेव्ह केलेले चॅट हटवायचे आहेत? हे पूर्ववत केले जाऊ शकत नाही.",
    uploadImage: "स्क्रीनशॉट / प्रतिमा अपलोड करा",
    screenOn: "स्क्रीन ऑन",
    screenOff: "स्क्रीन ऑफ",
    stopGenerating: "व्युत्पन्न करणे थांबवा",
    maxChatsError: "तुम्ही फक्त 10 चॅट सेव्ह करू शकता. नवीन सेव्ह करण्यासाठी कृपया जुने चॅट हटवा.",
    edit: "संपादित करा",
    share: "शेअर करा",
    pinChat: "चॅट पिन करा",
    unpinChat: "चॅट अनपिन करा",
    renameChat: "चॅटचे नाव बदला",
    deleteChat: "चॅट हटवा",
    loading: "लोड होत आहे...",
    chooseLanguage: "तुमची पसंतीची भाषा निवडा",
    chooseVoiceEngine: "प्रमाणित आणि प्रीमियम AI आवाजांमधून निवडा",
    selectPremiumVoice: "उच्च-गुणवत्तेचे AI व्हॉइस मॉडेल निवडा",
    selectStandardVoice: "डिव्हाइसचा आवाज निवडा",
    autoSelect: "स्वयं-निवड (डीफॉल्ट)",
    fenrirDesc: "फेनरिर (मजबूत, अधिकृत पुरुष)",
    charonDesc: "कॅरॉन (शांत, मोजलेला पुरुष)",
    puckDesc: "पक (मैत्रीपूर्ण, ऊर्जावान पुरुष)"
  },
  gu: {
    title: "જેન-જી",
    subtitle: "એઆઈ મેસેન્જર, ઈ-મૈત્રી.",
    you: "તમે",
    copy: "કૉપિ કરો",
    copied: "કૉપિ કર્યું",
    listen: "સાંભળો",
    stop: "અટકાવો",
    back: "પાછા",
    listenAgain: "ફરી સાંભળો",
    speaking: "જેન-જી બોલી રહ્યા છે...",
    listening: "જેન-જી સાંભળી રહ્યા છે...",
    thinking: "વિચારી રહ્યા છે...",
    liveChatOn: "લાઇવ વૉઇસ ચેટ ચાલુ છે: કૃપા કરીને બોલો",
    stopVoiceChat: "વૉઇસ ચેટ બંધ કરો",
    startVoiceChat: "લાઇવ વૉઇસ ચેટ શરૂ કરો",
    voiceTyping: "વૉઇસ ટાઇપિંગ",
    stopVoiceTyping: "વૉઇસ ટાઇપિંગ બંધ કરો",
    liveChat: "લાઇવ ચેટ",
    typeMessage: "સંદેશ લખો...",
    typeMessages: [
      "તમારો સંદેશ અહીં ટાઇપ કરો",
      "માઇકમાં બોલીને સંદેશ મોકલો",
      "ગુલાબી વૉઇસ ચેટ બટન સાથે લાઇવ ચેટ કરો"
    ],
    userNameLabel: "બૉટનું નામ",
    userNamePlaceholder: "બૉટનું નામ દાખલ કરો",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "સેટિંગ્સ",
    language: "ભાષા (Language)",
    speechRate: "બોલવાની ઝડપ",
    adjustRate: "અવાજની ઝડપ ગોઠવો",
    speechPitch: "બોલવાની પિચ",
    adjustPitch: "અવાજની પિચ ગોઠવો",
    q1: "ડિજિટલ ગવર્નન્સ શું છે?",
    q2: "ત્રિ-સ્તરીય માળખું સમજાવો.",
    q3: "બૂથ મેનેજમેન્ટ કેવી રીતે કામ કરે છે?",
    q4: "કૌટુંબિક જોડાણ ચળવળ શું છે?",
    initialMessage: "નમસ્તે જેન-જી! ઈ-મૈત્રી પોર્ટલમાં તમારું સ્વાગત છે! કહો મિત્ર, હું તમને કેવી રીતે મદદ કરી શકું? તમારે કઈ માહિતી જોઈએ છે?",
    initialMessageWithName: "નમસ્તે જેન-જી!🙏 હું {botName} છું! ઈ-મૈત્રી પોર્ટલમાં તમારું સ્વાગત છે!✨ હું તમને કેવી રીતે મદદ કરી શકું! તમારે કઈ માહિતી જોઈએ છે?👋",
    errorTraffic: "માફ કરશો, અત્યારે ઘણો ટ્રાફિક છે અથવા ક્વોટા પૂરો થઈ ગયો છે. કૃપા કરીને થોડા સમય પછી ફરી પ્રયાસ કરો.",
    errorTech: "માફ કરશો, એક તકનીકી સમસ્યા આવી. કૃપા કરીને ફરી પ્રયાસ કરો.",
    premiumQuotaExceeded: "પ્રીમિયમ વૉઇસ ક્વોટા પૂરો થઈ ગયો છે. સ્ટાન્ડર્ડ વૉઇસ પર સ્વિચ કરી રહ્યાં છીએ.",
    newChat: "નવી ચેટ",
    moreOptions: "વધુ વિકલ્પો",
    chattingIn: "ચેટિંગ ઇન",
    saveChat: "ચેટ સેવ કરો",
    enterChatName: "ચેટનું નામ દાખલ કરો...",
    cancel: "રદ કરો",
    save: "સેવ કરો",
    chatHistory: "ચેટ ઇતિહાસ",
    noSavedChats: "હજી સુધી કોઈ સેવ કરેલી ચેટ નથી.",
    voiceEngine: "વૉઇસ એન્જિન",
    standard: "સ્ટાન્ડર્ડ",
    premium: "પ્રીમિયમ",
    clearChatHistory: "ચેટ ઇતિહાસ સાફ કરો",
    clearAll: "બધું સાફ કરો",
    areYouSureClear: "શું તમે ખરેખર બધી સેવ કરેલી ચેટ કાઢી નાખવા માંગો છો? આ પૂર્વવત્ કરી શકાતું નથી.",
    uploadImage: "સ્ક્રીનશોટ / છબી અપલોડ કરો",
    screenOn: "સ્ક્રીન ઓન",
    screenOff: "સ્ક્રીન ઓફ",
    stopGenerating: "જનરેટ કરવાનું બંધ કરો",
    maxChatsError: "તમે ફક્ત 10 ચેટ્સ સુધી સેવ કરી શકો છો. નવી સેવ કરવા માટે કૃપા કરીને જૂની ચેટ કાઢી નાખો.",
    edit: "સંપાદિત કરો",
    share: "શેર કરો",
    pinChat: "ચેટ પિન કરો",
    unpinChat: "ચેટ અનપિન કરો",
    renameChat: "ચેટનું નામ બદલો",
    deleteChat: "ચેટ કાઢી નાખો",
    loading: "લોડ થઈ રહ્યું છે...",
    chooseLanguage: "તમારી પસંદગીની ભાષા પસંદ કરો",
    chooseVoiceEngine: "પ્રમાણભૂત અને પ્રીમિયમ AI અવાજો વચ્ચે પસંદ કરો",
    selectPremiumVoice: "ઉચ્ચ-ગુણવત્તાવાળા AI વૉઇસ મોડલ પસંદ કરો",
    selectStandardVoice: "ઉપકરણનો અવાજ પસંદ કરો",
    autoSelect: "સ્વતઃ-પસંદગી (ડિફૉલ્ટ)",
    fenrirDesc: "ફેનરીર (મજબૂત, અધિકૃત પુરુષ)",
    charonDesc: "કેરોન (શાંત, માપેલ પુરુષ)",
    puckDesc: "પક (મૈત્રીપૂર્ણ, મહેનતુ પુરુષ)"
  },
  kn: {
    title: "ನಾರ್ಡ್",
    subtitle: "ಎಐ ಮೆಸೆಂಜರ್, ಇ-ಮೈತ್ರಿ.",
    you: "ನೀವು",
    copy: "ನಕಲಿಸಿ",
    copied: "ನಕಲಿಸಲಾಗಿದೆ",
    listen: "ಆಲಿಸಿ",
    stop: "ನಿಲ್ಲಿಸಿ",
    back: "ಹಿಂದೆ",
    listenAgain: "ಮತ್ತೆ ಆಲಿಸಿ",
    speaking: "ನಾರ್ಡ್ ಮಾತನಾಡುತ್ತಿದ್ದಾರೆ...",
    listening: "ನಾರ್ಡ್ ಆಲಿಸುತ್ತಿದ್ದಾರೆ...",
    thinking: "ಯೋಚಿಸುತ್ತಿದ್ದಾರೆ...",
    liveChatOn: "ಲೈವ್ ವಾಯ್ಸ್ ಚಾಟ್ ಆನ್ ಆಗಿದೆ: ದಯವಿಟ್ಟು ಮಾತನಾಡಿ",
    stopVoiceChat: "ವಾಯ್ಸ್ ಚಾಟ್ ನಿಲ್ಲಿಸಿ",
    startVoiceChat: "ಲೈವ್ ವಾಯ್ಸ್ ಚಾಟ್ ಪ್ರಾರಂಭಿಸಿ",
    voiceTyping: "ಧ್ವನಿ ಟೈಪಿಂಗ್",
    stopVoiceTyping: "ಧ್ವನಿ ಟೈಪಿಂಗ್ ನಿಲ್ಲಿಸಿ",
    speechNotSupported: "ನಿಮ್ಮ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆ ಬೆಂಬಲಿತವಾಗಿಲ್ಲ.",
    liveChat: "ಲೈವ್ ಚಾಟ್",
    typeMessage: "ಸಂದೇಶವನ್ನು ಟೈಪ್ ಮಾಡಿ...",
    typeMessages: [
      "ನಿಮ್ಮ ಸಂದೇಶವನ್ನು ಇಲ್ಲಿ ಟೈಪ್ ಮಾಡಿ",
      "ಮೈಕ್‌ನಲ್ಲಿ ಮಾತನಾಡುವ ಮೂಲಕ ಸಂದೇಶ ಕಳುಹಿಸಿ",
      "ಗುಲಾಬಿ ಧ್ವನಿ ಚಾಟ್ ಬಟನ್‌ನೊಂದಿಗೆ ಲೈವ್ ಚಾಟ್ ಮಾಡಿ"
    ],
    userNameLabel: "ಬಾಟ್ ಹೆಸರು",
    userNamePlaceholder: "ಬಾಟ್ ಹೆಸರನ್ನು ನಮೂದಿಸಿ",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "ಸೆಟ್ಟಿಂಗ್‌ಗಳು",
    language: "ಭಾಷೆ (Language)",
    speechRate: "ಮಾತಿನ ವೇಗ",
    adjustRate: "ಧ್ವನಿ ವೇಗವನ್ನು ಹೊಂದಿಸಿ",
    speechPitch: "ಮಾತಿನ ಪಿಚ್",
    adjustPitch: "ಧ್ವನಿ ಪಿಚ್ ಅನ್ನು ಹೊಂದಿಸಿ",
    q1: "ಡಿಜಿಟಲ್ ಆಡಳಿತ ಎಂದರೇನು?",
    q2: "ಮೂರು ಹಂತದ ರಚನೆಯನ್ನು ವಿವರಿಸಿ.",
    q3: "ಬೂತ್ ನಿರ್ವಹಣೆ ಹೇಗೆ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ?",
    q4: "ಕುಟುಂಬ ಒಕ್ಕೂಟ ಚಳುವಳಿ ಎಂದರೇನು?",
    initialMessage: "ನಮಸ್ತೆ ಜೆನ್-ಜಿ! ಇ-ಮೈತ್ರಿ ಪೋರ್ಟಲ್‌ಗೆ ಸುಸ್ವಾಗತ! ಹೇಳಿ ಸ್ನೇಹಿತರೆ, ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು? ನಿಮಗೆ ಯಾವ ಮಾಹಿತಿ ಬೇಕು?",
    initialMessageWithName: "ನಮಸ್ತೆ ಜೆನ್-ಜಿ!🙏 ನಾನು {botName}! ಇ-ಮೈತ್ರಿ ಪೋರ್ಟಲ್‌ಗೆ ಸುಸ್ವಾಗತ!✨ ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು! ನಿಮಗೆ ಯಾವ ಮಾಹಿತಿ ಬೇಕು?👋",
    errorTraffic: "ಕ್ಷಮಿಸಿ, ಪ್ರಸ್ತುತ ಹೆಚ್ಚಿನ ಟ್ರಾಫಿಕ್ ಇದೆ ಅಥವಾ ಕೋಟಾ ಮುಗಿದಿದೆ. ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    errorTech: "ಕ್ಷಮಿಸಿ, ತಾಂತ್ರಿಕ ಸಮಸ್ಯೆ ಉಂಟಾಗಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    premiumQuotaExceeded: "ಪ್ರೀಮಿಯಂ ಧ್ವನಿ ಕೋಟಾ ಮುಗಿದಿದೆ. ಪ್ರಮಾಣಿತ ಧ್ವನಿಗೆ ಬದಲಾಯಿಸಲಾಗುತ್ತಿದೆ.",
    newChat: "ಹೊಸ ಚಾಟ್",
    moreOptions: "ಹೆಚ್ಚಿನ ಆಯ್ಕೆಗಳು",
    chattingIn: "ಚಾಟಿಂಗ್ ಇನ್",
    saveChat: "ಚಾಟ್ ಉಳಿಸಿ",
    enterChatName: "ಚಾಟ್ ಹೆಸರನ್ನು ನಮೂದಿಸಿ...",
    cancel: "ರದ್ದುಗೊಳಿಸಿ",
    save: "ಉಳಿಸಿ",
    chatHistory: "ಚಾಟ್ ಇತಿಹಾಸ",
    noSavedChats: "ಇನ್ನೂ ಯಾವುದೇ ಉಳಿಸಿದ ಚಾಟ್‌ಗಳಿಲ್ಲ.",
    voiceEngine: "ಧ್ವನಿ ಎಂಜಿನ್",
    standard: "ಪ್ರಮಾಣಿತ",
    premium: "ಪ್ರೀಮಿಯಂ",
    clearChatHistory: "ಚಾಟ್ ಇತಿಹಾಸವನ್ನು ತೆರವುಗೊಳಿಸಿ",
    clearAll: "ಎಲ್ಲವನ್ನೂ ತೆರವುಗೊಳಿಸಿ",
    areYouSureClear: "ನೀವು ಖಂಡಿತವಾಗಿಯೂ ಎಲ್ಲಾ ಉಳಿಸಿದ ಚಾಟ್‌ಗಳನ್ನು ಅಳಿಸಲು ಬಯಸುವಿರಾ? ಇದನ್ನು ರದ್ದುಗೊಳಿಸಲಾಗುವುದಿಲ್ಲ.",
    uploadImage: "ಸ್ಕ್ರೀನ್‌ಶಾಟ್ / ಚಿತ್ರವನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
    screenOn: "ಸ್ಕ್ರೀನ್ ಆನ್",
    screenOff: "ಸ್ಕ್ರೀನ್ ಆಫ್",
    stopGenerating: "ರಚಿಸುವುದನ್ನು ನಿಲ್ಲಿಸಿ",
    maxChatsError: "ನೀವು 10 ಚಾಟ್‌ಗಳವರೆಗೆ ಮಾತ್ರ ಉಳಿಸಬಹುದು. ಹೊಸದನ್ನು ಉಳಿಸಲು ದಯವಿಟ್ಟು ಹಳೆಯ ಚಾಟ್ ಅನ್ನು ಅಳಿಸಿ.",
    edit: "ಸಂಪಾದಿಸಿ",
    share: "ಹಂಚಿಕೊಳ್ಳಿ",
    pinChat: "ಚಾಟ್ ಪಿನ್ ಮಾಡಿ",
    unpinChat: "ಚಾಟ್ ಅನ್‌ಪಿನ್ ಮಾಡಿ",
    renameChat: "ಚಾಟ್ ಹೆಸರು ಬದಲಾಯಿಸಿ",
    deleteChat: "ಚಾಟ್ ಅಳಿಸಿ",
    loading: "ಲೋಡ್ ಆಗುತ್ತಿದೆ...",
    chooseLanguage: "ನಿಮ್ಮ ಆದ್ಯತೆಯ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ",
    chooseVoiceEngine: "ಪ್ರಮಾಣಿತ ಮತ್ತು ಪ್ರೀಮಿಯಂ AI ಧ್ವನಿಗಳ ನಡುವೆ ಆಯ್ಕೆಮಾಡಿ",
    selectPremiumVoice: "ಉತ್ತಮ ಗುಣಮಟ್ಟದ AI ಧ್ವನಿ ಮಾದರಿಯನ್ನು ಆಯ್ಕೆಮಾಡಿ",
    selectStandardVoice: "ಸಾಧನದ ಧ್ವನಿಯನ್ನು ಆಯ್ಕೆಮಾಡಿ",
    autoSelect: "ಸ್ವಯಂ-ಆಯ್ಕೆ (ಡೀಫಾಲ್ಟ್)",
    fenrirDesc: "ಫೆನ್ರಿರ್ (ಬಲವಾದ, ಅಧಿಕೃತ ಪುರುಷ)",
    charonDesc: "ಚರಾನ್ (ಶಾಂತ, ಅಳತೆಯ ಪುರುಷ)",
    puckDesc: "ಪಕ್ (ಸ್ನೇಹಪರ, ಶಕ್ತಿಯುತ ಪುರುಷ)"
  },
  ml: {
    title: "ജെൻ-ജി",
    subtitle: "എഐ മെസഞ്ചർ, ഇ-മൈത്രി.",
    you: "നിങ്ങൾ",
    copy: "പകർത്തുക",
    copied: "പകർത്തി",
    listen: "കേൾക്കുക",
    stop: "നിർത്തുക",
    back: "തിരികെ",
    listenAgain: "വീണ്ടും കേൾക്കുക",
    speaking: "ജെൻ-ജി സംസാരിക്കുന്നു...",
    listening: "ജെൻ-ജി കേൾക്കുന്നു...",
    thinking: "ചിന്തിക്കുന്നു...",
    liveChatOn: "ലൈവ് വോയ്‌സ് ചാറ്റ് ഓണാണ്: ദയവായി സംസാരിക്കുക",
    stopVoiceChat: "വോയ്‌സ് ചാറ്റ് നിർത്തുക",
    startVoiceChat: "ലൈവ് വോയ്‌സ് ചാറ്റ് ആരംഭിക്കുക",
    voiceTyping: "വോയ്‌സ് ടൈപ്പിംഗ്",
    stopVoiceTyping: "വോയ്‌സ് ടൈപ്പിംഗ് നിർത്തുക",
    speechNotSupported: "നിങ്ങളുടെ ബ്രൗസറിൽ സ്പീച്ച് റെക്കഗ്നിഷൻ പിന്തുണയ്ക്കുന്നില്ല.",
    liveChat: "ലൈവ് ചാറ്റ്",
    typeMessage: "ഒരു സന്ദേശം ടൈപ്പ് ചെയ്യുക...",
    typeMessages: [
      "നിങ്ങളുടെ സന്ദേശം ഇവിടെ ടൈപ്പ് ചെയ്യുക",
      "മൈക്കിലൂടെ സംസാരിച്ച് സന്ദേശം അയക്കുക",
      "പിങ്ക് വോയ്‌സ് ചാറ്റ് ബട്ടൺ ഉപയോഗിച്ച് ലൈവ് ചാറ്റ് ചെയ്യുക"
    ],
    userNameLabel: "ബോട്ടിന്റെ പേര്",
    userNamePlaceholder: "ബോട്ടിന്റെ പേര് നൽകുക",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "ക്രമീകരണങ്ങൾ",
    language: "ഭാഷ (Language)",
    speechRate: "സംസാര വേഗത",
    adjustRate: "ശബ്ദ വേഗത ക്രമീകരിക്കുക",
    speechPitch: "സംസാര പിച്ച്",
    adjustPitch: "ശബ്ദ പിച്ച് ക്രമീകരിക്കുക",
    q1: "ഡിജിറ്റൽ ഗവേണൻസ് എന്നാൽ എന്ത്?",
    q2: "ത്രിതല ഘടന വിശദീകരിക്കുക.",
    q3: "ബൂത്ത് മാനേജ്മെന്റ് എങ്ങനെ പ്രവർത്തിക്കുന്നു?",
    q4: "കുടുംബ സഖ്യ പ്രസ്ഥാനം എന്നാൽ എന്ത്?",
    initialMessage: "നമസ്കാരം ജെൻ-ജി! ഇ-മൈത്രി പോർട്ടലിലേക്ക് സ്വാഗതം! പറയൂ സുഹൃത്തേ, ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കണം? നിങ്ങൾക്ക് എന്ത് വിവരമാണ് വേണ്ടത്?",
    initialMessageWithName: "നമസ്കാരം ജെൻ-ജി!🙏 ഞാൻ {botName} ആണ്! ഇ-മൈത്രി പോർട്ടലിലേക്ക് സ്വാഗതം!✨ ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കണം! നിങ്ങൾക്ക് എന്ത് വിവരമാണ് വേണ്ടത്?👋",
    errorTraffic: "ക്ഷമിക്കണം, ഇപ്പോൾ തിരക്ക് കൂടുതലാണ് അല്ലെങ്കിൽ ക്വാട്ട കഴിഞ്ഞു. ദയവായി കുറച്ച് കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക.",
    errorTech: "ക്ഷമിക്കണം, ഒരു സാങ്കേതിക പ്രശ്നം ഉണ്ടായി. ദയവായി വീണ്ടും ശ്രമിക്കുക.",
    premiumQuotaExceeded: "പ്രീമിയം വോയ്‌സ് ക്വാട്ട കഴിഞ്ഞു. സ്റ്റാൻഡേർഡ് വോയ്‌സിലേക്ക് മാറുന്നു.",
    newChat: "പുതിയ ചാറ്റ്",
    moreOptions: "കൂടുതൽ ഓപ്ഷനുകൾ",
    chattingIn: "ചാറ്റിംഗ് ഇൻ",
    saveChat: "ചാറ്റ് സേവ് ചെയ്യുക",
    enterChatName: "ചാറ്റിന്റെ പേര് നൽകുക...",
    cancel: "റദ്ദാക്കുക",
    save: "സേവ് ചെയ്യുക",
    chatHistory: "ചാറ്റ് ചരിത്രം",
    noSavedChats: "സേവ് ചെയ്ത ചാറ്റുകളൊന്നുമില്ല.",
    voiceEngine: "വോയ്‌സ് എഞ്ചിൻ",
    standard: "സ്റ്റാൻഡേർഡ്",
    premium: "പ്രീമിയം",
    clearChatHistory: "ചാറ്റ് ചരിത്രം മായ്ക്കുക",
    clearAll: "എല്ലാം മായ്ക്കുക",
    areYouSureClear: "സേവ് ചെയ്ത എല്ലാ ചാറ്റുകളും ഇല്ലാതാക്കണമെന്ന് നിങ്ങൾക്ക് ഉറപ്പാണോ? ഇത് പഴയപടിയാക്കാനാകില്ല.",
    uploadImage: "സ്ക്രീൻഷോട്ട് / ചിത്രം അപ്‌ലോഡ് ചെയ്യുക",
    screenOn: "സ്ക്രീൻ ഓൺ",
    screenOff: "സ്ക്രീൻ ഓഫ്",
    stopGenerating: "സൃഷ്ടിക്കുന്നത് നിർത്തുക",
    maxChatsError: "നിങ്ങൾക്ക് 10 ചാറ്റുകൾ വരെ മാത്രമേ സേവ് ചെയ്യാനാകൂ. പുതിയൊരെണ്ണം സേവ് ചെയ്യാൻ ദയവായി പഴയ ചാറ്റ് ഇല്ലാതാക്കുക.",
    edit: "എഡിറ്റ് ചെയ്യുക",
    share: "പങ്കിടുക",
    pinChat: "ചാറ്റ് പിൻ ചെയ്യുക",
    unpinChat: "ചാറ്റ് അൺപിൻ ചെയ്യുക",
    renameChat: "ചാറ്റിന്റെ പേര് മാറ്റുക",
    deleteChat: "ചാറ്റ് ഇല്ലാതാക്കുക",
    loading: "ലോഡുചെയ്യുന്നു...",
    chooseLanguage: "നിങ്ങൾക്ക് ഇഷ്ടമുള്ള ഭാഷ തിരഞ്ഞെടുക്കുക",
    chooseVoiceEngine: "സ്റ്റാൻഡേർഡ്, പ്രീമിയം AI ശബ്ദങ്ങൾക്കിടയിൽ തിരഞ്ഞെടുക്കുക",
    selectPremiumVoice: "ഉയർന്ന നിലവാരമുള്ള ഒരു AI വോയ്‌സ് മോഡൽ തിരഞ്ഞെടുക്കുക",
    selectStandardVoice: "ഒരു ഉപകരണ ശബ്ദം തിരഞ്ഞെടുക്കുക",
    autoSelect: "സ്വയം തിരഞ്ഞെടുക്കുക (ഡിഫോൾട്ട്)",
    fenrirDesc: "ഫെൻറിർ (ശക്തനായ, ആധികാരികനായ പുരുഷൻ)",
    charonDesc: "ചാരോൺ (ശാന്തനായ, അളന്ന പുരുഷൻ)",
    puckDesc: "പക്ക് (സൗഹൃദമുള്ള, ഊർജ്ജസ്വലനായ പുരുഷൻ)"
  },
  or: {
    title: "ନର୍ଡ",
    subtitle: "ଏଆଇ ମେସେଞ୍ଜର, ଇ-ମୈତ୍ରୀ.",
    you: "ଆପଣ",
    copy: "କପି କରନ୍ତୁ",
    copied: "କପି ହୋଇଛି",
    listen: "ଶୁଣନ୍ତୁ",
    stop: "ବନ୍ଦ କରନ୍ତୁ",
    back: "ପଛକୁ",
    listenAgain: "ପୁଣି ଶୁଣନ୍ତୁ",
    speaking: "ନର୍ଡ କହୁଛନ୍ତି...",
    listening: "ନର୍ଡ ଶୁଣୁଛନ୍ତି...",
    thinking: "ଭାବୁଛନ୍ତି...",
    liveChatOn: "ଲାଇଭ୍ ଭଏସ୍ ଚାଟ୍ ଅନ୍ ଅଛି: ଦୟାକରି କୁହନ୍ତୁ",
    stopVoiceChat: "ଭଏସ୍ ଚାଟ୍ ବନ୍ଦ କରନ୍ତୁ",
    startVoiceChat: "ଲାଇଭ୍ ଭଏସ୍ ଚାଟ୍ ଆରମ୍ଭ କରନ୍ତୁ",
    voiceTyping: "ଭଏସ୍ ଟାଇପିଂ",
    stopVoiceTyping: "ଭଏସ୍ ଟାଇପିଂ ବନ୍ଦ କରନ୍ତୁ",
    speechNotSupported: "ଆପଣଙ୍କ ବ୍ରାଉଜରରେ ସ୍ପିଚ୍ ରେକଗ୍ନିସନ୍ ସପୋର୍ଟ କରେ ନାହିଁ।",
    liveChat: "ଲାଇଭ୍ ଚାଟ୍",
    typeMessage: "ଏକ ମେସେଜ୍ ଟାଇପ୍ କରନ୍ତୁ...",
    typeMessages: [
      "ଆପଣଙ୍କର ବାର୍ତ୍ତା ଏଠାରେ ଟାଇପ୍ କରନ୍ତୁ",
      "ମାଇକ୍ ରେ କହି ବାର୍ତ୍ତା ପଠାନ୍ତୁ",
      "ଗୋଲାପୀ ଭଏସ୍ ଚାଟ୍ ବଟନ୍ ସହିତ ଲାଇଭ୍ ଚାଟ୍ କରନ୍ତୁ"
    ],
    userNameLabel: "ବଟ୍ ନାମ",
    userNamePlaceholder: "ବଟ୍ ନାମ ଦିଅନ୍ତୁ",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "ସେଟିଂସ୍",
    language: "ଭାଷା (Language)",
    speechRate: "କଥାବାର୍ତ୍ତା ବେଗ",
    adjustRate: "ସ୍ୱରର ବେଗ ଆଡଜଷ୍ଟ କରନ୍ତୁ",
    speechPitch: "କଥାବାର୍ତ୍ତା ପିଚ୍",
    adjustPitch: "ସ୍ୱରର ପିଚ୍ ଆଡଜଷ୍ଟ କରନ୍ତୁ",
    q1: "ଡିଜିଟାଲ୍ ଗଭର୍ଣ୍ଣାନ୍ସ କ'ଣ?",
    q2: "ତ୍ରିସ୍ତରୀୟ ସଂରଚନା ବର୍ଣ୍ଣନା କରନ୍ତୁ।",
    q3: "ବୁଥ୍ ମ୍ୟାନେଜମେଣ୍ଟ କିପରି କାମ କରେ?",
    q4: "ପାରିବାରିକ ମେଣ୍ଟ ଆନ୍ଦୋଳନ କ'ଣ?",
    initialMessage: "ନମସ୍ତେ ଜେନ୍-ଜି! ଇ-ମୈତ୍ରୀ ପୋର୍ଟାଲକୁ ସ୍ୱାଗତ! କୁହନ୍ତୁ ବନ୍ଧୁ, ମୁଁ ଆପଣଙ୍କୁ କିପରି ସାହାଯ୍ୟ କରିପାରିବି? ଆପଣଙ୍କୁ କେଉଁ ସୂଚନା ଦରକାର?",
    initialMessageWithName: "ନମସ୍ତେ ଜେନ୍-ଜି!🙏 ମୁଁ {botName}! ଇ-ମୈତ୍ରୀ ପୋର୍ଟାଲକୁ ସ୍ୱାଗତ!✨ ମୁଁ ଆପଣଙ୍କୁ କିପରି ସାହାଯ୍ୟ କରିପାରିବି! ଆପଣଙ୍କୁ କେଉଁ ସୂଚନା ଦରକାର?👋",
    errorTraffic: "କ୍ଷମା କରିବେ, ବର୍ତ୍ତମାନ ବହୁତ ଟ୍ରାଫିକ୍ ଅଛି କିମ୍ବା କୋଟା ସରିଯାଇଛି। ଦୟାକରି କିଛି ସମୟ ପରେ ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",
    errorTech: "କ୍ଷମା କରିବେ, ଏକ ବୈଷୟିକ ସମସ୍ୟା ଦେଖାଦେଇଛି। ଦୟାକରି ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",
    premiumQuotaExceeded: "ପ୍ରିମିୟମ୍ ଭଏସ୍ କୋଟା ସରିଯାଇଛି। ଷ୍ଟାଣ୍ଡାର୍ଡ ଭଏସକୁ ଫେରୁଛି।",
    newChat: "ନୂଆ ଚାଟ୍",
    moreOptions: "ଅଧିକ ବିକଳ୍ପ",
    chattingIn: "ଚାଟିଂ ଇନ୍",
    saveChat: "ଚାଟ୍ ସେଭ୍ କରନ୍ତୁ",
    enterChatName: "ଚାଟ୍ ନାମ ଦିଅନ୍ତୁ...",
    cancel: "ବାତିଲ୍ କରନ୍ତୁ",
    save: "ସେଭ୍ କରନ୍ତୁ",
    chatHistory: "ଚାଟ୍ ହିଷ୍ଟ୍ରି",
    noSavedChats: "ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ସେଭ୍ ହୋଇଥିବା ଚାଟ୍ ନାହିଁ।",
    voiceEngine: "ଭଏସ୍ ଇଞ୍ଜିନ୍",
    standard: "ଷ୍ଟାଣ୍ଡାର୍ଡ",
    premium: "ପ୍ରିମିୟମ୍",
    clearChatHistory: "ଚାଟ୍ ହିଷ୍ଟ୍ରି ସଫା କରନ୍ତୁ",
    clearAll: "ସବୁ ସଫା କରନ୍ତୁ",
    areYouSureClear: "ଆପଣ ନିଶ୍ଚିତ କି ଆପଣ ସମସ୍ତ ସେଭ୍ ହୋଇଥିବା ଚାଟ୍ ଡିଲିଟ୍ କରିବାକୁ ଚାହୁଁଛନ୍ତି? ଏହାକୁ ଫେରାଇ ଆଣିହେବ ନାହିଁ।",
    uploadImage: "ସ୍କ୍ରିନସଟ୍ / ଇମେଜ୍ ଅପଲୋଡ୍ କରନ୍ତୁ",
    screenOn: "ସ୍କ୍ରିନ୍ ଅନ୍",
    screenOff: "ସ୍କ୍ରିନ୍ ଅଫ୍",
    stopGenerating: "ଜେନେରେଟ୍ କରିବା ବନ୍ଦ କରନ୍ତୁ",
    maxChatsError: "ଆପଣ କେବଳ 10 ଟି ଚାଟ୍ ସେଭ୍ କରିପାରିବେ। ନୂଆ ସେଭ୍ କରିବାକୁ ଦୟାକରି ଏକ ପୁରୁଣା ଚାଟ୍ ଡିଲିଟ୍ କରନ୍ତୁ।",
    edit: "ସମ୍ପାଦନ କରନ୍ତୁ",
    share: "ସେୟାର କରନ୍ତୁ",
    pinChat: "ଚାଟ୍ ପିନ୍ କରନ୍ତୁ",
    unpinChat: "ଚାଟ୍ ଅନପିନ୍ କରନ୍ତୁ",
    renameChat: "ଚାଟ୍ ର ନାମ ପରିବର୍ତ୍ତନ କରନ୍ତୁ",
    deleteChat: "ଚାଟ୍ ଡିଲିଟ୍ କରନ୍ତୁ",
    loading: "ଲୋଡ୍ ହେଉଛି...",
    chooseLanguage: "ଆପଣଙ୍କ ପସନ୍ଦର ଭାଷା ବାଛନ୍ତୁ",
    chooseVoiceEngine: "ଷ୍ଟାଣ୍ଡାର୍ଡ ଏବଂ ପ୍ରିମିୟମ୍ AI ଭଏସ୍ ମଧ୍ୟରୁ ବାଛନ୍ତୁ",
    selectPremiumVoice: "ଏକ ଉଚ୍ଚ-ଗୁଣବତ୍ତା AI ଭଏସ୍ ମଡେଲ୍ ବାଛନ୍ତୁ",
    selectStandardVoice: "ଏକ ଡିଭାଇସ୍ ଭଏସ୍ ବାଛନ୍ତୁ",
    autoSelect: "ସ୍ୱତଃ-ଚୟନ (ଡିଫଲ୍ଟ)",
    fenrirDesc: "ଫେନରିର୍ (ଶକ୍ତିଶାଳୀ, ପ୍ରାଧିକୃତ ପୁରୁଷ)",
    charonDesc: "ଚାରନ୍ (ଶାନ୍ତ, ମାପାଯାଇଥିବା ପୁରୁଷ)",
    puckDesc: "ପକ୍ (ବନ୍ଧୁତ୍ୱପୂର୍ଣ୍ଣ, ଶକ୍ତିଶାଳୀ ପୁରୁଷ)"
  },
  pa: {
    title: "ਜੇਨ-ਜੀ",
    subtitle: "ਏਆਈ ਮੈਸੇਂਜਰ, ਈ-ਮੈਤਰੀ.",
    you: "ਤੁਸੀਂ",
    copy: "ਕਾਪੀ ਕਰੋ",
    copied: "ਕਾਪੀ ਕੀਤਾ ਗਿਆ",
    listen: "ਸੁਣੋ",
    stop: "ਰੋਕੋ",
    back: "ਪਿੱਛੇ",
    listenAgain: "ਦੁਬਾਰਾ ਸੁਣੋ",
    speaking: "ਜੇਨ-ਜੀ ਬੋਲ ਰਹੇ ਹਨ...",
    listening: "ਜੇਨ-ਜੀ ਸੁਣ ਰਹੇ ਹਨ...",
    thinking: "ਸੋਚ ਰਹੇ ਹਨ...",
    liveChatOn: "ਲਾਈਵ ਵੌਇਸ ਚੈਟ ਚਾਲੂ ਹੈ: ਕਿਰਪਾ ਕਰਕੇ ਬੋਲੋ",
    stopVoiceChat: "ਵੌਇਸ ਚੈਟ ਬੰਦ ਕਰੋ",
    startVoiceChat: "ਲਾਈਵ ਵੌਇਸ ਚੈਟ ਸ਼ੁਰੂ ਕਰੋ",
    voiceTyping: "ਬੋਲ ਕੇ ਟਾਈਪ ਕਰੋ",
    stopVoiceTyping: "ਬੋਲਣਾ ਬੰਦ ਕਰੋ",
    speechNotSupported: "ਤੁਹਾਡੇ ਬ੍ਰਾਊਜ਼ਰ ਵਿੱਚ ਸਪੀਚ ਰਿਕੋਗਨੀਸ਼ਨ ਸਪੋਰਟ ਨਹੀਂ ਹੈ।",
    liveChat: "ਲਾਈਵ ਚੈਟ",
    typeMessage: "ਸੁਨੇਹਾ ਟਾਈਪ ਕਰੋ...",
    typeMessages: [
      "ਆਪਣਾ ਸੁਨੇਹਾ ਇੱਥੇ ਟਾਈਪ ਕਰੋ",
      "ਮਾਈਕ ਵਿੱਚ ਬੋਲ ਕੇ ਸੁਨੇਹਾ ਭੇਜੋ",
      "ਗੁਲਾਬੀ ਵੌਇਸ ਚੈਟ ਬਟਨ ਨਾਲ ਲਾਈਵ ਚੈਟ ਕਰੋ"
    ],
    userNameLabel: "ਬੋਟ ਦਾ ਨਾਮ",
    userNamePlaceholder: "ਬੋਟ ਦਾ ਨਾਮ ਦਰਜ ਕਰੋ",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "ਸੈਟਿੰਗਾਂ",
    language: "ਭਾਸ਼ਾ (Language)",
    speechRate: "ਬੋਲਣ ਦੀ ਗਤੀ",
    adjustRate: "ਆਵਾਜ਼ ਦੀ ਗਤੀ ਸੈੱਟ ਕਰੋ",
    speechPitch: "ਬੋਲਣ ਦੀ ਪਿੱਚ",
    adjustPitch: "ਆਵਾਜ਼ ਦੀ ਪਿੱਚ ਸੈੱਟ ਕਰੋ",
    q1: "ਡਿਜੀਟਲ ਗਵਰਨੈਂਸ ਕੀ ਹੈ?",
    q2: "ਤਿੰਨ-ਪੱਧਰੀ ਢਾਂਚੇ ਦੀ ਵਿਆਖਿਆ ਕਰੋ।",
    q3: "ਬੂਥ ਪ੍ਰਬੰਧਨ ਕਿਵੇਂ ਕੰਮ ਕਰਦਾ ਹੈ?",
    q4: "ਪਰਿਵਾਰਕ ਗਠਜੋੜ ਅੰਦੋਲਨ ਕੀ ਹੈ?",
    initialMessage: "ਨਮਸਤੇ ਜੇਨ-ਜੀ! ਈ-ਮੈਤਰੀ ਪੋਰਟਲ ਵਿੱਚ ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ! ਦੱਸੋ ਦੋਸਤ, ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ? ਤੁਹਾਨੂੰ ਕਿਹੜੀ ਜਾਣਕਾਰੀ ਚਾਹੀਦੀ ਹੈ?",
    initialMessageWithName: "ਨਮਸਤੇ ਜੇਨ-ਜੀ!🙏 ਮੈਂ {botName} ਹਾਂ! ਈ-ਮੈਤਰੀ ਪੋਰਟਲ ਵਿੱਚ ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ!✨ ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ! ਤੁਹਾਨੂੰ ਕਿਹੜੀ ਜਾਣਕਾਰੀ ਚਾਹੀਦੀ ਹੈ?👋",
    errorTraffic: "ਮੁਆਫ ਕਰਨਾ, ਇਸ ਸਮੇਂ ਬਹੁਤ ਟ੍ਰੈਫਿਕ ਹੈ ਜਾਂ ਕੋਟਾ ਖਤਮ ਹੋ ਗਿਆ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਕੁਝ ਸਮੇਂ ਬਾਅਦ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
    errorTech: "ਮੁਆਫ ਕਰਨਾ, ਇੱਕ ਤਕਨੀਕੀ ਸਮੱਸਿਆ ਆਈ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
    premiumQuotaExceeded: "ਪ੍ਰੀਮੀਅਮ ਵੌਇਸ ਕੋਟਾ ਖਤਮ ਹੋ ਗਿਆ ਹੈ। ਸਟੈਂਡਰਡ ਵੌਇਸ 'ਤੇ ਸਵਿਚ ਕਰ ਰਿਹਾ ਹੈ।",
    newChat: "ਨਵੀਂ ਚੈਟ",
    moreOptions: "ਹੋਰ ਵਿਕਲਪ",
    chattingIn: "ਚੈਟਿੰਗ ਇਨ",
    saveChat: "ਚੈਟ ਸੇਵ ਕਰੋ",
    enterChatName: "ਚੈਟ ਦਾ ਨਾਮ ਦਰਜ ਕਰੋ...",
    cancel: "ਰੱਦ ਕਰੋ",
    save: "ਸੇਵ ਕਰੋ",
    chatHistory: "ਚੈਟ ਹਿਸਟਰੀ",
    noSavedChats: "ਹਾਲੇ ਤੱਕ ਕੋਈ ਸੇਵ ਕੀਤੀ ਚੈਟ ਨਹੀਂ ਹੈ।",
    voiceEngine: "ਵੌਇਸ ਇੰਜਣ",
    standard: "ਸਟੈਂਡਰਡ",
    premium: "ਪ੍ਰੀਮੀਅਮ",
    clearChatHistory: "ਚੈਟ ਹਿਸਟਰੀ ਸਾਫ਼ ਕਰੋ",
    clearAll: "ਸਭ ਸਾਫ਼ ਕਰੋ",
    areYouSureClear: "ਕੀ ਤੁਸੀਂ ਯਕੀਨੀ ਤੌਰ 'ਤੇ ਸਾਰੀਆਂ ਸੇਵ ਕੀਤੀਆਂ ਚੈਟਾਂ ਨੂੰ ਡਿਲੀਟ ਕਰਨਾ ਚਾਹੁੰਦੇ ਹੋ? ਇਸਨੂੰ ਵਾਪਸ ਨਹੀਂ ਲਿਆਂਦਾ ਜਾ ਸਕਦਾ।",
    uploadImage: "ਸਕ੍ਰੀਨਸ਼ਾਟ / ਚਿੱਤਰ ਅੱਪਲੋਡ ਕਰੋ",
    screenOn: "ਸਕ੍ਰੀਨ ਆਨ",
    screenOff: "ਸਕ੍ਰੀਨ ਆਫ",
    stopGenerating: "ਜਨਰੇਟ ਕਰਨਾ ਬੰਦ ਕਰੋ",
    maxChatsError: "ਤੁਸੀਂ ਸਿਰਫ਼ 10 ਚੈਟਾਂ ਤੱਕ ਸੇਵ ਕਰ ਸਕਦੇ ਹੋ। ਨਵੀਂ ਸੇਵ ਕਰਨ ਲਈ ਕਿਰਪਾ ਕਰਕੇ ਪੁਰਾਣੀ ਚੈਟ ਡਿਲੀਟ ਕਰੋ।",
    edit: "ਸੋਧੋ",
    share: "ਸਾਂਝਾ ਕਰੋ",
    pinChat: "ਚੈਟ ਪਿੰਨ ਕਰੋ",
    unpinChat: "ਚੈਟ ਅਣਪਿੰਨ ਕਰੋ",
    renameChat: "ਚੈਟ ਦਾ ਨਾਮ ਬਦਲੋ",
    deleteChat: "ਚੈਟ ਡਿਲੀਟ ਕਰੋ",
    loading: "ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ...",
    chooseLanguage: "ਆਪਣੀ ਪਸੰਦੀਦਾ ਭਾਸ਼ਾ ਚੁਣੋ",
    chooseVoiceEngine: "ਸਟੈਂਡਰਡ ਅਤੇ ਪ੍ਰੀਮੀਅਮ AI ਆਵਾਜ਼ਾਂ ਵਿੱਚੋਂ ਚੁਣੋ",
    selectPremiumVoice: "ਇੱਕ ਉੱਚ-ਗੁਣਵੱਤਾ AI ਵੌਇਸ ਮਾਡਲ ਚੁਣੋ",
    selectStandardVoice: "ਇੱਕ ਡਿਵਾਈਸ ਵੌਇਸ ਚੁਣੋ",
    autoSelect: "ਸਵੈ-ਚੋਣ (ਡਿਫੌਲਟ)",
    fenrirDesc: "ਫੈਨਰਿਰ (ਮਜ਼ਬੂਤ, ਅਧਿਕਾਰਤ ਪੁਰਸ਼)",
    charonDesc: "ਚੈਰੋਨ (ਸ਼ਾਂਤ, ਮਾਪਿਆ ਪੁਰਸ਼)",
    puckDesc: "ਪੱਕ (ਦੋਸਤਾਨਾ, ਊਰਜਾਵਾਨ ਪੁਰਸ਼)"
  },
  ur: {
    title: "نارڈ",
    subtitle: "اے آئی میسنجر، ای-میتری.",
    you: "آپ",
    copy: "کاپی کریں",
    copied: "کاپی ہو گیا",
    listen: "سنیں",
    stop: "روکیں",
    back: "پیچھے",
    listenAgain: "دوبارہ سنیں",
    speaking: "نارڈ بول رہے ہیں...",
    listening: "نارڈ سن رہے ہیں...",
    thinking: "سوچ رہے ہیں...",
    liveChatOn: "لائیو وائس چیٹ آن ہے: براہ کرم بولیں",
    stopVoiceChat: "وائس چیٹ بند کریں",
    startVoiceChat: "لائیو وائس چیٹ شروع کریں",
    voiceTyping: "وائس ٹائپنگ",
    stopVoiceTyping: "وائس ٹائپنگ بند کریں",
    speechNotSupported: "آپ کے براؤزر میں اسپیچ ریکگنیشن سپورٹ نہیں ہے۔",
    liveChat: "لائیو چیٹ",
    typeMessage: "پیغام ٹائپ کریں...",
    typeMessages: [
      "اپنا پیغام یہاں ٹائپ کریں",
      "مائیک میں بول کر پیغام بھیجیں",
      "گلابی وائس چیٹ بٹن کے ساتھ لائیو چیٹ کریں"
    ],
    userNameLabel: "بوٹ کا نام",
    userNamePlaceholder: "بوٹ کا نام درج کریں",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "ترتیبات",
    language: "زبان (Language)",
    speechRate: "بولنے کی رفتار",
    adjustRate: "آواز کی رفتار سیٹ کریں",
    speechPitch: "بولنے کی پچ",
    adjustPitch: "آواز کی پچ سیٹ کریں",
    q1: "ڈیجیٹل گورننس کیا ہے؟",
    q2: "تین درجاتی ڈھانچے کی وضاحت کریں۔",
    q3: "بوتھ مینجمنٹ کیسے کام کرتا ہے؟",
    q4: "خاندانی اتحاد کی تحریک کیا ہے؟",
    initialMessage: "ہیلو جین-جی! ای-میتری پورٹل میں خوش آمدید! بتائیں دوست، میں آپ کی کیسے مدد کر سکتا ہوں؟ آپ کو کیا معلومات چاہیے؟",
    initialMessageWithName: "ہیلو جین-جی!🙏 میں {botName} ہوں! ای-میتری پورٹل میں خوش آمدید!✨ میں آپ کی کیسے مدد کر سکتا ہوں! آپ کو کیا معلومات چاہیے؟👋",
    errorTraffic: "معذرت، اس وقت بہت ٹریفک ہے یا کوٹہ ختم ہو گیا ہے۔ براہ کرم کچھ دیر بعد دوبارہ کوشش کریں۔",
    errorTech: "معذرت، ایک تکنیکی مسئلہ پیش آیا ہے۔ براہ کرم دوبارہ کوشش کریں۔",
    premiumQuotaExceeded: "پریمیم وائس کوٹہ ختم ہو گیا ہے۔ معیاری وائس پر سوئچ کر رہا ہے۔",
    newChat: "نئی چیٹ",
    moreOptions: "مزید اختیارات",
    chattingIn: "چیٹنگ ان",
    saveChat: "چیٹ محفوظ کریں",
    enterChatName: "چیٹ کا نام درج کریں...",
    cancel: "منسوخ کریں",
    save: "محفوظ کریں",
    chatHistory: "چیٹ ہسٹری",
    noSavedChats: "ابھی تک کوئی محفوظ شدہ چیٹ نہیں ہے۔",
    voiceEngine: "وائس انجن",
    standard: "معیاری",
    premium: "پریمیم",
    clearChatHistory: "چیٹ ہسٹری صاف کریں",
    clearAll: "سب صاف کریں",
    areYouSureClear: "کیا آپ واقعی تمام محفوظ شدہ چیٹس کو حذف کرنا چاہتے ہیں؟ اسے کالعدم نہیں کیا جا سکتا۔",
    uploadImage: "اسکرین شاٹ / تصویر اپ لوڈ کریں",
    screenOn: "اسکرین آن",
    screenOff: "اسکرین آف",
    stopGenerating: "بنانا بند کریں",
    maxChatsError: "آپ صرف 10 چیٹس تک محفوظ کر سکتے ہیں۔ نئی محفوظ کرنے کے لیے براہ کرم پرانی چیٹ حذف کریں۔",
    edit: "ترمیم کریں",
    share: "شیئر کریں",
    pinChat: "چیٹ پن کریں",
    unpinChat: "چیٹ ان پن کریں",
    renameChat: "چیٹ کا نام تبدیل کریں",
    deleteChat: "چیٹ حذف کریں",
    loading: "لوڈ ہو رہا ہے...",
    chooseLanguage: "اپنی پسندیدہ زبان منتخب کریں",
    chooseVoiceEngine: "معیاری اور پریمیم AI آوازوں کے درمیان انتخاب کریں",
    selectPremiumVoice: "ایک اعلیٰ معیار کا AI وائس ماڈل منتخب کریں",
    selectStandardVoice: "آلہ کی آواز منتخب کریں",
    autoSelect: "خودکار انتخاب (طے شدہ)",
    fenrirDesc: "فینریر (مضبوط، مستند مرد)",
    charonDesc: "کیرون (پرسکون، نپا تلا مرد)",
    puckDesc: "پک (دوستانہ، توانا مرد)"
  },
  as: {
    title: "নর্ড",
    subtitle: "এআই মেছেঞ্জাৰ, ই-মৈত্ৰী.",
    you: "আপুনি",
    copy: "কপি কৰক",
    copied: "কপি কৰা হৈছে",
    listen: "শুনক",
    stop: "বন্ধ কৰক",
    back: "উভতি যাওক",
    listenAgain: "আকৌ শুনক",
    speaking: "নর্ডয়ে কথা পাতি আছে...",
    listening: "নর্ডয়ে শুনি আছে...",
    thinking: "ভাবি আছে...",
    liveChatOn: "লাইভ ভইচ চেট অন আছে: অনুগ্ৰহ কৰি কওক",
    stopVoiceChat: "ভইচ চেট বন্ধ কৰক",
    startVoiceChat: "লাইভ ভইচ চেট আৰম্ভ কৰক",
    voiceTyping: "ভইচ টাইপিং",
    stopVoiceTyping: "ভইচ টাইপিং বন্ধ কৰক",
    speechNotSupported: "আপোনাৰ ব্ৰাউজাৰত স্পীচ ৰিকগনিচন চাপোৰ্ট নকৰে।",
    liveChat: "লাইভ চেট",
    typeMessage: "এটা মেছেজ টাইপ কৰক...",
    typeMessages: [
      "আপোনাৰ বাৰ্তা ইয়াত টাইপ কৰক",
      "মাইকত কথা পাতি বাৰ্তা পঠাওক",
      "গোলাপী ভইচ চেট বুটামৰ সৈতে লাইভ চেট কৰক"
    ],
    userNameLabel: "বটৰ নাম",
    userNamePlaceholder: "বটৰ নাম লিখক",
    poweredBy: "Powered by E-MAITRI digital platform.",
    settings: "ছেটিংছ",
    language: "ভাষা (Language)",
    speechRate: "কথা কোৱাৰ হাৰ",
    adjustRate: "ভইচৰ হাৰ মিলাওক",
    speechPitch: "কথা কোৱাৰ পিটচ",
    adjustPitch: "ভইচৰ পিটচ মিলাওক",
    q1: "ডিজিটেল গৱৰ্নেন্স কি?",
    q2: "ত্ৰি-স্তৰীয় গাঁথনি বৰ্ণনা কৰক।",
    q3: "বুথ পৰিচালনা কেনেকৈ কাম কৰে?",
    q4: "পাৰিবাৰিক মিত্ৰতা আন্দোলন কি?",
    initialMessage: "নমস্কাৰ জেন-জি! ই-মৈত্ৰী পোৰ্টেললৈ স্বাগতম! কওক বন্ধু, মই আপোনাক কেনেকৈ সহায় কৰিব পাৰোঁ? আপোনাক কি তথ্য লাগে?",
    initialMessageWithName: "নমস্কাৰ জেন-জি!🙏 মই {botName}! ই-মৈত্ৰী পোৰ্টেললৈ স্বাগতম!✨ মই আপোনাক কেনেকৈ সহায় কৰিব পাৰোঁ! আপোনাক কি তথ্য লাগে?👋",
    errorTraffic: "ক্ষমা কৰিব, বৰ্তমান বহুত ট্ৰেফিক আছে বা কোটা শেষ হৈ গৈছে। অনুগ্ৰহ কৰি কিছু সময় পিছত পুনৰ চেষ্টা কৰক।",
    errorTech: "ক্ষমা কৰিব, এটা কাৰিকৰী সমস্যা হৈছে। অনুগ্ৰহ কৰি পুনৰ চেষ্টা কৰক।",
    premiumQuotaExceeded: "প্ৰিমিয়াম ভইচ কোটা শেষ হৈছে। ষ্টেণ্ডাৰ্ড ভইচলৈ সলনি কৰা হৈছে।",
    newChat: "নতুন চেট",
    moreOptions: "অধিক বিকল্প",
    chattingIn: "চেটিং ইন",
    saveChat: "চেট ছেভ কৰক",
    enterChatName: "চেটৰ নাম দিয়ক...",
    cancel: "বাতিল কৰক",
    save: "ছেভ কৰক",
    chatHistory: "চেট হিষ্ট্ৰী",
    noSavedChats: "এতিয়ালৈকে কোনো ছেভ কৰা চেট নাই।",
    voiceEngine: "ভইচ ইঞ্জিন",
    standard: "ষ্টেণ্ডাৰ্ড",
    premium: "প্ৰিমিয়াম",
    clearChatHistory: "চেট হিষ্ট্ৰী চাফা কৰক",
    clearAll: "সকলো চাফা কৰক",
    areYouSureClear: "আপুনি নিশ্চিতনে যে আপুনি সকলো ছেভ কৰা চেট ডিলিট কৰিব বিচাৰে? ইয়াক ঘূৰাই আনিব নোৱাৰি।",
    uploadImage: "স্ক্ৰীণশ্বট / ছবি আপলোড কৰক",
    screenOn: "স্ক্ৰীণ অন",
    screenOff: "স্ক্ৰীণ অফ",
    stopGenerating: "জেনেৰেট কৰা বন্ধ কৰক",
    maxChatsError: "আপুনি কেৱল ১০ খন চেট ছেভ কৰিব পাৰিব। নতুন এখন ছেভ কৰিবলৈ অনুগ্ৰহ কৰি পুৰণি চেট ডিলিট কৰক।",
    edit: "সম্পাদনা কৰক",
    share: "শ্বেয়াৰ কৰক",
    pinChat: "চেট পিন কৰক",
    unpinChat: "চেট আনপিন কৰক",
    renameChat: "চেটৰ নাম সলনি কৰক",
    deleteChat: "চেট ডিলিট কৰক",
    loading: "ল'ড হৈ আছে...",
    chooseLanguage: "আপোনাৰ পছন্দৰ ভাষা বাছক",
    chooseVoiceEngine: "ষ্টেণ্ডাৰ্ড আৰু প্ৰিমিয়াম AI মাতৰ মাজত বাছক",
    selectPremiumVoice: "এটা উচ্চ-মানৰ AI ভইচ মডেল বাছক",
    selectStandardVoice: "এটা ডিভাইচ ভইচ বাছক",
    autoSelect: "স্বয়ংক্ৰিয়-বাছনি (ডিফল্ট)",
    fenrirDesc: "ফেনৰিৰ (শক্তিশালী, কৰ্তৃত্বশীল পুৰুষ)",
    charonDesc: "কেৰন (শান্ত, জোখ-মাখৰ পুৰুষ)",
    puckDesc: "পাক (বন্ধুত্বপূৰ্ণ, উদ্যমী পুৰুষ)"
  },
  ne: {
    title: "नॉर्ड",
    subtitle: "एआई मेसेन्जर, ई-मैत्री।",
    you: "तपाईं",
    copy: "कपी गर्नुहोस्",
    copied: "कपी गरियो",
    listen: "सुन्नुहोस्",
    stop: "रोक्नुहोस्",
    back: "पछाडि",
    listenAgain: "फेरि सुन्नुहोस्",
    speaking: "नॉर्ड बोल्दै हुनुहुन्छ...",
    listening: "नॉर्ड सुन्दै हुनुहुन्छ...",
    thinking: "सोच्दै हुनुहुन्छ...",
    liveChatOn: "लाइभ भ्वाइस च्याट अन छ: कृपया बोल्नुहोस्",
    stopVoiceChat: "भ्वाइस च्याट रोक्नुहोस्",
    startVoiceChat: "लाइभ भ्वाइस च्याट सुरु गर्नुहोस्",
    voiceTyping: "भ्वाइस टाइपिङ",
    stopVoiceTyping: "भ्वाइस टाइपिङ रोक्नुहोस्",
    speechNotSupported: "यस ब्राउजरमा स्पीच रिकग्निसन समर्थित छैन।",
    liveChat: "लाइभ च्याट",
    typeMessage: "सन्देश टाइप गर्नुहोस्...",
    typeMessages: [
      "तपाईंको सन्देश यहाँ टाइप गर्नुहोस्",
      "माइकमा बोलेर सन्देश पठाउनुहोस्",
      "गुलाबी भ्वाइस च्याट बटनको साथ लाइभ च्याट गर्नुहोस्"
    ],
    userNameLabel: "बोटको नाम",
    userNamePlaceholder: "बोटको नाम प्रविष्ट गर्नुहोस्",
    poweredBy: "ई-मैत्री डिजिटल प्लेटफर्म द्वारा संचालित।",
    settings: "सेटिङहरू",
    language: "भाषा",
    speechRate: "बोल्ने गति",
    adjustRate: "आवाजको गति समायोजन गर्नुहोस्",
    speechPitch: "आवाजको पिच",
    adjustPitch: "आवाजको पिच समायोजन गर्नुहोस्",
    q1: "डिजिटल गभर्नेन्स भनेको के हो?",
    q2: "त्रि-स्तरीय संरचना व्याख्या गर्नुहोस्।",
    q3: "बुथ व्यवस्थापनले कसरी काम गर्छ?",
    q4: "पारिवारिक गठबन्धन आन्दोलन के हो?",
    initialMessage: "नमस्ते जेन-जी! ई-मैत्री पोर्टलमा स्वागत छ! भन्नुहोस् साथी, म तपाईंलाई कसरी मद्दत गर्न सक्छु? तपाईंलाई के जानकारी चाहिन्छ?",
    initialMessageWithName: "नमस्ते जेन-जी!🙏 म {botName} हुँ! ई-मैत्री पोर्टलमा स्वागत छ!✨ म तपाईंलाई कसरी मद्दत गर्न सक्छु! तपाईंलाई के जानकारी चाहिन्छ?👋",
    errorTraffic: "माफ गर्नुहोस्, अहिले धेरै ट्राफिक छ वा कोटा सकिएको छ। कृपया पछि फेरि प्रयास गर्नुहोस्।",
    errorTech: "माफ गर्नुहोस्, प्राविधिक समस्या आयो। कृपया फेरि प्रयास गर्नुहोस्।",
    premiumQuotaExceeded: "प्रिमियम भ्वाइस कोटा नाघ्यो। मानक आवाजमा फर्किदै।",
    newChat: "नयाँ च्याट",
    moreOptions: "थप विकल्पहरू",
    chattingIn: "च्याट गर्दै",
    saveChat: "च्याट सेभ गर्नुहोस्",
    enterChatName: "च्याटको नाम प्रविष्ट गर्नुहोस्...",
    cancel: "रद्द गर्नुहोस्",
    save: "सेभ गर्नुहोस्",
    chatHistory: "च्याट इतिहास",
    noSavedChats: "कुनै सेभ गरिएको च्याट छैन।",
    voiceEngine: "भ्वाइस इन्जिन",
    standard: "मानक",
    premium: "प्रिमियम",
    clearChatHistory: "च्याट इतिहास खाली गर्नुहोस्",
    clearAll: "सबै खाली गर्नुहोस्",
    areYouSureClear: "के तपाईं पक्का सबै सेभ गरिएका च्याटहरू मेटाउन चाहनुहुन्छ? यो पूर्ववत गर्न सकिँदैन।",
    uploadImage: "स्क्रिनसट / तस्विर अपलोड गर्नुहोस्",
    screenOn: "स्क्रिन अन",
    screenOff: "स्क्रिन अफ",
    stopGenerating: "उत्पन्न गर्न रोक्नुहोस्",
    maxChatsError: "तपाईं १० वटा च्याट मात्र सेभ गर्न सक्नुहुन्छ। नयाँ सेभ गर्न कृपया पुरानो च्याट मेटाउनुहोस्।",
    edit: "सम्पादन गर्नुहोस्",
    share: "सेयर गर्नुहोस्",
    pinChat: "च्याट पिन गर्नुहोस्",
    unpinChat: "च्याट अनपिन गर्नुहोस्",
    renameChat: "च्याटको नाम फेर्नुहोस्",
    deleteChat: "च्याट मेटाउनुहोस्",
    loading: "लोड हुँदैछ...",
    chooseLanguage: "आफ्नो मनपर्ने भाषा छान्नुहोस्",
    chooseVoiceEngine: "मानक र प्रिमियम एआई आवाजहरू बीच छान्नुहोस्",
    selectPremiumVoice: "उच्च गुणस्तरको एआई भ्वाइस मोडेल छान्नुहोस्",
    selectStandardVoice: "उपकरणको आवाज छान्नुहोस्",
    autoSelect: "स्वतः छान्नुहोस् (डिफल्ट)",
    fenrirDesc: "फेनरिर (बलियो, आधिकारिक पुरुष)",
    charonDesc: "क्यारोन (शान्त, नापिएको पुरुष)",
    puckDesc: "पक (मैत्रीपूर्ण, ऊर्जावान पुरुष)"
  },
  mai: {
    title: "नॉर्ड",
    subtitle: "एआई मैसेंजर, ई-मैत्री।",
    you: "अहाँ",
    copy: "कॉपी करू",
    copied: "कॉपी भेल",
    listen: "सुनू",
    stop: "रोकू",
    back: "पाछाँ",
    listenAgain: "फेर सँ सुनू",
    speaking: "नॉर्ड बाजि रहल छथि...",
    listening: "नॉर्ड सुनि रहल छथि...",
    thinking: "सोचि रहल छथि...",
    liveChatOn: "लाइव वॉयस चैट ऑन अछि: कृपया बाजू",
    stopVoiceChat: "वॉयस चैट रोकू",
    startVoiceChat: "लाइव वॉयस चैट शुरू करू",
    voiceTyping: "वॉयस टाइपिंग",
    stopVoiceTyping: "वॉयस टाइपिंग रोकू",
    speechNotSupported: "ई ब्राउजर मे स्पीच रिकग्निशन समर्थित नहि अछि।",
    liveChat: "लाइव चैट",
    typeMessage: "संदेश टाइप करू...",
    typeMessages: [
      "अपन संदेश एतय टाइप करू",
      "माइक सँ बाजि कऽ संदेश पठाउ",
      "गुलाबी वॉयस चैट बटन सँ लाइव चैट करू"
    ],
    userNameLabel: "बॉट के नाम",
    userNamePlaceholder: "बॉट के नाम दर्ज करू",
    poweredBy: "ई-मैत्री डिजिटल प्लेटफॉर्म द्वारा संचालित।",
    settings: "सेटिंग्स",
    language: "भाषा",
    speechRate: "बाजै के गति",
    adjustRate: "आवाज के गति सेट करू",
    speechPitch: "आवाज के पिच",
    adjustPitch: "आवाज के पिच सेट करू",
    q1: "डिजिटल गवर्नेंस की थिक?",
    q2: "त्रि-स्तरीय संरचना केँ बुझाउ।",
    q3: "बूथ प्रबंधन कोना काज करैत अछि?",
    q4: "पारिवारिक गठबंधन आंदोलन की थिक?",
    initialMessage: "नमस्ते जेन-जी! ई-मैत्री पोर्टल मे अहाँक स्वागत अछि! कहू मित्र, हम अहाँक कोना मदद क सकैत छी? अहाँ केँ की जानकारी चाही?",
    initialMessageWithName: "नमस्ते जेन-जी!🙏 हम {botName} छी! ई-मैत्री पोर्टल मे अहाँक स्वागत अछि!✨ हम अहाँक कोना मदद क सकैत छी! अहाँ केँ की जानकारी चाही?👋",
    errorTraffic: "क्षमा करू, अखन बहुत बेसी ट्रैफिक अछि वा कोटा खतम भ गेल अछि। कृपया बाद मे फेर सँ प्रयास करू।",
    errorTech: "क्षमा करू, तकनीकी समस्या आबि गेल। कृपया फेर सँ प्रयास करू।",
    premiumQuotaExceeded: "प्रीमियम वॉयस कोटा पार भ गेल। मानक आवाज पर वापस जा रहल अछि।",
    newChat: "नव चैट",
    moreOptions: "आरो विकल्प",
    chattingIn: "चैट क रहल छी",
    saveChat: "चैट सेव करू",
    enterChatName: "चैट के नाम दर्ज करू...",
    cancel: "रद्द करू",
    save: "सेव करू",
    chatHistory: "चैट इतिहास",
    noSavedChats: "कोनो सेव कएल चैट नहि अछि।",
    voiceEngine: "वॉयस इंजन",
    standard: "मानक",
    premium: "प्रीमियम",
    clearChatHistory: "चैट इतिहास साफ करू",
    clearAll: "सब साफ करू",
    areYouSureClear: "की अहाँ पक्का सब सेव कएल चैट डिलीट करय चाहैत छी? एकरा वापस नहि कएल जा सकैत अछि।",
    uploadImage: "स्क्रीनशॉट / फोटो अपलोड करू",
    screenOn: "स्क्रीन ऑन",
    screenOff: "स्क्रीन ऑफ",
    stopGenerating: "उत्पन्न करब रोकू",
    maxChatsError: "अहाँ केवल 10 टा चैट सेव क सकैत छी। नव सेव करय लेल कृपया पुरान चैट डिलीट करू।",
    edit: "संपादित करू",
    share: "शेयर करू",
    pinChat: "चैट पिन करू",
    unpinChat: "चैट अनपिन करू",
    renameChat: "चैट के नाम बदलू",
    deleteChat: "चैट डिलीट करू",
    loading: "लोड भ रहल अछि...",
    chooseLanguage: "अपन पसंदीदा भाषा चुनू",
    chooseVoiceEngine: "मानक आ प्रीमियम एआई आवाज के बीच चुनू",
    selectPremiumVoice: "एगो उच्च गुणवत्ता वाला एआई वॉयस मॉडल चुनू",
    selectStandardVoice: "डिवाइस के आवाज चुनू",
    autoSelect: "स्वतः चुनू (डिफ़ॉल्ट)",
    fenrirDesc: "फेनरिर (मजबूत, आधिकारिक पुरुष)",
    charonDesc: "कैरन (शांत, नपल-तौल्ल पुरुष)",
    puckDesc: "पक (दोस्ताना, ऊर्जावान पुरुष)"
  },
  sd: {
    title: "نارڊ",
    subtitle: "اي آءِ ميسينجر، اي-ميتري.",
    you: "توهان",
    copy: "ڪاپي ڪريو",
    copied: "ڪاپي ٿي ويو",
    listen: "ٻڌو",
    stop: "روڪيو",
    back: "واپس",
    listenAgain: "ٻيهر ٻڌو",
    speaking: "نارڊ ڳالهائي رهيو آهي...",
    listening: "نارڊ ٻڌي رهيو آهي...",
    thinking: "سوچي رهيو آهي...",
    liveChatOn: "لائيو وائس چيٽ آن آهي: مهرباني ڪري ڳالهايو",
    stopVoiceChat: "وائس چيٽ روڪيو",
    startVoiceChat: "لائيو وائس چيٽ شروع ڪريو",
    voiceTyping: "وائس ٽائپنگ",
    stopVoiceTyping: "وائس ٽائپنگ روڪيو",
    speechNotSupported: "هن برائوزر ۾ اسپيچ ريڪگنيشن سپورٽ ناهي.",
    liveChat: "لائيو چيٽ",
    typeMessage: "هڪ پيغام لکو...",
    typeMessages: [
      "پنهنجو پيغام هتي ٽائپ ڪريو",
      "مائڪ ۾ ڳالهائي پيغام موڪليو",
      "گلابي وائس چيٽ بٽڻ سان لائيو چيٽ ڪريو"
    ],
    userNameLabel: "بوٽ جو نالو",
    userNamePlaceholder: "بوٽ جو نالو داخل ڪريو",
    poweredBy: "اي-ميتري ڊجيٽل پليٽ فارم پاران هلندڙ.",
    settings: "سيٽنگون",
    language: "ٻولي",
    speechRate: "ڳالهائڻ جي رفتار",
    adjustRate: "آواز جي رفتار سيٽ ڪريو",
    speechPitch: "آواز جي پچ",
    adjustPitch: "آواز جي پچ سيٽ ڪريو",
    q1: "ڊجيٽل گورننس ڇا آهي؟",
    q2: "ٽي-سطحي ڍانچي جي وضاحت ڪريو.",
    q3: "بوٿ مئنيجمينٽ ڪيئن ڪم ڪندو آهي؟",
    q4: "فيملي الائنس موومينٽ ڇا آهي؟",
    initialMessage: "هيلو جين-جي! اي-ميتري پورٽل ۾ ڀليڪار! ٻڌايو دوست، مان توهان جي ڪيئن مدد ڪري سگهان ٿو؟ توهان کي ڪهڙي ڄاڻ گهرجي؟",
    initialMessageWithName: "هيلو جين-جي!🙏 مان {botName} آهيان! اي-ميتري پورٽل ۾ ڀليڪار!✨ مان توهان جي ڪيئن مدد ڪري سگهان ٿو! توهان کي ڪهڙي ڄاڻ گهرجي؟👋",
    errorTraffic: "معاف ڪجو، هن وقت تمام گهڻي ٽرئفڪ آهي يا ڪوٽا ختم ٿي وئي آهي. مهرباني ڪري بعد ۾ ٻيهر ڪوشش ڪريو.",
    errorTech: "معاف ڪجو، هڪ ٽيڪنيڪل مسئلو پيش آيو. مهرباني ڪري ٻيهر ڪوشش ڪريو.",
    premiumQuotaExceeded: "پريميئم وائس ڪوٽا ختم ٿي وئي. معياري آواز ڏانهن واپس.",
    newChat: "نئين چيٽ",
    moreOptions: "وڌيڪ آپشن",
    chattingIn: "چيٽنگ ۾",
    saveChat: "چيٽ سيو ڪريو",
    enterChatName: "چيٽ جو نالو داخل ڪريو...",
    cancel: "رد ڪريو",
    save: "سيو ڪريو",
    chatHistory: "چيٽ جي تاريخ",
    noSavedChats: "ڪا به سيو ٿيل چيٽ ناهي.",
    voiceEngine: "وائس انجڻ",
    standard: "معياري",
    premium: "پريميئم",
    clearChatHistory: "چيٽ جي تاريخ صاف ڪريو",
    clearAll: "سڀ صاف ڪريو",
    areYouSureClear: "ڇا توهان پڪ سان سڀ سيو ٿيل چيٽ ڊليٽ ڪرڻ چاهيو ٿا؟ هن کي واپس نٿو ڪري سگهجي.",
    uploadImage: "اسڪرين شاٽ / تصوير اپلوڊ ڪريو",
    screenOn: "اسڪرين آن",
    screenOff: "اسڪرين آف",
    stopGenerating: "ٺاهڻ روڪيو",
    maxChatsError: "توهان صرف 10 چيٽس تائين سيو ڪري سگهو ٿا. نئين سيو ڪرڻ لاءِ مهرباني ڪري پراڻي چيٽ ڊليٽ ڪريو.",
    edit: "ايڊٽ ڪريو",
    share: "شيئر ڪريو",
    pinChat: "چيٽ پن ڪريو",
    unpinChat: "چيٽ ان پن ڪريو",
    renameChat: "چيٽ جو نالو تبديل ڪريو",
    deleteChat: "چيٽ ڊليٽ ڪريو",
    loading: "لوڊ ٿي رهيو آهي...",
    chooseLanguage: "پنهنجي پسنديده ٻولي چونڊيو",
    chooseVoiceEngine: "معياري ۽ پريميئم اي آءِ آوازن جي وچ ۾ چونڊيو",
    selectPremiumVoice: "هڪ اعليٰ معيار جو اي آءِ وائس ماڊل چونڊيو",
    selectStandardVoice: "ڊوائيس جو آواز چونڊيو",
    autoSelect: "خودڪار چونڊ (ڊفالٽ)",
    fenrirDesc: "فينرير (مضبوط، مستند مرد)",
    charonDesc: "ڪيرون (پرسڪون، ماپيل مرد)",
    puckDesc: "پڪ (دوستانه، توانائي وارو مرد)"
  },
  kok: {
    title: "नॉर्ड",
    subtitle: "एआय मेसेंजर, ई-मैत्री.",
    you: "तुमी",
    copy: "कॉपी करात",
    copied: "कॉपी केले",
    listen: "आयकात",
    stop: "रावयात",
    back: "फाटीं",
    listenAgain: "परत आयकात",
    speaking: "नॉर्ड उलयता...",
    listening: "नॉर्ड आयकता...",
    thinking: "विचार करता...",
    liveChatOn: "लायव्ह व्हॉइस चॅट चालू आसा: उपकार करून उलय",
    stopVoiceChat: "व्हॉइस चॅट रावयात",
    startVoiceChat: "लायव्ह व्हॉइस चॅट सुरू करात",
    voiceTyping: "व्हॉइस टायपिंग",
    stopVoiceTyping: "व्हॉइस टायपिंग रावयात",
    speechNotSupported: "ह्या ब्राउझरांत स्पीच रिकग्निशन समर्थित ना.",
    liveChat: "लायव्ह चॅट",
    typeMessage: "संदेश टायप करात...",
    typeMessages: [
      "तुमचो संदेश हांगा टायप करात",
      "मायकांत उलोवन संदेश धाडात",
      "गुलाबी व्हॉइस चॅट बटणा वांगडा लायव्ह चॅट करात"
    ],
    userNameLabel: "बॉटचें नांव",
    userNamePlaceholder: "बॉटचें नांव बरोवचें",
    poweredBy: "ई-मैत्री डिजिटल प्लॅटफॉर्मान संचालित.",
    settings: "सेटिंग्ज",
    language: "भास",
    speechRate: "उलोवपाची गती",
    adjustRate: "आवाजाची गती अ‍ॅडजस्ट करात",
    speechPitch: "आवाजाची पीच",
    adjustPitch: "आवाजाची पीच अ‍ॅडजस्ट करात",
    q1: "डिजिटल गव्हर्नन्स म्हणल्यार किदें?",
    q2: "त्रि-स्तरीय रचना स्पश्ट करात.",
    q3: "बूथ मॅनेजमेंट कशें काम करता?",
    q4: "फॅमिली अलायंस मूव्हमेंट किदें आसा?",
    initialMessage: "नमस्ते जेन-जी! ई-मैत्री पोर्टलांत येवकार! सांगा इश्टा, हांव तुमची कशी मजत करूं शकता? तुमकां खंयची म्हायती जाय?",
    initialMessageWithName: "नमस्ते जेन-जी!🙏 हांव {botName}! ई-मैत्री पोर्टलांत येवकार!✨ हांव तुमची कशी मजत करूं शकता! तुमकां खंयची म्हायती जाय?👋",
    errorTraffic: "माफ करात, सद्या खूब ट्रॅफिक आसा वा कोटा सोंपला. उपकार करून मागीर परत यत्न करात.",
    errorTech: "माफ करात, तांत्रिक अडचण आयल्या. उपकार करून परत यत्न करात.",
    premiumQuotaExceeded: "प्रीमियम व्हॉइस कोटा सोंपला. स्टँडर्ड आवाजाचेर परत वता.",
    newChat: "नवी चॅट",
    moreOptions: "आनीक पर्याय",
    chattingIn: "चॅटिंग करता",
    saveChat: "चॅट सेव्ह करात",
    enterChatName: "चॅटीचें नांव दियात...",
    cancel: "रद्द करात",
    save: "सेव्ह करात",
    chatHistory: "चॅट इतिहास",
    noSavedChats: "खंयचीच चॅट सेव्ह करूंक ना.",
    voiceEngine: "व्हॉइस इंजिन",
    standard: "स्टँडर्ड",
    premium: "प्रीमियम",
    clearChatHistory: "चॅट इतिहास निवळ करात",
    clearAll: "सगळें निवळ करात",
    areYouSureClear: "तुमी खऱ्यानीच सगळ्यो सेव्ह केल्लो चॅटी डिलीट करूंक सोदतात? हें परत मेळचें ना.",
    uploadImage: "स्क्रीनशॉट / चित्र अपलोड करात",
    screenOn: "स्क्रीन ऑन",
    screenOff: "स्क्रीन ऑफ",
    stopGenerating: "तयार करप रावयात",
    maxChatsError: "तुमी फकत 10 चॅटी सेव्ह करूंक शकतात. नवी सेव्ह करपा खातीर उपकार करून पोरनी चॅट डिलीट करात.",
    edit: "संपादित करात",
    share: "शेअर करात",
    pinChat: "चॅट पिन करात",
    unpinChat: "चॅट अनपिन करात",
    renameChat: "चॅटीचें नांव बदलात",
    deleteChat: "चॅट डिलीट करात",
    loading: "लोड जाता...",
    chooseLanguage: "तुमची आवडटी भास वेंचून काडात",
    chooseVoiceEngine: "स्टँडर्ड आनी प्रीमियम एआय आवाजां मदीं वेंचून काडात",
    selectPremiumVoice: "उच्च दर्जाचें एआय व्हॉइस मॉडेल वेंचून काडात",
    selectStandardVoice: "डिव्हायसाचो आवाज वेंचून काडात",
    autoSelect: "स्वयंचलित वेंचून काडात (डिफॉल्ट)",
    fenrirDesc: "फेनरिर (घट्ट, अधिकृत दादलो)",
    charonDesc: "कॅरॉन (शांत, मेजिल्लो दादलो)",
    puckDesc: "पक (इश्टागतीचो, ऊर्जावान दादलो)"
  },
  doi: {
    title: "नॉर्ड",
    subtitle: "एआई मैसेंजर, ई-मैत्री।",
    you: "तुस",
    copy: "कापी करो",
    copied: "कापी कीता",
    listen: "सुनो",
    stop: "रोको",
    back: "पिच्छें",
    listenAgain: "परतियै सुनो",
    speaking: "नॉर्ड गल्ल करदा ऐ...",
    listening: "नॉर्ड सुनदा ऐ...",
    thinking: "सोचदा ऐ...",
    liveChatOn: "लाइव वॉयस चैट ऑन ऐ: किरपा करियै गल्ल करो",
    stopVoiceChat: "वॉयस चैट रोको",
    startVoiceChat: "लाइव वॉयस चैट शुरू करो",
    voiceTyping: "वॉयस टाइपिंग",
    stopVoiceTyping: "वॉयस टाइपिंग रोको",
    speechNotSupported: "इस ब्राउज़र च स्पीच रिकग्निशन समर्थित नेईं ऐ।",
    liveChat: "लाइव चैट",
    typeMessage: "सनेआ टाइप करो...",
    typeMessages: [
      "अपना सनेआ इत्थै टाइप करो",
      "माइक च बोलियै सनेआ भेजो",
      "गुलाबी वायस चैट बटन कन्नै लाइव चैट करो"
    ],
    userNameLabel: "बॉट दा नां",
    userNamePlaceholder: "बॉट दा नां दर्ज करो",
    poweredBy: "ई-मैत्री डिजिटल प्लेटफॉर्म राहें संचालित।",
    settings: "सेटिंगां",
    language: "भाशा",
    speechRate: "बोलने दी गति",
    adjustRate: "अवाज दी गति सेट करो",
    speechPitch: "अवाज दी पिच",
    adjustPitch: "अवाज दी पिच सेट करो",
    q1: "डिजिटल गवर्नेंस केह् ऐ?",
    q2: "त्रि-स्तरीय संरचना दी व्याख्या करो।",
    q3: "बूथ मैनेजमेंट कियां कम्म करदा ऐ?",
    q4: "फैमिली अलायंस मूवमेंट केह् ऐ?",
    initialMessage: "नमस्ते जेन-जी! ई-मैत्री पोर्टल च तुंदा स्वागत ऐ! दस्सो दोस्त, मैं तुंदी केह् मदद करी सकनां? तुसेंगी केह् जानकारी लोड़िदी ऐ?",
    initialMessageWithName: "नमस्ते जेन-जी!🙏 मैं {botName} आं! ई-मैत्री पोर्टल च तुंदा स्वागत ऐ!✨ मैं तुंदी केह् मदद करी सकनां! तुसेंगी केह् जानकारी लोड़िदी ऐ?👋",
    errorTraffic: "माफ करना, इसलै मते लोक इस्तेमाल करदे न जां कोटा मुक्की गेआ ऐ। किरपा करियै बाद च परतियै कोशिश करो।",
    errorTech: "माफ करना, कोई तकनीकी खराबी आई गेई ऐ। किरपा करियै परतियै कोशिश करो।",
    premiumQuotaExceeded: "प्रीमियम वॉयस कोटा मुक्की गेआ ऐ। स्टैंडर्ड अवाज पर वापस जा करदे आं।",
    newChat: "नमीं चैट",
    moreOptions: "होर विकल्प",
    chattingIn: "चैट करदे आं",
    saveChat: "चैट सेव करो",
    enterChatName: "चैट दा नां दर्ज करो...",
    cancel: "रद्द करो",
    save: "सेव करो",
    chatHistory: "चैट दा इतिहास",
    noSavedChats: "कोई सेव कीती दी चैट नेईं ऐ।",
    voiceEngine: "वॉयस इंजन",
    standard: "स्टैंडर्ड",
    premium: "प्रीमियम",
    clearChatHistory: "चैट दा इतिहास साफ करो",
    clearAll: "सब साफ करो",
    areYouSureClear: "के तुस पक्का सब सेव कीती दी चैट डिलीट करना चांदे ओ? इसगी वापस नेईं कीता जाई सकदा।",
    uploadImage: "स्क्रीनशॉट / फोटो अपलोड करो",
    screenOn: "स्क्रीन ऑन",
    screenOff: "स्क्रीन ऑफ",
    stopGenerating: "बनाना रोको",
    maxChatsError: "तुस सिर्फ 10 चैट सेव करी सकदे ओ। नमीं सेव करने लेई किरपा करियै पुरानी चैट डिलीट करो।",
    edit: "संपादित करो",
    share: "शेयर करो",
    pinChat: "चैट पिन करो",
    unpinChat: "चैट अनपिन करो",
    renameChat: "चैट दा नां बदलो",
    deleteChat: "चैट डिलीट करो",
    loading: "लोड होआ करदा ऐ...",
    chooseLanguage: "अपनी मनपसंद भाशा चुनो",
    chooseVoiceEngine: "स्टैंडर्ड ते प्रीमियम एआई अवाजें बिच्च चुनो",
    selectPremiumVoice: "इक उच्च गुणवत्ता आह् ला एआई वॉयस मॉडल चुनो",
    selectStandardVoice: "डिवाइस दी अवाज चुनो",
    autoSelect: "स्वतः चुनो (डिफ़ॉल्ट)",
    fenrirDesc: "फेनरिर (मजबूत, आधिकारिक मर्द)",
    charonDesc: "कैरन (शांत, नपेआ-तुलेआ मर्द)",
    puckDesc: "पक (दोस्ताना, ऊर्जावान मर्द)"
  },
  ks: {
    title: "نارڈ",
    subtitle: "اے آئی میسنجر، ای-میتری۔",
    you: "تُہۍ",
    copy: "کأپی کٔرِو",
    copied: "کأپی گٔیہ",
    listen: "بوزِو",
    stop: "رُکِو",
    back: "واپس",
    listenAgain: "دوبارٕ بوزِو",
    speaking: "نارڈ چھُ بولان...",
    listening: "نارڈ چھُ بوزان...",
    thinking: "سوچان چھُ...",
    liveChatOn: "لائیو وائس چیٹ چھُ آن: مہربٲنی کٔرِتھ کَتھ کٔرِو",
    stopVoiceChat: "وائس چیٹ رُکٲوِو",
    startVoiceChat: "لائیو وائس چیٹ شۆروٗع کٔرِو",
    voiceTyping: "وائس ٹائپنگ",
    stopVoiceTyping: "وائس ٹائپنگ رُکٲوِو",
    speechNotSupported: "یَتھ براؤزرس مَنٛز چھُنٕہ سپیچ رِکگنِشن سپورٹ۔",
    liveChat: "لائیو چیٹ",
    typeMessage: "میسج ٹائپ کٔرِو...",
    typeMessages: [
      "پَنُن میسج یَتھ جاے ٹائپ کٔرِو",
      "مائکَس مَنٛز کَتھ کٔرِتھ میسج دِیِو",
      "گُلابی وائس چیٹ بَٹُن سٟتۍ لائیو چیٹ کٔرِو"
    ],
    userNameLabel: "بوٹُن ناو",
    userNamePlaceholder: "بوٹُن ناو دَرٕج کٔرِو",
    poweredBy: "ای-میتری ڈیجیٹل پلیٹ فارم دٔسۍ چلاونہٕ یِوان۔",
    settings: "سیٹنگز",
    language: "زبان",
    speechRate: "کَتھ کرنٕچ رفتار",
    adjustRate: "آوازٕچ رفتار سیٹ کٔرِو",
    speechPitch: "آوازٕچ پِچ",
    adjustPitch: "آوازٕچ پِچ سیٹ کٔرِو",
    q1: "ڈیجیٹل گورننس کیاہ چھُ؟",
    q2: "ترٛے سطحٕچ ساختٕچ وضاحت کٔرِو۔",
    q3: "بوتھ مینجمنٹ کِتھ کٔنۍ چھُ کٲم کران؟",
    q4: "فیملی الائنس موومنٹ کیاہ چھُ؟",
    initialMessage: "ہیلو جین-جی! ای-میتری پورٹلس مَنٛز خۄش آمدید! ونِو دوست، بہٕ کِتھ کٔنۍ ہیکہٕ تُہنٛز مَدَتھ کٔرِتھ؟ تُہۍ کیاہ مولوٗمات چھِو یژھان؟",
    initialMessageWithName: "ہیلو جین-جی!🙏 بہٕ چھُس {botName}! ای-میتری پورٹلس مَنٛز خۄش آمدید!✨ بہٕ کِتھ کٔنۍ ہیکہٕ تُہنٛز مَدَتھ کٔرِتھ! تُہۍ کیاہ مولوٗمات چھِو یژھان؟👋",
    errorTraffic: "معاف کٔرِو، یِمہِ وِزِ چھُ واریاہ ٹریفک یا کوٹا چھُ خَتٕم گومُت۔ مہربٲنی کٔرِتھ پَتہٕ دوبارٕ کوٗشِش کٔرِو۔",
    errorTech: "معاف کٔرِو، اَکھ تکنیکی مسلٕہ آو۔ مہربٲنی کٔرِتھ دوبارٕ کوٗشِش کٔرِو۔",
    premiumQuotaExceeded: "پریمیم وائس کوٹا چھُ خَتٕم گومُت۔ سٹینڈرڈ آوازس پؠٹھ واپس گژھان۔",
    newChat: "نۆو چیٹ",
    moreOptions: "مزید آپشن",
    chattingIn: "چیٹنگ کران",
    saveChat: "چیٹ سیو کٔرِو",
    enterChatName: "چیٹُک ناو دَرٕج کٔرِو...",
    cancel: "کینسل کٔرِو",
    save: "سیو کٔرِو",
    chatHistory: "چیٹ ہسٹری",
    noSavedChats: "کاہ تِہ سیو کٔرمٕژ چیٹ چھِنہٕ۔",
    voiceEngine: "وائس اِنجن",
    standard: "سٹینڈرڈ",
    premium: "پریمیم",
    clearChatHistory: "چیٹ ہسٹری صاف کٔرِو",
    clearAll: "سٲری صاف کٔرِو",
    areYouSureClear: "کیاہ تُہۍ چھِو پزۍ پٲٹھۍ سٲری سیو کٔرمٕژ چیٹ ڈیلیٹ کرُن یژھان؟ یہِ چھُنٕہ واپس یِوان۔",
    uploadImage: "سکرین شاٹ / فوٹو اَپلوڈ کٔرِو",
    screenOn: "سکرین آن",
    screenOff: "سکرین آف",
    stopGenerating: "بناون رُکٲوِو",
    maxChatsError: "تُہۍ ہیکِو صِرِف 10 چیٹ سیو کٔرِتھ۔ نٔو سیو کرنٕہ خٲطرٕ مہربٲنی کٔرِتھ پرٲنۍ چیٹ ڈیلیٹ کٔرِو۔",
    edit: "ایڈٹ کٔرِو",
    share: "شیئر کٔرِو",
    pinChat: "چیٹ پِن کٔرِو",
    unpinChat: "چیٹ اَن پِن کٔرِو",
    renameChat: "چیٹُک ناو بَدلٲوِو",
    deleteChat: "چیٹ ڈیلیٹ کٔرِو",
    loading: "لوڈ گژھان...",
    chooseLanguage: "پَنٕنۍ پسندیدٕ زبان چُنِو",
    chooseVoiceEngine: "سٹینڈرڈ تہٕ پریمیم اے آئی آوازن مَنٛز چُنِو",
    selectPremiumVoice: "اَکھ اعلیٰ معیارُک اے آئی وائس ماڈل چُنِو",
    selectStandardVoice: "ڈیوائسٕچ آواز چُنِو",
    autoSelect: "خودکار چُنِو (ڈیفالٹ)",
    fenrirDesc: "فینریر (مضبوط، مستند مرد)",
    charonDesc: "کیرون (پرسکون، نَپِتھ مرد)",
    puckDesc: "پک (دوستانہ، توانا مرد)"
  },
  sa: {
    title: "नॉर्ड",
    subtitle: "एआई-सहायकः, ई-मैत्री।",
    you: "भवान्",
    copy: "प्रतिलिपिं करोतु",
    copied: "प्रतिलिपिः कृता",
    listen: "शृणोतु",
    stop: "स्थगयतु",
    back: "पृष्ठतः",
    listenAgain: "पुनः शृणोतु",
    speaking: "नॉर्ड वदति...",
    listening: "नॉर्ड शृणोति...",
    thinking: "चिन्तयति...",
    liveChatOn: "सजीव-संवादः आरब्धः: कृपया वदतु",
    stopVoiceChat: "ध्वनि-संवादं स्थगयतु",
    startVoiceChat: "सजीव-ध्वनि-संवादम् आरभताम्",
    voiceTyping: "ध्वनि-टङ्कणम्",
    stopVoiceTyping: "ध्वनि-टङ्कणं स्थगयतु",
    speechNotSupported: "अस्मिन् ब्राउजर् मध्ये भाषण-अभिज्ञानं न समर्थितम्।",
    liveChat: "सजीव-संवादः",
    typeMessage: "सन्देशं टङ्कयतु...",
    typeMessages: [
      "स्वसन्देशम् अत्र टङ्कयतु",
      "ध्वनिग्राहके उक्त्वा सन्देशं प्रेषयतु",
      "पाटलवर्णस्य ध्वनि-संवाद-गुण्डेन सजीव-संवादं करोतु"
    ],
    userNameLabel: "बॉट-नाम",
    userNamePlaceholder: "बॉट-नाम लिखतु",
    poweredBy: "ई-मैत्री डिजिटल-मञ्चेन सञ्चालितम्।",
    settings: "सेटिंग्स्",
    language: "भाषा",
    speechRate: "भाषणस्य गतिः",
    adjustRate: "ध्वनेः गतिं व्यवस्थापयतु",
    speechPitch: "स्वरः",
    adjustPitch: "ध्वनेः स्वरं व्यवस्थापयतु",
    q1: "डिजिटल-गवर्नेंस किम् अस्ति?",
    q2: "त्रि-स्तरीय-संरचनां स्पष्टीकरोतु।",
    q3: "बूथ-प्रबन्धनं कथं कार्यं करोति?",
    q4: "पारिवारिक-गठबन्धन-आन्दोलनं किम् अस्ति?",
    initialMessage: "नमस्ते जेन-जी! ई-मैत्री-पोर्टल् मध्ये भवतः स्वागतम्! वदतु मित्र, अहं भवतः कथं साहाय्यं कर्तुं शक्नोमि? भवान् काम् सूचनाम् इच्छति?",
    initialMessageWithName: "नमस्ते जेन-जी!🙏 अहं {botName} अस्मि! ई-मैत्री-पोर्टल् मध्ये भवतः स्वागतम्!✨ अहं भवतः कथं साहाय्यं कर्तुं शक्नोमि! भवान् काम् सूचनाम् इच्छति?👋",
    errorTraffic: "क्षम्यताम्, इदानीम् अत्यधिकः यातायात-भारः अस्ति अथवा कोटा समाप्तः। कृपया किञ्चित्कालानन्तरं पुनः प्रयतताम्।",
    errorTech: "क्षम्यताम्, काचित् तकनीकी समस्या अस्ति। कृपया पुनः प्रयतताम्।",
    premiumQuotaExceeded: "प्रीमियम-ध्वनि-कोटा समाप्तः। सामान्य-ध्वनौ प्रत्यागच्छति।",
    newChat: "नूतनः संवादः",
    moreOptions: "अधिक-विकल्पाः",
    chattingIn: "संवादः चलति",
    saveChat: "संवादं रक्षतु",
    enterChatName: "संवादस्य नाम लिखतु...",
    cancel: "रद्द करोतु",
    save: "रक्षतु",
    chatHistory: "संवाद-इतिहासः",
    noSavedChats: "कोऽपि रक्षितः संवादः नास्ति।",
    voiceEngine: "ध्वनि-इञ्जिनम्",
    standard: "सामान्यम्",
    premium: "प्रीमियम",
    clearChatHistory: "संवाद-इतिहासं मार्जयेत्",
    clearAll: "सर्वं मार्जयेत्",
    areYouSureClear: "किं भवान् सर्वान् रक्षितान् संवादान् मार्जयितुम् इच्छति? एतत् पुनः प्राप्तुं न शक्यते।",
    uploadImage: "चित्रं / स्क्रीनशॉट् अपलोड् करोतु",
    screenOn: "स्क्रीन ऑन",
    screenOff: "स्क्रीन ऑफ",
    stopGenerating: "निर्माणं स्थगयतु",
    maxChatsError: "भवान् केवलं १० संवादान् रक्षितुं शक्नोति। नूतनं रक्षितुं कृपया पुरातनं संवादं मार्जयेत्।",
    edit: "सम्पादयतु",
    share: "साझा करोतु",
    pinChat: "संवादं पिन करोतु",
    unpinChat: "संवादम् अनपिन करोतु",
    renameChat: "संवादस्य नाम परिवर्तयतु",
    deleteChat: "संवादं मार्जयेत्",
    loading: "लोड् भवति...",
    chooseLanguage: "स्वस्य इष्टतमां भाषां चिनोतु",
    chooseVoiceEngine: "सामान्य-प्रीमियम-एआई-ध्वन्योः मध्ये चिनोतु",
    selectPremiumVoice: "उच्च-गुणवत्तायुक्तम् एआई-ध्वनि-प्रतिरूपं चिनोतु",
    selectStandardVoice: "यन्त्रस्य ध्वनिं चिनोतु",
    autoSelect: "स्वतः चिनोतु (डिफॉल्ट्)",
    fenrirDesc: "फेनरिर (दृढः, आधिकारिकः पुरुषः)",
    charonDesc: "कैरन (शान्तः, गम्भीरः पुरुषः)",
    puckDesc: "पक (मैत्रीपूर्णः, ऊर्जावान् पुरुषः)"
  },
  sat: {
    title: "ᱱᱚᱨᱰ",
    subtitle: "ᱮᱟᱭᱤ ᱢᱮᱥᱮᱱᱡᱟᱨ, ᱤ-ᱢᱟᱭᱛᱨᱤ᱾",
    you: "ᱟᱢ",
    copy: "ᱱᱚᱠᱚᱞ ᱢᱮ",
    copied: "ᱱᱚᱠᱚᱞ ᱟᱠᱟᱱᱟ",
    listen: "ᱟᱸᱡᱚᱢ ᱢᱮ",
    stop: "ᱛᱤᱸᱜᱩ ᱢᱮ",
    back: "ᱛᱟᱭᱚᱢ",
    listenAgain: "ᱟᱨᱦᱚᱸ ᱟᱸᱡᱚᱢ ᱢᱮ",
    speaking: "ᱱᱚᱨᱰ ᱨᱚᱲ ᱮᱫᱟᱭ...",
    listening: "ᱱᱚᱨᱰ ᱟᱸᱡᱚᱢ ᱮᱫᱟᱭ...",
    thinking: "ᱩᱭᱦᱟᱹᱨ ᱮᱫᱟᱭ...",
    liveChatOn: "ᱞᱟᱭᱤᱵᱽ ᱨᱚᱯᱚᱲ ᱮᱦᱚᱵ ᱮᱱᱟ: ᱫᱟᱭᱟ ᱠᱟᱛᱮ ᱨᱚᱲ ᱢᱮ",
    stopVoiceChat: "ᱟᱲᱟᱝ ᱨᱚᱯᱚᱲ ᱛᱤᱸᱜᱩ ᱢᱮ",
    startVoiceChat: "ᱞᱟᱭᱤᱵᱽ ᱟᱲᱟᱝ ᱨᱚᱯᱚᱲ ᱮᱦᱚᱵ ᱢᱮ",
    voiceTyping: "ᱟᱲᱟᱝ ᱴᱟᱭᱯᱤᱝ",
    stopVoiceTyping: "ᱟᱲᱟᱝ ᱴᱟᱭᱯᱤᱝ ᱛᱤᱸᱜᱩ ᱢᱮ",
    speechNotSupported: "ᱱᱚᱣᱟ ᱵᱨᱟᱣᱡᱟᱨ ᱨᱮ ᱥᱯᱤᱪ ᱨᱤᱠᱚᱜᱽᱱᱤᱥᱚᱱ ᱵᱟᱹᱱᱩᱜᱼᱟ᱾",
    liveChat: "ᱞᱟᱭᱤᱵᱽ ᱨᱚᱯᱚᱲ",
    typeMessage: "ᱢᱮᱥᱮᱡᱽ ᱴᱟᱭᱤᱯ ᱢᱮ...",
    typeMessages: [
      "ᱟᱢᱟᱜ ᱢᱮᱥᱮᱡᱽ ᱱᱚᱸᱰᱮ ᱴᱟᱭᱤᱯ ᱢᱮ",
      "ᱢᱟᱭᱤᱠ ᱨᱮ ᱨᱚᱲ ᱠᱟᱛᱮ ᱢᱮᱥᱮᱡᱽ ᱵᱷᱮᱡᱟᱭ ᱢᱮ",
      "ᱜᱩᱞᱟᱹᱯᱤ ᱵᱷᱚᱭᱮᱥ ᱪᱮᱴ ᱵᱚᱛᱟᱢ ᱥᱟᱶ ᱞᱟᱭᱤᱵᱽ ᱪᱮᱴ ᱢᱮ"
    ],
    userNameLabel: "ᱵᱚᱴ ᱟᱜ ᱧᱩᱛᱩᱢ",
    userNamePlaceholder: "ᱵᱚᱴ ᱟᱜ ᱧᱩᱛᱩᱢ ᱚᱞ ᱢᱮ",
    poweredBy: "ᱤ-ᱢᱟᱭᱛᱨᱤ ᱰᱤᱡᱤᱴᱟᱞ ᱯᱞᱮᱴᱯᱷᱚᱨᱢ ᱦᱚᱛᱮᱛᱮ ᱪᱟᱞᱟᱜ ᱠᱟᱱᱟ᱾",
    settings: "ᱥᱮᱴᱤᱝᱥ",
    language: "ᱯᱟᱹᱨᱥᱤ",
    speechRate: "ᱨᱚᱲ ᱨᱮᱭᱟᱜ ᱜᱟᱹᱛᱤ",
    adjustRate: "ᱟᱲᱟᱝ ᱨᱮᱭᱟᱜ ᱜᱟᱹᱛᱤ ᱴᱷᱤᱠ ᱢᱮ",
    speechPitch: "ᱟᱲᱟᱝ ᱨᱮᱭᱟᱜ ᱥᱟᱰᱮ",
    adjustPitch: "ᱟᱲᱟᱝ ᱨᱮᱭᱟᱜ ᱥᱟᱰᱮ ᱴᱷᱤᱠ ᱢᱮ",
    q1: "ᱰᱤᱡᱤᱴᱟᱞ ᱜᱚᱵᱷᱚᱨᱱᱮᱱᱥ ᱫᱚ ᱪᱮᱫ ᱠᱟᱱᱟ?",
    q2: "ᱯᱮ-ᱛᱷᱚᱠ ᱨᱮᱭᱟᱜ ᱜᱚᱲᱦᱚᱱ ᱵᱩᱡᱷᱟᱹᱣ ᱢᱮ᱾",
    q3: "ᱵᱩᱛᱷ ᱢᱮᱱᱮᱡᱽᱢᱮᱱᱴ ᱪᱮᱫ ᱞᱮᱠᱟ ᱠᱟᱹᱢᱤᱭᱟ?",
    q4: "ᱯᱷᱮᱢᱤᱞᱤ ᱮᱞᱟᱭᱮᱱᱥ ᱢᱩᱵᱷᱢᱮᱱᱴ ᱫᱚ ᱪᱮᱫ ᱠᱟᱱᱟ?",
    initialMessage: "ᱡᱚᱦᱟᱨ ᱡᱮᱱ-ᱡᱤ! ᱤ-ᱢᱟᱭᱛᱨᱤ ᱯᱚᱨᱴᱟᱞ ᱨᱮ ᱟᱢᱟᱜ ᱥᱟᱹᱜᱩᱱ ᱫᱟᱨᱟᱢ! ᱞᱟᱹᱭ ᱢᱮ ᱜᱟᱛᱮ, ᱤᱧ ᱪᱮᱫ ᱞᱮᱠᱟᱧ ᱜᱚᱲᱚ ᱫᱟᱲᱮᱭᱟᱢᱟ? ᱟᱢ ᱪᱮᱫ ᱵᱟᱰᱟᱭ ᱥᱟᱱᱟᱭᱮᱫ ᱢᱮᱭᱟ?",
    initialMessageWithName: "ᱡᱚᱦᱟᱨ ᱡᱮᱱ-ᱡᱤ!🙏 ᱤᱧ ᱫᱚ {botName} ᱠᱟᱹᱱᱟᱹᱧ! ᱤ-ᱢᱟᱭᱛᱨᱤ ᱯᱚᱨᱴᱟᱞ ᱨᱮ ᱟᱢᱟᱜ ᱥᱟᱹᱜᱩᱱ ᱫᱟᱨᱟᱢ!✨ ᱤᱧ ᱪᱮᱫ ᱞᱮᱠᱟᱧ ᱜᱚᱲᱚ ᱫᱟᱲᱮᱭᱟᱢᱟ! ᱟᱢ ᱪᱮᱫ ᱵᱟᱰᱟᱭ ᱥᱟᱱᱟᱭᱮᱫ ᱢᱮᱭᱟ?👋",
    errorTraffic: "ᱤᱠᱟᱹ ᱠᱟᱹᱧ ᱢᱮ, ᱱᱤᱛᱚᱜ ᱟᱹᱰᱤ ᱡᱟᱹᱥᱛᱤ ᱴᱨᱟᱯᱷᱤᱠ ᱢᱮᱱᱟᱜᱼᱟ ᱥᱮ ᱠᱳᱴᱟ ᱪᱟᱵᱟ ᱟᱠᱟᱱᱟ᱾ ᱫᱟᱭᱟ ᱠᱟᱛᱮ ᱛᱟᱭᱚᱢ ᱛᱮ ᱪᱮᱥᱴᱟᱭ ᱢᱮ᱾",
    errorTech: "ᱤᱠᱟᱹ ᱠᱟᱹᱧ ᱢᱮ, ᱢᱤᱫᱴᱟᱝ ᱴᱮᱠᱱᱤᱠᱟᱞ ᱮᱴᱠᱮᱴᱚᱬᱮ ᱦᱩᱭ ᱮᱱᱟ᱾ ᱫᱟᱭᱟ ᱠᱟᱛᱮ ᱟᱨᱦᱚᱸ ᱪᱮᱥᱴᱟᱭ ᱢᱮ᱾",
    premiumQuotaExceeded: "ᱯᱨᱤᱢᱤᱭᱟᱢ ᱟᱲᱟᱝ ᱠᱳᱴᱟ ᱪᱟᱵᱟ ᱟᱠᱟᱱᱟ᱾ ᱥᱴᱮᱱᱰᱟᱨᱰ ᱟᱲᱟᱝ ᱛᱮ ᱨᱩᱣᱟᱹᱲ ᱠᱟᱱᱟ᱾",
    newChat: "ᱱᱟᱶᱟ ᱨᱚᱯᱚᱲ",
    moreOptions: "ᱟᱨᱦᱚᱸ ᱚᱯᱥᱚᱱ",
    chattingIn: "ᱨᱚᱯᱚᱲ ᱠᱟᱱᱟ",
    saveChat: "ᱨᱚᱯᱚᱲ ᱥᱟᱧᱪᱟᱣ ᱢᱮ",
    enterChatName: "ᱨᱚᱯᱚᱲ ᱨᱮᱭᱟᱜ ᱧᱩᱛᱩᱢ ᱮᱢ ᱢᱮ...",
    cancel: "ᱵᱟᱹᱛᱤᱞ ᱢᱮ",
    save: "ᱥᱟᱧᱪᱟᱣ ᱢᱮ",
    chatHistory: "ᱨᱚᱯᱚᱲ ᱱᱟᱜᱟᱢ",
    noSavedChats: "ᱚᱠᱟ ᱨᱚᱯᱚᱲ ᱦᱚᱸ ᱵᱟᱝ ᱥᱟᱧᱪᱟᱣ ᱟᱠᱟᱱᱟ᱾",
    voiceEngine: "ᱟᱲᱟᱝ ᱤᱧᱡᱤᱱ",
    standard: "ᱥᱴᱮᱱᱰᱟᱨᱰ",
    premium: "ᱯᱨᱤᱢᱤᱭᱟᱢ",
    clearChatHistory: "ᱨᱚᱯᱚᱲ ᱱᱟᱜᱟᱢ ᱯᱷᱟᱨᱪᱟᱭ ᱢᱮ",
    clearAll: "ᱡᱚᱛᱚ ᱯᱷᱟᱨᱪᱟᱭ ᱢᱮ",
    areYouSureClear: "ᱪᱮᱫ ᱟᱢ ᱥᱟᱹᱨᱤ ᱜᱮ ᱡᱚᱛᱚ ᱥᱟᱧᱪᱟᱣ ᱟᱠᱟᱱ ᱨᱚᱯᱚᱲ ᱢᱮᱴᱟᱣ ᱥᱟᱱᱟᱭᱮᱫ ᱢᱮᱭᱟ? ᱱᱚᱣᱟ ᱫᱚ ᱨᱩᱣᱟᱹᱲ ᱵᱟᱝ ᱜᱟᱱᱚᱜᱼᱟ᱾",
    uploadImage: "ᱥᱠᱨᱤᱱᱥᱚᱴ / ᱪᱤᱛᱟᱹᱨ ᱟᱯᱞᱳᱰ ᱢᱮ",
    screenOn: "ᱥᱠᱨᱤᱱ ᱚᱱ",
    screenOff: "ᱥᱠᱨᱤᱱ ᱚᱯᱷ",
    stopGenerating: "ᱵᱮᱱᱟᱣ ᱛᱤᱸᱜᱩ ᱢᱮ",
    maxChatsError: "ᱟᱢ ᱫᱚ ᱑᱐ ᱜᱚᱴᱟᱝ ᱨᱚᱯᱚᱲ ᱜᱮᱢ ᱥᱟᱧᱪᱟᱣ ᱫᱟᱲᱮᱭᱟᱜᱼᱟ᱾ ᱱᱟᱶᱟ ᱥᱟᱧᱪᱟᱣ ᱞᱟᱹᱜᱤᱫ ᱢᱟᱨᱮ ᱨᱚᱯᱚᱲ ᱢᱮᱴᱟᱣ ᱢᱮ᱾",
    edit: "ᱥᱟᱯᱲᱟᱣ ᱢᱮ",
    share: "ᱦᱟᱹᱴᱤᱧ ᱢᱮ",
    pinChat: "ᱨᱚᱯᱚᱲ ᱯᱤᱱ ᱢᱮ",
    unpinChat: "ᱨᱚᱯᱚᱲ ᱟᱱᱯᱤᱱ ᱢᱮ",
    renameChat: "ᱨᱚᱯᱚᱲ ᱨᱮᱭᱟᱜ ᱧᱩᱛᱩᱢ ᱵᱚᱫᱚᱞ ᱢᱮ",
    deleteChat: "ᱨᱚᱯᱚᱲ ᱢᱮᱴᱟᱣ ᱢᱮ",
    loading: "ᱞᱳᱰᱚᱜ ᱠᱟᱱᱟ...",
    chooseLanguage: "ᱟᱢᱟᱜ ᱠᱩᱥᱤᱭᱟᱜ ᱯᱟᱹᱨᱥᱤ ᱵᱟᱪᱷᱟᱣ ᱢᱮ",
    chooseVoiceEngine: "ᱥᱴᱮᱱᱰᱟᱨᱰ ᱟᱨ ᱯᱨᱤᱢᱤᱭᱟᱢ ᱮᱟᱭᱤ ᱟᱲᱟᱝ ᱵᱟᱪᱷᱟᱣ ᱢᱮ",
    selectPremiumVoice: "ᱱᱟᱯᱟᱭ ᱠᱣᱟᱞᱤᱴᱤ ᱮᱟᱭᱤ ᱟᱲᱟᱝ ᱢᱚᱰᱮᱞ ᱵᱟᱪᱷᱟᱣ ᱢᱮ",
    selectStandardVoice: "ᱰᱤᱵᱷᱟᱭᱤᱥ ᱨᱮᱭᱟᱜ ᱟᱲᱟᱝ ᱵᱟᱪᱷᱟᱣ ᱢᱮ",
    autoSelect: "ᱟᱡ ᱛᱮ ᱵᱟᱪᱷᱟᱣ (ᱰᱤᱯᱷᱚᱞᱴ)",
    fenrirDesc: "ᱯᱷᱮᱱᱨᱤᱨ (ᱠᱮᱴᱮᱡ, ᱚᱫᱷᱤᱠᱟᱨᱤ ᱠᱚᱲᱟ)",
    charonDesc: "ᱠᱮᱨᱚᱱ (ᱛᱷᱤᱨ, ᱥᱚᱢᱟᱱ ᱠᱚᱲᱟ)",
    puckDesc: "ᱯᱟᱠ (ᱜᱟᱛᱮ ᱞᱮᱠᱟ, ᱮᱱᱟᱨᱡᱮᱴᱤᱠ ᱠᱚᱲᱟ)"
  },
  brx: {
    title: "नॉर्ड",
    subtitle: "AI मेसेंजर, ई-मैत्री।",
    you: "नोंथां",
    copy: "कपि खालाम",
    copied: "कपि खालामबाय",
    listen: "खोनासं",
    stop: "थाद'",
    back: "उनथिं",
    listenAgain: "फिन खोनासं",
    speaking: "नॉर्ड बुंगासिनो दं...",
    listening: "नॉर्ड खोनासं-गासिनो दं...",
    thinking: "सानगासिनो दं...",
    liveChatOn: "लाइभ गारां सावरायनाय जागायबाय: अननानै बुं",
    stopVoiceChat: "गारां सावरायनायखौ थाद'हो",
    startVoiceChat: "लाइभ गारां सावरायनायखौ जागाय",
    voiceTyping: "गारां टाइपिं",
    stopVoiceTyping: "गारां टाइपिंखौ थाद'हो",
    speechNotSupported: "बे ब्राउजाराव गारां सिनायनाय गैया।",
    liveChat: "लाइभ सावरायनाय",
    typeMessage: "मेसेज टाइप खालाम...",
    typeMessages: [
      "नोंथांनि मेसेजखौ बेवहाय टाइप खालाम",
      "माइकआव बुंनानै मेसेज दैथाय",
      "गोलाफि गारां सावरायनाय बुथामजों लाइभ सावराय"
    ],
    userNameLabel: "बटनि मुं",
    userNamePlaceholder: "बटनि मुं लिर",
    poweredBy: "ई-मैत्री डिजिटल प्लेटफर्मजों सामलायजानाय।",
    settings: "सेटिंस",
    language: "राव",
    speechRate: "बुंनायनि गोख्रैथि",
    adjustRate: "गारांनि गोख्रैथिखौ थि खालाम",
    speechPitch: "गारांनि पिच",
    adjustPitch: "गारांनि पिचखौ थि खालाम",
    q1: "डिजिटल गभर्नेन्सआ मा?",
    q2: "थाम-थाखोआरि दाथायखौ बेखेव।",
    q3: "बुथ सामलायनाया माबोरै खामानि मावो?",
    q4: "नखर आफाद आन्दोलनआ मा?",
    initialMessage: "खुलुमबाय जेन-जी! ई-मैत्री पोर्टेलाव नोंथांखौ बरायबाय! बुं लोगो, आं नोंथांखौ माबोरै हेफाजाब खालामनो हागोन? नोंथांनो मा फोरमायथि नांगौ?",
    initialMessageWithName: "खुलुमबाय जेन-जी!🙏 आं {botName}! ई-मैत्री पोर्टेलाव नोंथांखौ बरायबाय!✨ आं नोंथांखौ माबोरै हेफाजाब खालामनो हागोन! नोंथांनो मा फोरमायथि नांगौ?👋",
    errorTraffic: "निमाहा हो, दा गोबां ट्राफिक दं एबा कोटा जोबबाय। अननानै उनाव नाजाफिन।",
    errorTech: "निमाहा हो, माबा मोनसे जेंना जादों। अननानै नाजाफिन।",
    premiumQuotaExceeded: "प्रिमियाम गारां कोटा जोबबाय। स्ट्यान्डार्ड गारांआव थांफिनबाय।",
    newChat: "गोदान सावरायनाय",
    moreOptions: "गोबां बासिख'नाय",
    chattingIn: "सावरायगासिनो दं",
    saveChat: "सावरायनायखौ दोनथ'",
    enterChatName: "सावरायनायनि मुं लिर...",
    cancel: "बातिल खालाम",
    save: "दोनथ'",
    chatHistory: "सावरायनायनि जारिमिन",
    noSavedChats: "जेबो दोनथ'नाय सावरायनाय गैया।",
    voiceEngine: "गारां इन्जिन",
    standard: "स्ट्यान्डार्ड",
    premium: "प्रिमियाम",
    clearChatHistory: "सावरायनायनि जारिमिनखौ हुखुमोर",
    clearAll: "गासैखौबो हुखुमोर",
    areYouSureClear: "नोंथांआ गासै दोनथ'नाय सावरायनायखौ हुखुमोरनो सानमारदोंना? बेखौ फिन लाबोनो हानाय नङा।",
    uploadImage: "स्क्रिनसट / सावगारि आपलोड खालाम",
    screenOn: "स्क्रिन अन",
    screenOff: "स्क्रिन अफ",
    stopGenerating: "दाबावनायखौ थाद'हो",
    maxChatsError: "नोंथांआ 10 सावरायनायल' दोनथ'नो हागोन। गोदान दोनथ'नो थाखाय अननानै गोजाम सावरायनायखौ हुखुमोर।",
    edit: "सुजु",
    share: "रानना हो",
    pinChat: "सावरायनायखौ पिन खालाम",
    unpinChat: "सावरायनायखौ आनपिन खालाम",
    renameChat: "सावरायनायनि मुं सोलाय",
    deleteChat: "सावरायनायखौ हुखुमोर",
    loading: "लोड जागासिनो दं...",
    chooseLanguage: "नोंथांनि मोजां मोननाय रावखौ बासिख'",
    chooseVoiceEngine: "स्ट्यान्डार्ड आरो प्रिमियाम AI गारांनि गेजेराव बासिख'",
    selectPremiumVoice: "गोजौ गुननि AI गारां मोडेलखौ बासिख'",
    selectStandardVoice: "डिभाइसनि गारांखौ बासिख'",
    autoSelect: "गावनोगाव बासिख' (डिफल्ट)",
    fenrirDesc: "फेनरिर (गोख्रै, गोहोआरि हौवा)",
    charonDesc: "कैरन (सिरि, समान हौवा)",
    puckDesc: "पाक (लोगोआरि, गोख्रै हौवा)"
  },
  mni: {
    title: "নর্ড",
    subtitle: "AI মেসেঞ্জার, ই-মৈত্রী।",
    you: "নহাক",
    copy: "কপি তৌবিয়ু",
    copied: "কপি তৌরে",
    listen: "তাবিয়ু",
    stop: "লেপ্পিয়ু",
    back: "হন্দোকপিয়ু",
    listenAgain: "অমুক হন্না তাবিয়ু",
    speaking: "নর্ড ঙাংলি...",
    listening: "নর্ড তালি...",
    thinking: "খল্লি...",
    liveChatOn: "লাইভ ভোইস চ্যাট ওন তৌরে: চানবীদুনা ঙাংবিয়ু",
    stopVoiceChat: "ভোইস চ্যাট লেপ্পিয়ু",
    startVoiceChat: "লাইভ ভোইস চ্যাট হৌবিয়ু",
    voiceTyping: "ভোইস টাইপিং",
    stopVoiceTyping: "ভোইস টাইপিং লেপ্পিয়ু",
    speechNotSupported: "ব্রাউজার অসিদা স্পীচ রিকগনিশন সাপোর্ট তৌদে।",
    liveChat: "লাইভ চ্যাট",
    typeMessage: "মেসেজ টাইপ তৌবিয়ু...",
    typeMessages: [
      "নহাক্কী মেসেজ মফম অসিদা টাইপ তৌবিয়ু",
      "মাইক্তা ঙাংদুনা মেসেজ থাবিয়ু",
      "পিঙ্ক ভোইস চ্যাট বটনগা লোয়ননা লাইভ চ্যাট তৌবিয়ু"
    ],
    userNameLabel: "বোটকী মমিং",
    userNamePlaceholder: "বোটকী মমিং ইবিয়ু",
    poweredBy: "ই-মৈত্রী ডিজিটাল প্লাটফর্মনা পাউবা।",
    settings: "সেটিংস",
    language: "লোন",
    speechRate: "ঙাংবগী খোংজেল",
    adjustRate: "খোঞ্জেলগী খোংজেল শেমদোকপিয়ু",
    speechPitch: "খোল্লেল",
    adjustPitch: "খোল্লেল শেমদোকপিয়ু",
    q1: "ডিজিটাল গভর্নেন্স হায়বসি করিনো?",
    q2: "থ্রি-টিয়ার স্ট্রাকচরগী মরমদা তাকপিয়ু।",
    q3: "বুথ ম্যানেজমেন্টনা করম্না থবক তৌবগে?",
    q4: "ফ্যামিলি এলায়েন্স মুভমেন্ট হায়বসি করিনো?",
    initialMessage: "খুরুমজরি জেন-জি! ই-মৈত্রী পোর্টেলদা তরাম্না ওকচরি! হায়বিয়ু মরুপ, ঐনা নহাক্কী করম্না মতেং পাংবা ঙমগনি? নহাক্না করি ইনফরমেশন পাম্বিগে?",
    initialMessageWithName: "খুরুমজরি জেন-জি!🙏 ঐ {botName} নি! ই-মৈত্রী পোর্টেলদা তরাম্না ওকচরি!✨ ঐনা নহাক্কী করম্না মতেং পাংবা ঙমগনি! নহাক্না করি ইনফরমেশন পাম্বিগে?👋",
    errorTraffic: "ঙাকপিয়ু, হৌজিক য়াম্না ট্রাফিক লৈ নত্রগা কোটা লোইরে। চানবীদুনা মতুংদা অমুক হন্না হোত্নবিয়ু।",
    errorTech: "ঙাকপিয়ু, টেকনিকেল ওইবা অৱাবা অমা লৈরে। চানবীদুনা অমুক হন্না হোত্নবিয়ু।",
    premiumQuotaExceeded: "প্রিমিয়াম ভোইস কোটা লোইরে। স্ট্যান্ডার্ড ভোইসতা হন্দোক্লে।",
    newChat: "অনোউবা চ্যাট",
    moreOptions: "অতোপ্পা অপশনশিং",
    chattingIn: "চ্যাট তৌরি",
    saveChat: "চ্যাট সেভ তৌবিয়ু",
    enterChatName: "চ্যাটকী মিং থোনবিয়ু...",
    cancel: "কেন্সেল তৌবিয়ু",
    save: "সেভ তৌবিয়ু",
    chatHistory: "চ্যাট হিস্ট্রি",
    noSavedChats: "সেভ তৌবা চ্যাট অমত্তা লৈতে।",
    voiceEngine: "খোঞ্জেল ইঞ্জিন",
    standard: "স্ট্যান্ডার্ড",
    premium: "প্রিমিয়াম",
    clearChatHistory: "চ্যাট হিস্ট্রি মুত্থত্পিয়ু",
    clearAll: "পুম্নমক মুত্থত্পিয়ু",
    areYouSureClear: "নহাক্না সেভ তৌবা চ্যাট পুম্নমক মুত্থত্পা পাম্ব্রা? অসি অমুক হন্না ফংলোই।",
    uploadImage: "স্ক্রিনশট / ফটো আপলোড তৌবিয়ু",
    screenOn: "স্ক্রিন ওন",
    screenOff: "স্ক্রিন ওফ",
    stopGenerating: "শেম্বা লেপ্পিয়ু",
    maxChatsError: "নহাক্না চ্যাট ১০ খক্তমক সেভ তৌবা য়াই। অনোউবা সেভ তৌনবা চানবীদুনা অরিবা চ্যাট অমা মুত্থত্পিয়ু।",
    edit: "শেমদোকপিয়ু",
    share: "শেয়ার তৌবিয়ু",
    pinChat: "চ্যাট পিন তৌবিয়ু",
    unpinChat: "চ্যাট আনপিন তৌবিয়ু",
    renameChat: "চ্যাটকী মিং হোংবিয়ু",
    deleteChat: "চ্যাট মুত্থত্পিয়ু",
    loading: "লোড তৌরি...",
    chooseLanguage: "নহাক্না পাম্বা লোন খনখত্পিয়ু",
    chooseVoiceEngine: "স্ট্যান্ডার্ড অমসুং প্রিমিয়াম AI খোঞ্জেলগী মরক্তা খনখত্পিয়ু",
    selectPremiumVoice: "মগুন ৱাংবা AI ভোইস মডেল খনখত্পিয়ু",
    selectStandardVoice: "ডিভাইসকী খোঞ্জেল খনখত্পিয়ু",
    autoSelect: "ওটো সিলেক্ট (ডিফল্ট)",
    fenrirDesc: "ফেনরির (মপাঙ্গল কনবা, ওথোরিটেটিভ নুপা)",
    charonDesc: "ক্যারন (শান্ত ওইবা, মেজার্ড নুপা)",
    puckDesc: "পাক (মরুপ ওইবা, এনার্জেটিক নুপা)"
  }
};

const VirtualNetworkBackground = () => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none bg-[#fdfbf7]">
      {/* Base Tech Image */}
      <div 
        className="absolute inset-0 opacity-100"
        style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #f9f8f6 100%)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      {/* Network Nodes & Lines */}
      <div className="absolute inset-0 opacity-40">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(59, 130, 246, 0.2)" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          {/* Animated connection lines */}
          <g stroke="rgba(59, 130, 246, 0.4)" strokeWidth="2" fill="none">
            <path d="M 10 150 Q 150 200 300 100 T 600 300" className="animate-pulse" />
            <path d="M 800 100 Q 600 250 400 400 T 100 600" className="animate-pulse" style={{ animationDelay: '1s' }} />
            <path d="M 200 800 Q 400 600 700 700 T 1000 500" className="animate-pulse" style={{ animationDelay: '2s' }} />
          </g>
          
          {/* Glowing Nodes */}
          <circle cx="600" cy="300" r="5" fill="#60a5fa" className="animate-ping" style={{ animationDelay: '0.5s' }} />
          <circle cx="400" cy="400" r="4" fill="#fbbf24" className="animate-ping" style={{ animationDelay: '1.5s' }} />
          <circle cx="700" cy="700" r="6" fill="#a78bfa" className="animate-ping" style={{ animationDelay: '2.5s' }} />
        </svg>
      </div>
    </div>
  );
};

const guessGender = (name: string): 'M' | 'F' => {
  if (!name) return 'M';
  const lowerName = name.trim().toLowerCase();
  
  const femaleSuffixes = [
    'a', 'i', 'ee', 'ya', 'na', 'ta', 'ra', 'la', 'ka', 'sa', 'ha', 'ma', 'wati', 'vati', 'devi', 'bai', 'kumari', 'kaur', 'ben', 'bibi', 'bano', 'begum', 'khatoon', 'nisa',
    'ा', 'ि', 'ी', '्या', 'ना', 'ता', 'रा', 'ला', 'का', 'सा', 'हा', 'मा', 'वती', 'देवी', 'बाई', 'कुमारी', 'कौर', 'बेन', 'बीबी', 'बानो', 'बेगम', 'खातून', 'निसा'
  ];
  
  const maleExceptions = [
    'shiva', 'krishna', 'aditya', 'rama', 'rishi', 'ravi', 'hari', 'murali', 'gopi', 'kavi', 'mani', 'swami', 'yogi', 'bhai', 'singh', 'kumar', 'nath', 'das', 'ram', 'raj', 'ji', 'rahul', 'amit', 'suresh', 'ramesh', 'mahesh', 'dinesh', 'prasad',
    'शिवा', 'कृष्णा', 'आदित्य', 'रामा', 'ऋषि', 'रवि', 'हरि', 'मुरली', 'गोपी', 'कवि', 'मणि', 'स्वामी', 'योगी', 'भाई', 'सिंह', 'कुमार', 'नाथ', 'दास', 'राम', 'राज', 'जी', 'राहुल', 'अमित', 'सुरेश', 'रमेश', 'महेश', 'दिनेश', 'प्रसाद'
  ];
  
  for (const exc of maleExceptions) {
    if (lowerName.endsWith(exc) || lowerName === exc) return 'M';
  }
  
  for (const suf of femaleSuffixes) {
    if (lowerName.endsWith(suf)) return 'F';
  }
  
  return 'M';
};

export default function App() {
  const [uiLang, setUiLang] = useState(() => {
    try {
      return safeStorage.getItem('uiLang_v2') || 'en';
    } catch (e) {
      return 'en';
    }
  });
  
  useEffect(() => {
    safeStorage.setItem('uiLang_v2', uiLang);
  }, [uiLang]);

  const t = translations[uiLang] || translations['en'];

  const [input, setInput] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [placeholderText, setPlaceholderText] = useState('');

  const [userName, setUserName] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlBotName = urlParams.get('botName');
      if (urlBotName) {
        // Remove it from URL so it doesn't override future changes on reload
        urlParams.delete('botName');
        const newSearch = urlParams.toString();
        const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
        
        safeStorage.setItem('userName_v1', urlBotName);
        return urlBotName;
      }
      return safeStorage.getItem('userName_v1') || '';
    } catch (e) {
      return '';
    }
  });

  const [setupName, setSetupName] = useState('');
  const [isEditingBotName, setIsEditingBotName] = useState(false);

  const displayBotName = userName || (uiLang === 'hi' ? 'नॉर्ड' : 'Nard');

  useEffect(() => {
    document.title = userName ? `${userName} - E-MAITRI` : 'Gen-Z - AI Assistant, E-MAITRI';
  }, [userName]);

  const getGenderAdjustedText = (text: string, lang: string, name: string) => {
    let replaced = text.replace(/Nard|नॉर्ड|নর্ড|நார்ட்|నార్డ్|નોર્ડ|ನಾರ್ಡ್|നോർഡ്|ନର୍ଡ|ਨਾਰਡ|نارڈ|نارڊ|ᱱᱚᱨᱰ|જેન-જી|ജെൻ-ജി|ਜੇਨ-ਜੀ/gi, name);
    const gender = guessGender(name);
    
    if (gender === 'F') {
      if (lang === 'hi') {
        replaced = replaced.replace(/रहे हैं/g, 'रही हैं');
      } else if (lang === 'bho') {
        replaced = replaced.replace(/रहल बाड़े/g, 'रहल बाड़ी');
      } else if (lang === 'gu') {
        replaced = replaced.replace(/રહ્યા છે/g, 'રહી છે');
      } else if (lang === 'pa') {
        replaced = replaced.replace(/ਰਹੇ ਹਨ/g, 'ਰਹੀ ਹੈ');
      } else if (lang === 'ur') {
        replaced = replaced.replace(/رہے ہیں/g, 'رہی ہیں');
      } else if (lang === 'sd') {
        replaced = replaced.replace(/رهيو آهي/g, 'رهي آهي');
      } else if (lang === 'doi') {
        replaced = replaced.replace(/करदा ऐ/g, 'करदी ऐ')
                           .replace(/सुनदा ऐ/g, 'सुनदी ऐ')
                           .replace(/सोचदा ऐ/g, 'सोचदी ऐ');
      }
    }
    return replaced;
  };

  const getInitialMessage = (lang: string, name: string) => {
    const trans = translations[lang] || translations['en'];
    const trimmedName = name.trim();
    if (!trimmedName) {
      const defaultName = lang === 'hi' ? 'नॉर्ड' : 'Nard';
      let msg = trans.initialMessageWithName.replace(/\{botName\}/g, defaultName);
      const gender = guessGender(defaultName);
      
      if (gender === 'F') {
        if (lang === 'hi') {
          msg = msg.replace('सकता हूं', 'सकती हूं');
        } else if (lang === 'mr') {
          msg = msg.replace('शकतो', 'शकते');
        } else if (lang === 'pa') {
          msg = msg.replace('ਸਕਦਾ ਹਾਂ', 'ਸਕਦੀ ਹਾਂ');
        } else if (lang === 'ur') {
          msg = msg.replace('سکتا ہوں', 'سکتی ہوں');
        } else if (lang === 'sd') {
          msg = msg.replace('سگهان ٿو', 'سگهان ٿي');
        } else if (lang === 'doi') {
          msg = msg.replace('सकनां', 'सकनी आं');
        }
      }
      return msg;
    }
    let msg = trans.initialMessageWithName.replace(/\{botName\}/g, trimmedName);
    const gender = guessGender(trimmedName);
    
    if (gender === 'F') {
      if (lang === 'hi') {
        msg = msg.replace('सकता हूं', 'सकती हूं');
      } else if (lang === 'mr') {
        msg = msg.replace('शकतो', 'शकते');
      } else if (lang === 'pa') {
        msg = msg.replace('ਸਕਦਾ ਹਾਂ', 'ਸਕਦੀ ਹਾਂ');
      } else if (lang === 'ur') {
        msg = msg.replace('سکتا ہوں', 'سکتی ہوں');
      } else if (lang === 'sd') {
        msg = msg.replace('سگهان ٿو', 'سگهان ٿي');
      } else if (lang === 'doi') {
        msg = msg.replace('सकनां', 'सकनी आं');
      }
    }
    return msg;
  };

  const [messages, setMessages] = useState<Message[]>(() => {
    // We need to read userName directly here for initial state
    let initialName = '';
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlBotName = urlParams.get('botName');
      if (urlBotName) {
        initialName = urlBotName;
      } else {
        initialName = safeStorage.getItem('userName_v1') || '';
      }
    } catch (e) {}
    return [{ id: '1', role: 'model', text: getInitialMessage(uiLang, initialName) }];
  });

  // Update initial message when language or bot name changes if it's the only message
  useEffect(() => {
    setMessages(prev => {
      if (prev.length === 1 && (prev[0].id === '1' || prev[0].id === '1-model')) {
        return [{ ...prev[0], text: getInitialMessage(uiLang, userName) }];
      }
      return prev;
    });
  }, [uiLang, userName]);

  useEffect(() => {
    try {
      safeStorage.setItem('userName_v1', userName);
    } catch (e) {
      // Ignore storage errors
    }
  }, [userName]);

  useEffect(() => {
    let i = 0;
    let messageIndex = 0;
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const messages = (t.typeMessages || [t.typeMessage]).map((msg: string) => 
      msg.replace(/Nard|नॉर्ड|নর্ড|நார்ட்|నార్డ్|નોર્ડ|ನಾರ್ಡ್|നോർഡ്|ନର୍ଡ|ਨਾਰਡ|نارڈ|نارڊ|ᱱᱚᱨᱰ/gi, displayBotName)
    );

    const typeWriter = () => {
      if (!isMounted) return;
      
      const currentMessage = messages[messageIndex];
      
      if (i < currentMessage.length) {
        setPlaceholderText(currentMessage.substring(0, i + 1));
        i++;
        timeoutId = setTimeout(typeWriter, 100);
      } else {
        timeoutId = setTimeout(() => {
          if (!isMounted) return;
          i = 0;
          messageIndex = (messageIndex + 1) % messages.length;
          setPlaceholderText("");
          typeWriter();
        }, 3000);
      }
    };

    typeWriter();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [t.typeMessage, t.typeMessages, displayBotName]);

  const [selectedImage, setSelectedImage] = useState<{data: string, mimeType: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (placeholderRef.current) {
      placeholderRef.current.scrollTop = placeholderRef.current.scrollHeight;
    }
  }, [placeholderText]);

  const [editMsgId, setEditMsgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Chat History States
  const [savedChats, setSavedChats] = useState<SavedChat[]>(() => {
    try {
      const saved = safeStorage.getItem('savedChats_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to parse saved chats:", e);
      return [];
    }
  });
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [chatNameInput, setChatNameInput] = useState('');
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingChatName, setEditingChatName] = useState('');

  useEffect(() => {
    safeStorage.setItem('savedChats_v1', JSON.stringify(savedChats));
  }, [savedChats]);

  useEffect(() => {
    // Only save currentChatId to storage if needed, but we don't persist current messages across reloads anymore
    if (currentChatId) {
      safeStorage.setItem('currentChatId_v1', currentChatId);
    } else {
      safeStorage.removeItem('currentChatId_v1');
    }
  }, [currentChatId]);

  // Sync messages to the current saved chat
  useEffect(() => {
    if (currentChatId && messages.length > 0) {
      setSavedChats(prev => {
        const existingChat = prev.find(chat => chat.id === currentChatId);
        // Only update if messages actually changed to avoid unnecessary timestamp updates
        if (existingChat && JSON.stringify(existingChat.messages) === JSON.stringify(messages)) {
          return prev;
        }
        return prev.map(chat => 
          chat.id === currentChatId ? { ...chat, messages, timestamp: Date.now() } : chat
        );
      });
    }
  }, [messages, currentChatId]);

  const [isLive, setIsLive] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [latestFrame, setLatestFrame] = useState<string | null>(null);
  const [isVoiceTyping, setIsVoiceTyping] = useState(false);
  const recognitionRef = useRef<any>(null);
  const voiceTypingTranscriptRef = useRef('');
  const [liveTranscript, setLiveTranscript] = useState<Message[]>([]);
  const liveTranscriptRef = useRef<Message[]>([]);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const isModelSpeakingRef = useRef(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [playingTextIndex, setPlayingTextIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState<string | null>(null);
  
  // Close more menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [useFastModel, setUseFastModel] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Handle back button to close settings
  useEffect(() => {
    if (showSettings) {
      window.history.pushState({ settingsOpen: true }, '');
    }

    const handlePopState = (event: PopStateEvent) => {
      if (showSettings) {
        setShowSettings(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [showSettings]);
  const [error, setError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [speechRate, setSpeechRate] = useState(() => parseFloat(safeStorage.getItem('speechRate_v4') || '0.8'));
  const [speechPitch, setSpeechPitch] = useState(() => parseFloat(safeStorage.getItem('speechPitch_v4') || '1.0'));
  const [selectedVoiceURI, setSelectedVoiceURI] = useState(() => safeStorage.getItem('selectedVoiceURI') || '');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceEngine, setVoiceEngine] = useState<'standard' | 'premium'>(() => (safeStorage.getItem('voiceEngine_v3') as 'standard' | 'premium') || 'premium');
  const [premiumVoice, setPremiumVoice] = useState(() => {
    const saved = safeStorage.getItem('premiumVoice');
    if (saved) return saved;
    let initialName = '';
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlBotName = urlParams.get('botName');
      if (urlBotName) {
        initialName = urlBotName;
      } else {
        const savedName = safeStorage.getItem('userName');
        if (savedName) initialName = savedName;
      }
    } catch (e) {
      console.error('Error reading initial name for voice:', e);
    }
    const displayInitialName = initialName || (safeStorage.getItem('uiLang') === 'hi' ? 'नॉर्ड' : 'Nard');
    const gender = guessGender(displayInitialName);
    return gender === 'F' ? 'Zephyr' : 'Charon';
  });

  // Auto-sync voice with bot name
  useEffect(() => {
    const currentName = userName || (uiLang === 'hi' ? 'नॉर्ड' : 'Nard');
    const gender = guessGender(currentName);
    const expectedVoice = gender === 'F' ? 'Zephyr' : 'Charon';
    
    // Only update if the current voice doesn't match the expected gender
    // This allows users to manually select a different voice of the SAME gender if they want,
    // but ensures a female name gets a female voice and a male name gets a male voice.
    const isCurrentVoiceFemale = ['Zephyr', 'Kore'].includes(premiumVoice);
    const isExpectedVoiceFemale = gender === 'F';
    
    if (isCurrentVoiceFemale !== isExpectedVoiceFemale) {
      setPremiumVoice(expectedVoice);
      safeStorage.setItem('premiumVoice', expectedVoice);
    }
  }, [userName, uiLang, premiumVoice]);

  // Clear setupName when userName is cleared so the setup box is empty when it reappears
  useEffect(() => {
    if (!userName) {
      setSetupName('');
    }
  }, [userName]);

  // Link global setError to the component state
  useEffect(() => {
    globalSetError = (msg: string | null) => {
      if (msg === "Traffic limit exceeded. Please try again later.") {
        setError(t.errorTraffic);
      } else {
        setError(msg);
      }
    };
    return () => {
      globalSetError = null;
    };
  }, [t.errorTraffic]);

  // Auto-clear error notification after 10 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [error]);
  
  const speechRateRef = useRef(speechRate);
  const speechPitchRef = useRef(speechPitch);
  const selectedVoiceURIRef = useRef(selectedVoiceURI);
  const voiceEngineRef = useRef(voiceEngine);
  const premiumVoiceRef = useRef(premiumVoice);
  const premiumAudioRef = useRef<HTMLAudioElement | null>(null);
  const premiumAudioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioCacheRef = useRef<Record<string, string>>({});
  const premiumVoiceDisabledUntilRef = useRef<number>(0);
  
  // Avatar Animation values
  const PATH_CLOSED = "M 75 135 Q 100 155 125 135 Q 100 155 75 135";
  // 12 Hindi Vowels
  const PATH_A_SHORT = "M 75 135 Q 100 160 125 135 Q 100 137 75 135"; // अ
  const PATH_AA = "M 75 135 Q 100 200 125 135 Q 100 133 75 135"; // आ
  const PATH_I = "M 70 135 Q 100 155 130 135 Q 100 136 70 135"; // इ
  const PATH_II = "M 65 135 Q 100 150 135 135 Q 100 133 65 135"; // ई
  const PATH_U = "M 85 135 Q 100 160 115 135 Q 100 133 85 135"; // उ
  const PATH_UU = "M 90 135 Q 100 155 110 135 Q 100 133 90 135"; // ऊ
  const PATH_E = "M 70 135 Q 100 165 130 135 Q 100 133 70 135"; // ए
  const PATH_AI = "M 65 135 Q 100 185 135 135 Q 100 133 65 135"; // ऐ
  const PATH_O = "M 80 135 Q 100 185 120 135 Q 100 133 80 135"; // ओ
  const PATH_AU = "M 75 135 Q 100 195 125 135 Q 100 133 75 135"; // औ
  const PATH_AM = "M 75 135 Q 100 150 125 135 Q 100 136 75 135"; // अं
  const PATH_AH = "M 75 135 Q 100 170 125 135 Q 100 133 75 135"; // अः
  const mouthPath = useMotionValue(PATH_CLOSED);

  // Chat History Functions
  const handleSaveChat = () => {
    if (!chatNameInput.trim()) return;
    
    if (savedChats.length >= 10) {
      setError(t.maxChatsError);
      setIsSaveModalOpen(false);
      return;
    }

    const newChat: SavedChat = {
      id: Date.now().toString(),
      name: chatNameInput.trim(),
      messages: [...messages],
      timestamp: Date.now()
    };
    setSavedChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    setIsSaveModalOpen(false);
    setChatNameInput('');
  };

  const handleLoadChat = (chat: SavedChat) => {
    setMessages(chat.messages);
    setCurrentChatId(chat.id);
    setIsHistoryOpen(false);
  };

  const handleDeleteChat = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSavedChats(prev => prev.filter(c => c.id !== id));
    if (currentChatId === id) {
      handleNewChat();
    }
  };

  const handleNewChat = () => {
    stopMessageAudio();
    setMessages([{ id: '1', role: 'model', text: getInitialMessage(uiLang, userName) }]);
    setCurrentChatId(null);
    setIsHistoryOpen(false);
  };

  const handleTogglePin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSavedChats(prev => prev.map(chat => 
      chat.id === id ? { ...chat, isPinned: !chat.isPinned } : chat
    ));
  };

  const handleStartRename = (e: React.MouseEvent, chat: SavedChat) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditingChatName(chat.name);
  };

  const handleSaveRename = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!editingChatName.trim() || !editingChatId) {
      setEditingChatId(null);
      return;
    }
    setSavedChats(prev => prev.map(chat => 
      chat.id === editingChatId ? { ...chat, name: editingChatName.trim() } : chat
    ));
    setEditingChatId(null);
  };

  const handleCancelRename = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingChatId(null);
    setEditingChatName('');
  };

  // Initialize premium audio element
  useEffect(() => {
    if (!premiumAudioRef.current) {
      premiumAudioRef.current = new Audio();
      premiumAudioRef.current.crossOrigin = "anonymous";
    }
    return () => {
      if (premiumAudioRef.current) {
        premiumAudioRef.current.pause();
        premiumAudioRef.current.src = '';
      }
    };
  }, []);

  useEffect(() => {
    safeStorage.setItem('voiceEngine_v3', voiceEngine);
    voiceEngineRef.current = voiceEngine;
    
    if (playingMessageIdRef.current && !isPaused) {
      const msgId = playingMessageIdRef.current;
      const msg = messages.find(m => m.id === msgId || m.id + '-model' === msgId);
      if (msg) {
        const { mainText } = parseMessage(msg.text);
        const timer = setTimeout(() => {
          playMessageAudio(mainText, msgId, currentTextIndexRef.current, true);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [voiceEngine]);

  useEffect(() => {
    safeStorage.setItem('premiumVoice', premiumVoice);
    premiumVoiceRef.current = premiumVoice;
    
    if (playingMessageIdRef.current && !isPaused && voiceEngine === 'premium') {
      const msgId = playingMessageIdRef.current;
      const msg = messages.find(m => m.id === msgId || m.id + '-model' === msgId);
      if (msg) {
        const { mainText } = parseMessage(msg.text);
        const timer = setTimeout(() => {
          playMessageAudio(mainText, msgId, currentTextIndexRef.current, true);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [premiumVoice]);

  // Load available voices
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      const currentName = userName || (uiLang === 'hi' ? 'नॉर्ड' : 'Nard');
      const gender = guessGender(currentName);
      
      const femaleNames = [
        'kalpana', 'lekha', 'aditi', 'female', 'woman', 'girl', 'lady',
        'neerja', 'pallavi', 'vani', 'swara', 'zira', 'samantha', 'victoria', 'hazel', 'susan',
        '-standard-a', '-standard-d', '-standard-e', '-standard-f',
        '-wavenet-a', '-wavenet-d', '-wavenet-e', '-wavenet-f',
        '-neural-a', '-neural-d', '-neural-e', '-neural-f',
        '-neural2-a', '-neural2-d', '-neural2-e', '-neural2-f'
      ];

      const filteredVoices = allVoices.filter(v => {
        const name = v.name.toLowerCase();
        const isFemale = femaleNames.some(f => name.includes(f));
        return gender === 'F' ? isFemale : !isFemale;
      });
      
      const voicesToSet = filteredVoices.length > 0 ? filteredVoices : allVoices;
      setAvailableVoices(voicesToSet);
      
      // Auto-select the best voice if none is selected or the current one doesn't match the gender
      let needsNewVoice = false;
      if (selectedVoiceURIRef.current) {
        const stillExists = voicesToSet.some(v => v.voiceURI === selectedVoiceURIRef.current);
        if (!stillExists) {
          needsNewVoice = true;
        }
      } else {
        needsNewVoice = true;
      }

      if (needsNewVoice && voicesToSet.length > 0) {
        const langPrefix = uiLang.split('-')[0];
        const matchingVoices = voicesToSet.filter(v => v.lang.toLowerCase().includes(langPrefix) || v.lang.toLowerCase().includes(uiLang.toLowerCase()));
        
        let bestVoice = null;
        if (gender === 'F') {
          bestVoice = matchingVoices[0] || voicesToSet[0];
        } else {
          bestVoice = matchingVoices.find(v => {
            const name = v.name.toLowerCase();
            return name.includes('google uk english male') ||
                   name.includes('daniel') ||
                   name.includes('arthur') ||
                   name.includes('hi-in-x-hie-local') ||
                   name.includes('hi-in-x-hie') ||
                   name.includes('-wavenet-b') ||
                   name.includes('-neural2-b');
          }) || matchingVoices.find(v => {
            const name = v.name.toLowerCase();
            return name.includes('hemant') || 
                   name.includes('rishi') || 
                   name.includes('male') ||
                   name.includes('-standard-b') || 
                   name.includes('-standard-c') || 
                   name.includes('-wavenet-c');
          }) || matchingVoices[0] || voicesToSet[0];
        }
        
        if (bestVoice) {
          setSelectedVoiceURI(bestVoice.voiceURI);
          selectedVoiceURIRef.current = bestVoice.voiceURI;
        }
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, [userName, uiLang]);

  // Save selected voice
  useEffect(() => {
    safeStorage.setItem('selectedVoiceURI', selectedVoiceURI);
    selectedVoiceURIRef.current = selectedVoiceURI;
    
    // If audio is currently playing, restart it with the new voice
    if (playingMessageIdRef.current && !isPaused) {
      const msgId = playingMessageIdRef.current;
      const msg = messages.find(m => m.id === msgId || m.id + '-model' === msgId);
      if (msg) {
        const { mainText } = parseMessage(msg.text);
        // Small delay to prevent stuttering
        const timer = setTimeout(() => {
          playMessageAudio(mainText, msgId, currentTextIndexRef.current, true);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [selectedVoiceURI]);

  // Save speech settings and restart audio if playing
  useEffect(() => {
    safeStorage.setItem('speechRate_v4', speechRate.toString());
    speechRateRef.current = speechRate;
    
    // If audio is currently playing, restart it with the new rate
    if (playingMessageIdRef.current && !isPaused) {
      const msgId = playingMessageIdRef.current;
      const msg = messages.find(m => m.id === msgId || m.id + '-model' === msgId);
      if (msg) {
        const { mainText } = parseMessage(msg.text);
        // Small delay to prevent stuttering if sliding quickly
        const timer = setTimeout(() => {
          playMessageAudio(mainText, msgId, currentTextIndexRef.current, true);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [speechRate]);

  useEffect(() => {
    safeStorage.setItem('speechPitch_v4', speechPitch.toString());
    speechPitchRef.current = speechPitch;
    
    // If audio is currently playing, restart it with the new pitch
    if (playingMessageIdRef.current && !isPaused) {
      const msgId = playingMessageIdRef.current;
      const msg = messages.find(m => m.id === msgId || m.id + '-model' === msgId);
      if (msg) {
        const { mainText } = parseMessage(msg.text);
        // Small delay to prevent stuttering if sliding quickly
        const timer = setTimeout(() => {
          playMessageAudio(mainText, msgId, currentTextIndexRef.current, true);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [speechPitch]);

  // Zero-Delay Voice Setup (First Launch)
  useEffect(() => {
    if (!window.speechSynthesis) return;
    let initialized = false;
    
    const setupVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0 && !initialized) {
        initialized = true;
        // Just fetching the voices ensures they are loaded and ready for zero-delay playback
        // We look for the preferred Charon-like male voice to ensure it's available
        const preferredVoice = voices.find(v => {
          const name = v.name.toLowerCase();
          return name.includes('google uk english male') ||
                 name.includes('daniel') ||
                 name.includes('arthur') ||
                 name.includes('hi-in-x-hie-local') ||
                 name.includes('hi-in-x-hie') ||
                 name.includes('-wavenet-b') ||
                 name.includes('-neural2-b');
        });
        if (preferredVoice) {
          console.log("Zero-Delay Voice Setup: Best Charon-like Male Voice loaded:", preferredVoice.name);
        }
        
        // Create a silent utterance to initialize the TTS engine in the background
        // This prevents the delay on the first actual speech
        try {
          const silentUtterance = new SpeechSynthesisUtterance('');
          silentUtterance.volume = 0;
          silentUtterance.rate = 0.9;
          silentUtterance.pitch = 0.8;
          if (preferredVoice) {
            silentUtterance.voice = preferredVoice;
          }
          window.speechSynthesis.speak(silentUtterance);
        } catch (e) {
          console.warn("Failed to initialize silent TTS", e);
        }
      }
    };

    setupVoices();
    window.speechSynthesis.onvoiceschanged = setupVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const handleCopy = (text: string, id: string) => {
    if (!text) return;
    // Don't copy the suggested questions part
    const cleanText = text.split('---SUGGESTED_QUESTIONS---')[0].trim();
    navigator.clipboard.writeText(cleanText);
    setCopiedMessageId(id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };
  
  const handleShare = async (text: string) => {
    if (!text) return;
    const cleanText = text.split('---SUGGESTED_QUESTIONS---')[0].trim();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${displayBotName} Response`,
          text: cleanText,
        });
      } catch (error) {
        console.warn('Error sharing:', error);
      }
    } else {
      // Fallback to copy if share is not supported
      navigator.clipboard.writeText(cleanText);
      setError(t.copied);
    }
  };
  
  const parseMessage = (text: string) => {
    if (!text) return { mainText: '', questions: [] };
    const parts = text.split('---SUGGESTED_QUESTIONS---');
    // Ensure all single newlines become double newlines to force proper paragraph breaks,
    // but don't add extra newlines if there are already multiple.
    const mainText = parts[0].trim().replace(/(?<!\n)\r?\n(?!\r?\n)/g, '\n\n');
    const questions: string[] = [];
    
    if (parts.length > 1) {
      const questionsText = parts[1].trim();
      const lines = questionsText.split('\n');
      for (const line of lines) {
        const match = line.match(/^\d+\.\s*(.*)/);
        if (match && match[1]) {
          // Remove any markdown bolding that might have been added
          questions.push(match[1].replace(/\*\*/g, '').trim());
        }
      }
    }
    
    return { mainText, questions };
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const playingMessageIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Live API Refs
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const isSessionActiveRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextAudioTimeRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const activeAudioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const silentOscillatorRef = useRef<OscillatorNode | null>(null);
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);
  const avatarContainerRef = useRef<HTMLDivElement>(null);
  const mouthRef = useRef<SVGPathElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isMicMutedRef = useRef(false);
  const isScreenSharingRef = useRef(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenIntervalRef = useRef<number | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);

  // TTS Refs
  const ttsAudioContextRef = useRef<AudioContext | null>(null);
  const ttsSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const currentTextIndexRef = useRef<number>(0);
  const currentTextRef = useRef<string>('');
  const startTimeRef = useRef<number>(0);
  const lastStartIndexRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageCountRef = useRef<number>(messages.length);
  const prevPlayingMessageIdRef = useRef<string | null>(null);

  // Scroll to bottom when audio finishes
  useEffect(() => {
    if (prevPlayingMessageIdRef.current !== null && playingMessageId === null) {
      const container = document.getElementById('main-scroll-container');
      if (container) {
        setTimeout(() => {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        }, 100);
      }
    }
    prevPlayingMessageIdRef.current = playingMessageId;
  }, [playingMessageId]);

  // Scroll to bottom when exiting live chat
  useEffect(() => {
    if (!isLive) {
      const container = document.getElementById('main-scroll-container');
      if (container) {
        setTimeout(() => {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        }, 100);
      }
    }
  }, [isLive]);

  // Scroll logic
  useEffect(() => {
    if (!playingMessageId) {
      const container = document.getElementById('main-scroll-container');
      if (container) {
        const isNewMessage = messages.length > lastMessageCountRef.current;
        lastMessageCountRef.current = messages.length;

        if (isNewMessage) {
          const lastMsg = messages[messages.length - 1];
          if (lastMsg && lastMsg.role === 'model') {
            // New model message: scroll to its header to keep it stable
            setTimeout(() => {
              const headerEl = document.getElementById(`message-header-${lastMsg.id}`);
              if (headerEl) {
                const headerRect = headerEl.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const scrollPos = container.scrollTop + (headerRect.top - containerRect.top) - 16;
                container.scrollTo({ top: scrollPos, behavior: 'smooth' });
              }
            }, 100);
            return;
          } else if (lastMsg && lastMsg.role === 'user') {
            // New user message: scroll to bottom
            setTimeout(() => {
              container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
            }, 100);
            return;
          }
        }
        
        // If we are NOT loading and NOT playing audio, we can scroll to bottom
        // But only if we are already near the bottom, to prevent jumping when reading old messages.
        // For simplicity, we just don't auto-scroll here unless it's a live transcript update
        if (isLive) {
          setTimeout(() => {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
          }, 100);
        }
      }
    }
  }, [messages, liveTranscript, playingMessageId, isLoading, isModelSpeaking, isLive]);

  // Scroll to header when paused
  useEffect(() => {
    if (isPaused && playingMessageId) {
      const headerEl = document.getElementById(`message-header-${playingMessageId}`);
      const container = document.getElementById('main-scroll-container');
      if (headerEl && container) {
        setTimeout(() => {
          const headerRect = headerEl.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const scrollPos = container.scrollTop + (headerRect.top - containerRect.top) - 16;
          container.scrollTo({ top: scrollPos, behavior: 'smooth' });
        }, 100);
      }
    }
  }, [isPaused, playingMessageId]);

  const lastScrollTimeRef = useRef<number>(0);

  // Scroll to currently spoken word
  useEffect(() => {
    if (playingMessageId && playingTextIndex > 0) {
      const el = document.getElementById('current-spoken-word');
      const container = document.getElementById('main-scroll-container');
      
      const now = Date.now();
      // Shorter debounce for smoother continuous scrolling
      if (now - lastScrollTimeRef.current < 150) return;
      
      if (el && container) {
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Check if element is outside the middle 50% of the container
        const topThreshold = containerRect.top + containerRect.height * 0.25;
        const bottomThreshold = containerRect.bottom - containerRect.height * 0.25;
        
        if (elRect.top < topThreshold || elRect.bottom > bottomThreshold) {
          lastScrollTimeRef.current = now;
          // Calculate exact scroll position to center the element safely within the container
          const scrollPos = container.scrollTop + (elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2);
          
          container.scrollTo({ 
            top: scrollPos, 
            behavior: 'smooth' 
          });
        }
      }
    }
  }, [playingTextIndex, playingMessageId]);

  // Initialize Chat (removed as we use generateContent directly now)
  useEffect(() => {
    // Kept for consistency if any other initialization is needed later
  }, [useFastModel]);

  const stopMessageAudio = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    ttsSourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
      try { source.disconnect(); } catch(e) {}
    });
    ttsSourcesRef.current = [];
    currentUtteranceRef.current = null;
    currentTextIndexRef.current = 0;
    setPlayingTextIndex(0);
    startTimeRef.current = 0;
    lastStartIndexRef.current = 0;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (premiumAudioRef.current) {
      premiumAudioRef.current.pause();
      premiumAudioRef.current.currentTime = 0;
    }
    setPlayingMessageId(null);
    playingMessageIdRef.current = null;
    setIsPaused(false);
    setIsModelSpeaking(false);
  };

  const pauseMessageAudio = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (startTimeRef.current > 0) {
      const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
      const estimatedChars = Math.floor(elapsedSeconds * 12);
      const estimatedIndex = lastStartIndexRef.current + estimatedChars;
      
      currentTextIndexRef.current = Math.min(
        Math.max(currentTextIndexRef.current, estimatedIndex), 
        currentTextRef.current.length
      );
    }
    
    currentUtteranceRef.current = null;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (premiumAudioRef.current) {
      premiumAudioRef.current.pause();
    }
    setIsPaused(true);
    setIsModelSpeaking(false);
  };

  const playMessageAudio = async (text: string, messageId: string, startIndex: number = 0, forceRestart: boolean = false) => {
    let actualStartIndex = startIndex;

    if (playingMessageId === messageId && startIndex === 0 && !forceRestart) {
      if (isPaused) {
        // Resume by restarting from the saved index
        actualStartIndex = currentTextIndexRef.current;
      } else {
        // Pause by cancelling, which is much more reliable on mobile
        pauseMessageAudio();
        return;
      }
    }
    
    if (actualStartIndex === 0) {
      stopMessageAudio();
      currentTextIndexRef.current = 0;
      setPlayingTextIndex(0);
    } else {
      currentUtteranceRef.current = null;
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
    
    setPlayingMessageId(messageId);
    playingMessageIdRef.current = messageId;
    setIsPaused(false);

    try {
      // Remove basic markdown characters and replace emojis with spaces for cleaner speech
      // We replace with spaces of the same length to keep indices aligned for highlighting
      const cleanText = text
        .replace(/[*_#`\-<>]/g, ' ')
        .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, match => ' '.repeat(match.length));
      currentTextRef.current = cleanText;
      
      // Find the start of the current word to avoid cutting words in half
      let wordStartIndex = actualStartIndex;
      if (actualStartIndex > 0 && actualStartIndex < cleanText.length) {
        // Backtrack to the start of the word
        while (wordStartIndex > 0 && cleanText[wordStartIndex - 1] !== ' ' && cleanText[wordStartIndex - 1] !== '\n') {
          wordStartIndex--;
        }
      }
      
      let textToSpeak = wordStartIndex > 0 ? cleanText.substring(wordStartIndex) : cleanText;
      
      if (textToSpeak.trim().length === 0) {
        stopMessageAudio();
        return;
      }

      // Truncate to 5000 characters to prevent 500 Internal Error from TTS API
      if (textToSpeak.length > 5000) {
        textToSpeak = textToSpeak.substring(0, 5000);
      }

      if (voiceEngineRef.current === 'premium') {
        let base64Audio: string | null = null;
        
        // Check if premium voice is temporarily disabled due to quota
        if (Date.now() < premiumVoiceDisabledUntilRef.current) {
          // Fall through to standard TTS without changing the user's setting
        } else {
          const cacheKey = `${messageId}_${premiumVoiceRef.current}`;
          base64Audio = audioCacheRef.current[cacheKey];

          if (!base64Audio) {
            setIsGeneratingAudio(messageId);
            try {
              if (!ai) {
                initAI(getApiKey());
              }
              if (!ai) {
                throw new Error("AI service not initialized. Please set your API Key in Settings.");
              }
              let response;
              let retries = 0;
              const maxRetries = 2;
              
              while (retries <= maxRetries) {
                try {
                  response = await ai.models.generateContent({
                    model: "gemini-2.5-flash-preview-tts",
                    contents: [{ parts: [{ text: textToSpeak }] }],
                    config: {
                      responseModalities: [Modality.AUDIO],
                      speechConfig: {
                        voiceConfig: {
                          prebuiltVoiceConfig: { voiceName: premiumVoiceRef.current },
                        },
                      },
                    },
                  });
                  break;
                } catch (e: any) {
                  const errStr = typeof e === 'string' ? e : (e?.message || JSON.stringify(e));
                  const isRetryable = errStr.includes('503') || 
                                      errStr.toLowerCase().includes('service unavailable') || 
                                      errStr.toLowerCase().includes('busy') || 
                                      errStr.toLowerCase().includes('traffic') ||
                                      errStr.toLowerCase().includes('deadline_exceeded');
                  
                  if (isRetryable && retries < maxRetries) {
                    retries++;
                    const delay = Math.pow(2, retries) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    if (playingMessageIdRef.current !== messageId) return;
                    continue;
                  }
                  throw e;
                }
              }

              if (!response) throw new Error("No response from TTS service");

              const rawAudio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
              if (rawAudio) {
                const wavBase64 = createWavFromPcmBase64(rawAudio);
                audioCacheRef.current[cacheKey] = wavBase64;
                base64Audio = wavBase64;
              }
            } catch (e: any) {
              const errStr = typeof e === 'string' ? e : (e?.message || JSON.stringify(e));
              const isQuotaErr = errStr.toLowerCase().includes('429') || 
                                 errStr.toLowerCase().includes('503') ||
                                 errStr.toLowerCase().includes('service unavailable') ||
                                 errStr.toLowerCase().includes('quota') || 
                                 errStr.includes('RESOURCE_EXHAUSTED') ||
                                 errStr.toLowerCase().includes('limit') ||
                                 errStr.toLowerCase().includes('exceeded');
              
              if (isQuotaErr) {
                console.warn("Premium voice quota exceeded, falling back to standard TTS.");
                setError(t.premiumQuotaExceeded);
                // Disable premium voice for 5 minutes
                premiumVoiceDisabledUntilRef.current = Date.now() + (5 * 60 * 1000);
              } else {
                console.warn("Failed to generate premium audio", e);
              }
              
              // Fallback to standard for this message only
              base64Audio = null;
            } finally {
              setIsGeneratingAudio(null);
            }
          }
        }

        // If user stopped or changed message while generating
        if (playingMessageIdRef.current !== messageId) {
          return;
        }

        if (base64Audio && premiumAudioRef.current) {
          // If paused, we just resume from where we left off
          if (actualStartIndex > 0 && premiumAudioRef.current.src.includes(base64Audio.substring(0, 100))) {
            premiumAudioRef.current.playbackRate = speechRateRef.current;
            premiumAudioRef.current.play().catch(e => console.warn(e));
            return;
          }

          premiumAudioRef.current.src = `data:audio/wav;base64,${base64Audio}`;
          premiumAudioRef.current.playbackRate = speechRateRef.current;
          
          premiumAudioRef.current.onplay = () => {
            startTimeRef.current = Date.now();
            lastStartIndexRef.current = wordStartIndex;
            currentTextIndexRef.current = wordStartIndex;
            setPlayingTextIndex(wordStartIndex);
            setIsModelSpeaking(true);
          };

          premiumAudioRef.current.onpause = () => {
            setIsModelSpeaking(false);
          };

          premiumAudioRef.current.ontimeupdate = () => {
            if (premiumAudioRef.current && premiumAudioRef.current.duration) {
              const progress = premiumAudioRef.current.currentTime / premiumAudioRef.current.duration;
              const estimatedIndex = wordStartIndex + Math.floor(progress * textToSpeak.length);
              
              if (estimatedIndex > currentTextIndexRef.current) {
                const newIndex = Math.min(estimatedIndex, currentTextRef.current.length);
                currentTextIndexRef.current = newIndex;
                setPlayingTextIndex(newIndex);
              }
            }
          };

          premiumAudioRef.current.onended = () => {
            stopMessageAudio();
          };

          // Setup audio context for avatar animation before playing
          if (!audioContextRef.current) {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
              audioContextRef.current = new AudioContextClass();
            }
          }
          
          if (audioContextRef.current && !analyserRef.current) {
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
          }
          
          if (audioContextRef.current && analyserRef.current && premiumAudioRef.current && !premiumAudioSourceRef.current) {
            try {
              premiumAudioSourceRef.current = audioContextRef.current.createMediaElementSource(premiumAudioRef.current);
              premiumAudioSourceRef.current.connect(analyserRef.current);
              analyserRef.current.connect(audioContextRef.current.destination);
            } catch (e) {
              console.warn("Failed to connect audio source", e);
            }
          }
          
          if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
          }

          premiumAudioRef.current.play().catch(e => {
            console.warn("Failed to play premium audio", e);
            stopMessageAudio();
          });
          
          return; // Skip standard TTS
        }
      }
      
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      
      // Detect language based on text content
      let detectedLang = 'hi-IN'; // Default to Hindi
      if (/[\u0900-\u097F]/.test(textToSpeak)) {
        if (uiLang === 'mr') detectedLang = 'mr-IN';
        else if (uiLang === 'bho') detectedLang = 'bho-IN';
        else detectedLang = 'hi-IN';
      } else if (/[\u0980-\u09FF]/.test(textToSpeak)) {
        detectedLang = uiLang === 'as' ? 'as-IN' : 'bn-IN'; // Bengali/Assamese
      } else if (/[\u0B80-\u0BFF]/.test(textToSpeak)) {
        detectedLang = 'ta-IN'; // Tamil
      } else if (/[\u0C00-\u0C7F]/.test(textToSpeak)) {
        detectedLang = 'te-IN'; // Telugu
      } else if (/[\u0A80-\u0AFF]/.test(textToSpeak)) {
        detectedLang = 'gu-IN'; // Gujarati
      } else if (/[\u0C80-\u0CFF]/.test(textToSpeak)) {
        detectedLang = 'kn-IN'; // Kannada
      } else if (/[\u0D00-\u0D7F]/.test(textToSpeak)) {
        detectedLang = 'ml-IN'; // Malayalam
      } else if (/[\u0A00-\u0A7F]/.test(textToSpeak)) {
        detectedLang = 'pa-IN'; // Punjabi
      } else if (/[\u0B00-\u0B7F]/.test(textToSpeak)) {
        detectedLang = 'or-IN'; // Odia
      } else if (/[\u0600-\u06FF]/.test(textToSpeak)) {
        detectedLang = 'ur-IN'; // Urdu
      } else if (/^[a-zA-Z0-9\s.,!?'"-]+$/.test(textToSpeak.trim())) {
        detectedLang = 'en-IN'; // English (Indian accent)
      }
      
      utterance.lang = detectedLang;
      utterance.rate = speechRateRef.current;
      utterance.pitch = speechPitchRef.current;
      
      // Set these synchronously so they are ready even if onstart is delayed or fails
      startTimeRef.current = Date.now();
      lastStartIndexRef.current = wordStartIndex;
      currentTextIndexRef.current = wordStartIndex;
      setPlayingTextIndex(wordStartIndex);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      // Fallback timer for devices where onboundary doesn't fire reliably (like Android)
      // This is needed for auto-scroll and floating button to work
      timerRef.current = setInterval(() => {
        if (startTimeRef.current > 0 && currentUtteranceRef.current) {
          const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
          const estimatedChars = Math.floor(elapsedSeconds * 12); // ~12 chars per second for Hindi
          const estimatedIndex = lastStartIndexRef.current + estimatedChars;
          
          // Only update if the estimated index is ahead of the current index
          // This allows onboundary to take precedence if it's working
          if (estimatedIndex > currentTextIndexRef.current) {
            const newIndex = Math.min(estimatedIndex, currentTextRef.current.length);
            currentTextIndexRef.current = newIndex;
            setPlayingTextIndex(newIndex);
          }
        }
      }, 100);
      
      utterance.onstart = () => {
        // Reset timer precisely when audio actually starts
        startTimeRef.current = Date.now();
        setIsModelSpeaking(true);
      };
      
      utterance.onboundary = (event) => {
        // If onboundary fires, it means the device supports it, so we can disable the fallback timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        
        const newIndex = wordStartIndex + event.charIndex;
        // If onboundary fires, it's more accurate, so we use it and update our baseline
        currentTextIndexRef.current = newIndex;
        setPlayingTextIndex(newIndex);
        // Update the baseline for the fallback timer so it doesn't jump back and forth
        lastStartIndexRef.current = newIndex;
        startTimeRef.current = Date.now();
      };
      
      const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      
      // Check if user has explicitly selected a voice
      let selectedVoice = null;
      if (selectedVoiceURIRef.current) {
        selectedVoice = voices.find(v => v.voiceURI === selectedVoiceURIRef.current) || null;
      }
      
      // If no explicit voice selected or it wasn't found, use auto-selection logic
      if (!selectedVoice) {
        // Filter voices based on detected language
        const langPrefix = detectedLang.split('-')[0];
        const matchingVoices = voices.filter(v => v.lang.toLowerCase().includes(langPrefix) || v.lang.toLowerCase().includes(detectedLang.toLowerCase()));
        
        const currentName = userName || (uiLang === 'hi' ? 'नॉर्ड' : 'Nard');
        const gender = guessGender(currentName);
        
        const femaleNames = [
          'kalpana', 'lekha', 'aditi', 'female', 'woman', 'girl', 'lady',
          'neerja', 'pallavi', 'vani', 'swara', 'zira', 'samantha', 'victoria', 'hazel', 'susan',
          '-standard-a', '-standard-d', '-standard-e', '-standard-f',
          '-wavenet-a', '-wavenet-d', '-wavenet-e', '-wavenet-f',
          '-neural-a', '-neural-d', '-neural-e', '-neural-f',
          '-neural2-a', '-neural2-d', '-neural2-e', '-neural2-f'
        ];

        if (gender === 'F') {
          // Look for female voices
          selectedVoice = matchingVoices.find(v => {
            const name = v.name.toLowerCase();
            return femaleNames.some(f => name.includes(f));
          }) || null;
          
          // Fallback to any female voice in all voices if not found in matching language
          if (!selectedVoice) {
            selectedVoice = voices.find(v => {
              const name = v.name.toLowerCase();
              return femaleNames.some(f => name.includes(f));
            }) || null;
          }
        } else {
          // 1. Look for Charon-like calm, measured male voices first
          selectedVoice = matchingVoices.find(v => {
            const name = v.name.toLowerCase();
            return name.includes('google uk english male') ||
                   name.includes('daniel') ||
                   name.includes('arthur') ||
                   name.includes('hi-in-x-hie-local') ||
                   name.includes('hi-in-x-hie') ||
                   name.includes('-wavenet-b') ||
                   name.includes('-neural2-b');
          }) || null;

          // 1.5. Look for other known male voices
          if (!selectedVoice) {
            selectedVoice = matchingVoices.find(v => {
              const name = v.name.toLowerCase();
              return name.includes('hemant') || 
                     name.includes('rishi') || 
                     name.includes('male') ||
                     name.includes('-standard-b') || 
                     name.includes('-standard-c') || 
                     name.includes('-wavenet-c');
            }) || null;
          }

          // 2. If no explicit male voice found, try to avoid known female voices
          if (!selectedVoice) {
            selectedVoice = matchingVoices.find(v => !femaleNames.some(f => v.name.toLowerCase().includes(f))) || null;
          }
          
          // 5. Try to find the specific Charon-like male voice requested by user if we are speaking Hindi or as a strong fallback
          if (!selectedVoice) {
            const preferredCharonVoice = voices.find(v => {
              const name = v.name.toLowerCase();
              return name.includes('google uk english male') ||
                     name.includes('daniel') ||
                     name.includes('hi-in-x-hie-local') ||
                     name.includes('hi-in-x-hie');
            });
            if (preferredCharonVoice) {
              selectedVoice = preferredCharonVoice;
            }
          }
        }

        // 3. Fallback to the first available voice in that language
        if (!selectedVoice && matchingVoices.length > 0) {
          selectedVoice = matchingVoices[0];
        }
        
        // 4. Ultimate fallback to any voice if language not found
        if (!selectedVoice && voices.length > 0) {
          selectedVoice = voices[0];
        }
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      currentUtteranceRef.current = utterance;

      utterance.onend = () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (currentUtteranceRef.current !== utterance) return;
        
        setIsModelSpeaking(false);
        if (playingMessageIdRef.current === messageId) {
          setPlayingMessageId(null);
          playingMessageIdRef.current = null;
          setIsPaused(false);
        }
      };
      
      utterance.onerror = () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (currentUtteranceRef.current !== utterance) return;
        
        setIsModelSpeaking(false);
        if (playingMessageIdRef.current === messageId) {
          setPlayingMessageId(null);
          playingMessageIdRef.current = null;
          setIsPaused(false);
        }
      };

      if (window.speechSynthesis) {
        window.speechSynthesis.speak(utterance);
      }
    } catch (e: any) {
      console.warn("TTS Error", e);
      setError(t.errorTech);
      if (playingMessageIdRef.current === messageId) {
        setPlayingMessageId(null);
        playingMessageIdRef.current = null;
        setIsPaused(false);
      }
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  };

  const handleSend = async (textToSend?: string | React.MouseEvent, autoPlayResponse: boolean = false, editMsgId?: string) => {
    stopMessageAudio();
    if (isVoiceTyping && recognitionRef.current) {
      // Clear the transcript ref so onend doesn't send it again
      voiceTypingTranscriptRef.current = '';
      recognitionRef.current.stop();
      setIsVoiceTyping(false);
    }

    const userText = typeof textToSend === 'string' ? textToSend : input.trim();
    if (!userText && !selectedImage) return;
    if (isLoading) return;
    
    const imageToSend = selectedImage;
    setInput('');
    setSelectedImage(null);
    setEditMsgId(null);
    const newMsgId = editMsgId || Date.now().toString();
    
    // Build currentMessages synchronously
    let currentMessages: any[] = [];
    if (editMsgId) {
      const msgIndex = messages.findIndex(m => m.id === editMsgId);
      if (msgIndex !== -1) {
        // Truncate history to the edited message
        currentMessages = messages.slice(0, msgIndex + 1).map(m => 
          m.id === editMsgId ? { ...m, text: userText, image: imageToSend || m.image } : m
        );
      } else {
        currentMessages = messages.map(m => m.id === editMsgId ? { ...m, text: userText, image: imageToSend || m.image } : m);
      }
    } else {
      currentMessages = [...messages, { id: newMsgId, role: 'user', text: userText, image: imageToSend }];
    }
    
    // Update messages state
    setMessages(currentMessages);

    setIsLoading(true);
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    try {
      if (!ai) {
        initAI(getApiKey());
      }
      if (!ai) {
        throw new Error("AI service is not initialized. Please ensure your Gemini API key is correctly configured in the environment.");
      }
      const modelName = useFastModel ? "gemini-3.1-flash-lite-preview" : "gemini-3.1-pro-preview";
      
      // Build contents array from history
      const contents: any[] = [];
      
      currentMessages
        .filter(m => m.id !== '1' && !m.id.endsWith('-error'))
        .forEach(m => {
          const parts: any[] = [];
          if (m.image) {
            parts.push({ inlineData: { data: m.image.data, mimeType: m.image.mimeType } });
          }
          if (m.text && m.text.trim() !== '') {
            parts.push({ text: m.text });
          } else if (m.image) {
            parts.push({ text: "What is this image?" });
          } else {
            parts.push({ text: " " });
          }
          
          if (contents.length > 0 && contents[contents.length - 1].role === m.role) {
            contents[contents.length - 1].parts.push(...parts);
          } else {
            contents.push({ role: m.role, parts });
          }
        });

      const config: any = {};
      let systemInstruction = String(SYSTEM_INSTRUCTION);
      
      if (userName.trim()) {
        const currentBotName = userName.trim();
        if (currentMessages.length <= 2) {
          systemInstruction += `\n\nCRITICAL: Your name is ${currentBotName}. You must introduce yourself in your first response and refer to yourself using this name instead of Nard. Adopt the appropriate gender and persona matching the name '${currentBotName}', especially when speaking in languages with gendered grammar like Hindi.`;
        } else {
          systemInstruction += `\n\nCRITICAL: Your name is ${currentBotName}. DO NOT mention your name or introduce yourself again unless the user explicitly asks for it. Adopt the appropriate gender and persona matching the name '${currentBotName}'.`;
        }
      }
      
      if (systemInstruction && systemInstruction.trim() !== '') {
        config.systemInstruction = systemInstruction;
      }

      let response;
      let retries = 0;
      const maxRetries = 2;
      
      while (retries <= maxRetries) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: contents,
            config: config
          });
          break;
        } catch (e: any) {
          if (abortController.signal.aborted) return;
          
          const errStr = typeof e === 'string' ? e : (e?.message || JSON.stringify(e));
          const isRetryable = errStr.includes('503') || 
                              errStr.toLowerCase().includes('service unavailable') || 
                              errStr.toLowerCase().includes('busy') || 
                              errStr.toLowerCase().includes('traffic') ||
                              errStr.toLowerCase().includes('deadline_exceeded');
          
          if (isRetryable && retries < maxRetries) {
            retries++;
            const delay = Math.pow(2, retries) * 1000;
            await new Promise(resolve => {
              const timeout = setTimeout(resolve, delay);
              abortController.signal.addEventListener('abort', () => {
                clearTimeout(timeout);
                resolve(null);
              }, { once: true });
            });
            if (abortController.signal.aborted) return;
            continue;
          }
          throw e;
        }
      }
      
      if (!response) return;
      
      if (abortController.signal.aborted) {
        return;
      }
      
      const modelText = response.text || "";
      
      const newModelMsgId = newMsgId + '-model-' + Date.now();
      setMessages(prev => {
        return [...prev, { id: newModelMsgId, role: 'model', text: modelText }];
      });
      
      if (autoPlayResponse && modelText) {
        const { mainText } = parseMessage(modelText);
        setTimeout(() => {
          playMessageAudio(mainText, newModelMsgId);
        }, 100);
      }
      
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      if (abortController.signal.aborted) {
        return;
      }
      const errStr = typeof error === 'string' ? error : (error?.message || JSON.stringify(error));
      const isQuotaErr = errStr.toLowerCase().includes('429') || 
                           errStr.toLowerCase().includes('503') ||
                           errStr.toLowerCase().includes('service unavailable') ||
                           errStr.toLowerCase().includes('quota') || 
                           errStr.includes('RESOURCE_EXHAUSTED') ||
                           errStr.toLowerCase().includes('limit') ||
                           errStr.toLowerCase().includes('exceeded') ||
                           errStr.toLowerCase().includes('safety') ||
                           errStr.toLowerCase().includes('blocked');
      
      if (isQuotaErr) {
        const quotaMsg = t.errorTraffic || "Sorry, there is too much traffic right now or the quota is exhausted. Please try again later.";
        const errorId = newMsgId + '-error';
        setMessages(prev => [...prev, { id: errorId, role: 'model', text: quotaMsg }]);
        setError(quotaMsg);
        
        // Auto-remove the error message from chat after 1 second
        setTimeout(() => {
          setMessages(prev => prev.filter(m => m.id !== errorId));
        }, 1000);
      } else {
        const techMsg = `Error: ${errStr}`;
        const errorId = newMsgId + '-error';
        setMessages(prev => [...prev, { id: errorId, role: 'model', text: techMsg }]);
        setError(techMsg);
        
        // Auto-remove tech error from chat after 5 seconds so user can read it
        setTimeout(() => {
          setMessages(prev => prev.filter(m => m.id !== errorId));
        }, 5000);
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(undefined, false, editMsgId || undefined);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      if (!base64String) return;
      const base64Data = base64String.split(',')[1];
      setSelectedImage({
        data: base64Data,
        mimeType: file.type || 'image/jpeg'
      });
    };
    reader.readAsDataURL(file);
    
    // Reset input so the same file can be selected again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Voice Typing Setup
  const toggleVoiceTyping = () => {
    if (isVoiceTyping) {
      setIsVoiceTyping(false);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      return;
    }

    stopMessageAudio();

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError(t.speechNotSupported || "Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    const langMap: Record<string, string> = {
      en: 'en-IN',
      hi: 'hi-IN',
      bho: 'bho-IN',
      bn: 'bn-IN',
      ta: 'ta-IN',
      te: 'te-IN',
      mr: 'mr-IN',
      gu: 'gu-IN',
      kn: 'kn-IN',
      ml: 'ml-IN',
      or: 'or-IN',
      pa: 'pa-IN',
      as: 'as-IN',
      ur: 'ur-IN'
    };
    recognition.lang = langMap[uiLang] || 'en-IN';
    
    recognitionRef.current = recognition;
    
    // Store the existing input so we can append to it
    const existingInput = input.trim() ? input.trim() + ' ' : '';
    voiceTypingTranscriptRef.current = existingInput;

    recognition.onstart = () => {
      setIsVoiceTyping(true);
    };

    recognition.onresult = (event: any) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        currentTranscript += event.results[i][0].transcript;
      }
      const fullText = existingInput + currentTranscript;
      setInput(fullText);
      voiceTypingTranscriptRef.current = fullText;
    };

    recognition.onerror = (event: any) => {
      console.warn("Speech recognition error", event.error);
      setIsVoiceTyping(false);
    };

    recognition.onend = () => {
      setIsVoiceTyping(false);
      if (voiceTypingTranscriptRef.current.trim()) {
        const textToSend = voiceTypingTranscriptRef.current.trim();
        voiceTypingTranscriptRef.current = '';
        handleSend(textToSend, true);
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.warn("Failed to start speech recognition", e);
      setIsVoiceTyping(false);
    }
  };

  // Live API Audio Setup
  const toggleMicMute = () => {
    const newMutedState = !isMicMutedRef.current;
    isMicMutedRef.current = newMutedState;
    setIsMicMuted(newMutedState);
  };

  const stopScreenShare = () => {
    if (screenIntervalRef.current) {
      clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);
    isScreenSharingRef.current = false;
    setLatestFrame(null);
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    try {
      // Check if getDisplayMedia is available (not available on mobile or if iframe lacks permissions)
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: "browser",
          },
          audio: false
        });

        screenStreamRef.current = stream;

        stream.getVideoTracks()[0].onended = () => {
          stopScreenShare();
        };

        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
          await screenVideoRef.current.play();
        }

        setIsScreenSharing(true);
        isScreenSharingRef.current = true;

        const captureFrame = async () => {
          if (!isLive || !isScreenSharingRef.current || !sessionPromiseRef.current) return;
          if (!screenVideoRef.current || !screenCanvasRef.current) return;
          
          try {
            const video = screenVideoRef.current;
            const canvas = screenCanvasRef.current;
            
            if (video.videoWidth === 0 || video.videoHeight === 0) return;

            const scale = 0.5;
            canvas.width = video.videoWidth * scale;
            canvas.height = video.videoHeight * scale;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const base64DataUrl = canvas.toDataURL('image/jpeg', 0.5);
            if (!base64DataUrl) return;
            
            const base64Data = base64DataUrl.split(',')[1];
            if (!base64Data) return;
            
            setLatestFrame(base64DataUrl);
            
            if (sessionPromiseRef.current && isSessionActiveRef.current) {
              sessionPromiseRef.current.then(s => {
                try {
                  if (s && isSessionActiveRef.current) {
                    s.sendRealtimeInput({ video: { data: base64Data, mimeType: 'image/jpeg' } });
                  }
                } catch (e) {
                  console.warn("Failed to send video frame:", e);
                }
              }).catch(() => {});
            }
          } catch (err) {
            console.warn("Screen Capture error:", err);
          }
        };

        setTimeout(captureFrame, 500);
        screenIntervalRef.current = window.setInterval(captureFrame, 2500);
      } else {
        // Fallback to html2canvas if getDisplayMedia is not supported
        console.warn("getDisplayMedia not supported, falling back to html2canvas");
        
        setIsScreenSharing(true);
        isScreenSharingRef.current = true;

        const captureFrame = async () => {
          if (!isLive || !isScreenSharingRef.current || !sessionPromiseRef.current) return;
          
          try {
            const canvas = await html2canvas(document.body, {
              scale: 0.5,
              useCORS: true,
              logging: false,
              backgroundColor: null,
            });
            
            const base64DataUrl = canvas.toDataURL('image/jpeg', 0.5);
            if (!base64DataUrl) return;
            const base64Data = base64DataUrl.split(',')[1];
            if (!base64Data) return;
            
            setLatestFrame(base64DataUrl);
            
            if (sessionPromiseRef.current && isSessionActiveRef.current) {
              sessionPromiseRef.current.then(s => {
                try {
                  if (s && isSessionActiveRef.current) {
                    s.sendRealtimeInput({ video: { data: base64Data, mimeType: 'image/jpeg' } });
                  }
                } catch (e) {
                  console.warn("Failed to send video frame:", e);
                }
              }).catch(() => {});
            }
          } catch (err) {
            console.warn("DOM Capture error:", err);
          }
        };

        captureFrame();
        screenIntervalRef.current = window.setInterval(captureFrame, 2500);
      }
    } catch (err) {
      console.error("Error starting screen share:", err);
      setIsScreenSharing(false);
      isScreenSharingRef.current = false;
      alert("Screen sharing failed. If you are using an iframe, please ensure it has the allow=\"display-capture\" attribute. Note: Screen sharing is not supported on mobile browsers.");
    }
  };

  const toggleLiveAudio = async () => {
    if (isLive) {
      stopLiveAudio();
      return;
    }

    stopMessageAudio();

    if (isVoiceTyping && recognitionRef.current) {
      voiceTypingTranscriptRef.current = '';
      recognitionRef.current.stop();
      setIsVoiceTyping(false);
    }

    setLiveTranscript([]);
    liveTranscriptRef.current = [];

    try {
      const apiKey = getApiKey();
      console.log("Starting Live Audio session with API Key status:", apiKey ? "Present" : "Missing");
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      mediaStreamRef.current = stream;

      let audioCtx;
      try {
        // Try to create AudioContext with 16000Hz sample rate
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      } catch (e) {
        console.warn("Failed to create AudioContext with 16000Hz, falling back to default:", e);
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      await audioCtx.resume();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      
      const actualSampleRate = audioCtx.sampleRate;
      console.log("AudioContext sample rate:", actualSampleRate);
      
      // HTML5 Audio element hack to keep browser alive in background
      if (!backgroundAudioRef.current) {
        const audioEl = new Audio();
        // A tiny silent base64 WAV file
        audioEl.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        audioEl.loop = true;
        (audioEl as any).playsInline = true;
        backgroundAudioRef.current = audioEl;
      }
      backgroundAudioRef.current.play().catch(e => console.warn("Background audio play failed:", e));

      // Media Session API to register as active media player
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Live Chat Active',
          artist: 'Lok Mitra AI',
          album: 'Voice Assistant'
        });
      }
      
      // Silent oscillator hack to keep audio context alive in background
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0; // Silent
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      silentOscillatorRef.current = oscillator;
      
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      // Do NOT connect the microphone source to the analyser, as it will cause local echo
      // source.connect(analyser);
      analyser.connect(audioCtx.destination);
      analyserRef.current = analyser;
      
      // Use AudioWorklet if available, fallback to ScriptProcessor
      let processor: any;
      
      try {
        if (audioCtx.audioWorklet) {
          const workletCode = `
            class PCMProcessor extends AudioWorkletProcessor {
              process(inputs, outputs, parameters) {
                const input = inputs[0];
                if (input && input.length > 0) {
                  const pcmData = input[0];
                  this.port.postMessage(pcmData);
                }
                return true;
              }
            }
            registerProcessor('pcm-processor', PCMProcessor);
          `;
          const workletBlob = new Blob([workletCode], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(workletBlob);
          await audioCtx.audioWorklet.addModule(workletUrl);
          processor = new AudioWorkletNode(audioCtx, 'pcm-processor');
          
          processor.port.onmessage = (event: MessageEvent) => {
            const pcmData = event.data;
            // Downsample from 44.1kHz/48kHz to 16kHz
            const ratio = audioCtx.sampleRate / 16000;
            const newLength = Math.round(pcmData.length / ratio);
            const result = new Int16Array(newLength);
            let offset = 0;
            for (let i = 0; i < newLength; i++) {
              const nextOffset = Math.round((i + 1) * ratio);
              let sum = 0;
              let count = 0;
              for (let j = offset; j < nextOffset && j < pcmData.length; j++) {
                sum += pcmData[j];
                count++;
              }
              result[i] = Math.min(1, Math.max(-1, sum / count)) * 0x7FFF;
              offset = nextOffset;
            }
            
            // Convert to base64
            const bytes = new Uint8Array(result.buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            
            if (sessionPromiseRef.current && !isMicMutedRef.current && isSessionActiveRef.current) {
              sessionPromiseRef.current.then(s => {
                try {
                  if (s && isSessionActiveRef.current) {
                    s.sendRealtimeInput({ audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
                  }
                } catch (err: any) {
                  const errMsg = err?.message || String(err);
                  if (!errMsg.includes('CLOSING') && !errMsg.includes('CLOSED')) {
                    console.warn("Failed to send audio input:", err);
                  } else {
                    isSessionActiveRef.current = false;
                  }
                }
              }).catch(() => {});
            }
          };
          
          source.connect(processor);
          processor.connect(audioCtx.destination);
        } else {
          throw new Error("AudioWorklet not supported");
        }
      } catch (workletErr) {
        console.warn("AudioWorklet failed, falling back to ScriptProcessor:", workletErr);
        processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e: any) => {
          const pcmData = e.inputBuffer.getChannelData(0);
          // Downsample from 44.1kHz/48kHz to 16kHz
          const ratio = audioCtx.sampleRate / 16000;
          const newLength = Math.round(pcmData.length / ratio);
          const result = new Int16Array(newLength);
          let offset = 0;
          for (let i = 0; i < newLength; i++) {
            const nextOffset = Math.round((i + 1) * ratio);
            let sum = 0;
            let count = 0;
            for (let j = offset; j < nextOffset && j < pcmData.length; j++) {
              sum += pcmData[j];
              count++;
            }
            result[i] = Math.min(1, Math.max(-1, sum / count)) * 0x7FFF;
            offset = nextOffset;
          }
          
          // Convert to base64
          const bytes = new Uint8Array(result.buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          
          if (sessionPromiseRef.current && !isMicMutedRef.current && isSessionActiveRef.current) {
            sessionPromiseRef.current.then(s => {
              try {
                if (s && isSessionActiveRef.current) {
                  s.sendRealtimeInput({ audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
                }
              } catch (err: any) {
                const errMsg = err?.message || String(err);
                if (!errMsg.includes('CLOSING') && !errMsg.includes('CLOSED')) {
                  console.warn("Failed to send audio input:", err);
                } else {
                  isSessionActiveRef.current = false;
                }
              }
            }).catch(() => {});
          }
        };
        source.connect(processor);
        const dummyDest = audioCtx.createMediaStreamDestination();
        processor.connect(dummyDest);
      }
      processorRef.current = processor;
      
      if (!ai) {
        initAI(getApiKey());
      }
      if (!ai) {
        throw new Error("AI service not initialized. Please ensure your Gemini API key is correctly configured in the environment.");
      }
      let liveInstruction = SYSTEM_INSTRUCTION;
      
      if (userName.trim()) {
        const currentBotName = userName.trim();
        if (messages.length <= 2) {
          liveInstruction += `\n\nCRITICAL: Your name is ${currentBotName}. You must introduce yourself in your first response and refer to yourself using this name instead of Nard. Adopt the appropriate gender and persona matching the name '${currentBotName}', especially when speaking in languages with gendered grammar like Hindi.`;
        } else {
          liveInstruction += `\n\nCRITICAL: Your name is ${currentBotName}. DO NOT mention your name or introduce yourself again unless the user explicitly asks for it. Adopt the appropriate gender and persona matching the name '${currentBotName}'.`;
        }
      }
      liveInstruction += "\n\nCRITICAL FOR LIVE VOICE CONVERSATION: DO NOT output the ---SUGGESTED_QUESTIONS--- section or any suggested questions at all. Just answer the user directly.";

      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: liveInstruction,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: premiumVoiceRef.current } }
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
             console.log("Live API connected successfully. Session active.");
             isSessionActiveRef.current = true;
             nextAudioTimeRef.current = 0;
             // Add a small delay before sending the initial message to ensure the connection is fully stable
             setTimeout(() => {
               if (sessionPromiseRef.current && isSessionActiveRef.current) {
                 console.log("Sending initial Live API message...");
                 sessionPromiseRef.current.then(s => {
                   try {
                     if (s && isSessionActiveRef.current) {
                       if (messages.length <= 2) {
                         s.sendRealtimeInput({ text: `Please introduce yourself by saying exactly this phrase: '${getInitialMessage(uiLang, userName)}'` });
                       } else {
                         s.sendRealtimeInput({ text: `Hello, I'm back. Let's continue.` });
                       }
                       console.log("Initial message sent to Live API.");
                     }
                   } catch (e) {
                     console.warn("Failed to send initial message:", e);
                   }
                 }).catch((err) => {
                   console.error("Session promise rejected during initial message:", err);
                 });
               } else {
                 console.warn("Session no longer active when trying to send initial message.");
               }
             }, 500);
          },
          onmessage: async (message: LiveServerMessage) => {
             if (message.serverContent) {
               // console.log("Live API message received:", message);
             }
             if (message.serverContent?.interrupted) {
               nextAudioTimeRef.current = 0;
               activeAudioSourcesRef.current.forEach(source => {
                 try { source.stop(); } catch (e) {}
               });
               activeAudioSourcesRef.current = [];
               if ((window as any).speakingTimeout) {
                 clearTimeout((window as any).speakingTimeout);
               }
               isModelSpeakingRef.current = false;
               setIsModelSpeaking(false);
             }
             const parts = message.serverContent?.modelTurn?.parts;
             if (parts) {
               for (const part of parts) {
                 if (part.inlineData?.data) {
                   playLiveAudio(part.inlineData.data);
                 }
               }
             }
             
             const inputTranscription = message.serverContent?.inputTranscription;
             if (inputTranscription?.text) {
               let lastMsg = liveTranscriptRef.current[liveTranscriptRef.current.length - 1];
               if (!lastMsg || lastMsg.role !== 'user') {
                 lastMsg = { id: Date.now().toString() + Math.random(), role: 'user', text: '' };
                 liveTranscriptRef.current.push(lastMsg);
               }
               lastMsg.text += inputTranscription.text;
               setLiveTranscript([...liveTranscriptRef.current]);
             }
             
             const outputTranscription = message.serverContent?.outputTranscription;
             if (outputTranscription?.text) {
               let lastMsg = liveTranscriptRef.current[liveTranscriptRef.current.length - 1];
               if (!lastMsg || lastMsg.role !== 'model') {
                 lastMsg = { id: Date.now().toString() + Math.random(), role: 'model', text: '' };
                 liveTranscriptRef.current.push(lastMsg);
               }
               lastMsg.text += outputTranscription.text;
               setLiveTranscript([...liveTranscriptRef.current]);
             }
          },
          onclose: (event?: any) => {
             console.log("Live API connection closed.", {
               wasClean: event?.wasClean,
               code: event?.code,
               reason: event?.reason,
               event: event
             });
             isSessionActiveRef.current = false;
             stopLiveAudio();
          },
          onerror: (err: any) => {
             console.error("Live API critical error:", {
               message: err?.message,
               stack: err?.stack,
               error: err
             });
             isSessionActiveRef.current = false;
             stopLiveAudio();
          }
        }
      });
      sessionPromiseRef.current = sessionPromise;
      setIsLive(true);
    } catch (e: any) {
      console.warn("Live Audio Error:", e);
      let errorMsg = t.errorTech;
      
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        errorMsg = t.errorMicPermission || "Microphone permission denied. Please enable it in your browser settings.";
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        errorMsg = t.errorMicNotFound || "No microphone found. Please connect a microphone and try again.";
      } else {
        const errStr = typeof e === 'string' ? e : (e.message || JSON.stringify(e));
        const isQuotaErr = errStr.toLowerCase().includes('429') || 
                             errStr.toLowerCase().includes('503') ||
                             errStr.toLowerCase().includes('service unavailable') ||
                             errStr.toLowerCase().includes('quota') || 
                             errStr.includes('RESOURCE_EXHAUSTED') ||
                             errStr.toLowerCase().includes('limit') ||
                             errStr.toLowerCase().includes('exceeded');
        if (isQuotaErr) {
          errorMsg = t.errorTraffic;
        }
      }
      
      setError(errorMsg);
      setIsLive(false);
    }
  };

  const playLiveAudio = async (base64: string) => {
    if (!audioContextRef.current) return;
    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
      }
      const pcm16 = new Int16Array(bytes.buffer);
      const audioBuffer = audioContextRef.current.createBuffer(1, pcm16.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < pcm16.length; i++) {
          channelData[i] = pcm16[i] / 32768.0;
      }
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      if (analyserRef.current) {
        source.connect(analyserRef.current);
      } else {
        source.connect(audioContextRef.current.destination);
      }
      
      // Schedule playback to avoid stuttering
      const currentTime = audioContextRef.current.currentTime;
      if (nextAudioTimeRef.current < currentTime) {
        nextAudioTimeRef.current = currentTime + 0.05; // Add a small buffer if we starved
      }
      
      source.start(nextAudioTimeRef.current);
      activeAudioSourcesRef.current.push(source);
      source.onended = () => {
        activeAudioSourcesRef.current = activeAudioSourcesRef.current.filter(s => s !== source);
      };
      nextAudioTimeRef.current += audioBuffer.duration;
      
      // Update speaking state
      isModelSpeakingRef.current = true;
      setIsModelSpeaking(true);
      
      if ((window as any).speakingTimeout) {
        clearTimeout((window as any).speakingTimeout);
      }
      
      const timeUntilEnd = (nextAudioTimeRef.current - audioContextRef.current.currentTime) * 1000;
      (window as any).speakingTimeout = setTimeout(() => {
        isModelSpeakingRef.current = false;
        setIsModelSpeaking(false);
      }, Math.max(0, timeUntilEnd));
      
    } catch (e) {
      console.warn("Error playing live audio:", e);
    }
  };

  const stopLiveAudio = () => {
    isSessionActiveRef.current = false;
    stopScreenShare();
    activeAudioSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeAudioSourcesRef.current = [];
    
    if ((window as any).speakingTimeout) {
      clearTimeout((window as any).speakingTimeout);
    }
    isModelSpeakingRef.current = false;
    setIsModelSpeaking(false);
    
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(s => s.close());
      sessionPromiseRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (silentOscillatorRef.current) {
      try { silentOscillatorRef.current.stop(); } catch (e) {}
      silentOscillatorRef.current.disconnect();
      silentOscillatorRef.current = null;
    }
    if (backgroundAudioRef.current) {
      backgroundAudioRef.current.pause();
      backgroundAudioRef.current.currentTime = 0;
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsLive(false);
    setIsMicMuted(false);
    isMicMutedRef.current = false;
    
    if (liveTranscriptRef.current.length > 0) {
      setMessages(prev => {
        const validTranscripts = liveTranscriptRef.current.filter(m => m.text.trim().length > 0);
        return [...prev, ...validTranscripts];
      });
      setLiveTranscript([]);
      liveTranscriptRef.current = [];
    }
  };

  // Avatar Animation Effect
  useEffect(() => {
    if (!isLive) return;
    
    if (isModelSpeaking) {
      if (avatarContainerRef.current) {
        avatarContainerRef.current.style.filter = 'drop-shadow(0 0 20px rgba(96,165,250,0.6))';
      }
    } else {
      if (avatarContainerRef.current) {
        avatarContainerRef.current.style.filter = 'drop-shadow(0 0 15px rgba(56,189,248,0.4))';
      }
      animate(mouthPath, PATH_CLOSED, { duration: 0.2, ease: "easeOut" });
    }

    let animationId: number;
    let lastPath = PATH_CLOSED;
    
    const updateAvatar = () => {
      let nextPath = PATH_CLOSED;
      
      if (isModelSpeaking && analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Vowel Formant Approximation
        // Bins (approx 172Hz each for 44.1kHz / 256)
        let low = 0, mid = 0, high = 0;
        for (let i = 1; i < 3; i++) low += dataArray[i];   // ~172 - 516 Hz
        for (let i = 3; i < 8; i++) mid += dataArray[i];   // ~516 - 1376 Hz
        for (let i = 8; i < 18; i++) high += dataArray[i]; // ~1376 - 3096 Hz
        
        low /= 2;
        mid /= 5;
        high /= 10;
        
        const totalEnergy = low + mid + high;
        
        if (totalEnergy > 15) { // Speaking threshold
          // Calculate ratios to determine vowel characteristics
          const hmRatio = high / (mid + 1);
          const mlRatio = mid / (low + 1);
          
          if (totalEnergy < 30) {
            // Low energy sounds (nasals, breathy, short)
            if (hmRatio > 1.2) nextPath = PATH_I; // इ
            else if (mlRatio > 1.2) nextPath = PATH_A_SHORT; // अ
            else if (hmRatio < 0.5) nextPath = PATH_U; // उ
            else nextPath = PATH_AM; // अं
          } else if (totalEnergy < 60) {
            // Medium energy
            if (hmRatio > 1.5) nextPath = PATH_II; // ई
            else if (hmRatio > 1.0) nextPath = PATH_E; // ए
            else if (mlRatio > 1.5) nextPath = PATH_AH; // अः
            else if (mlRatio > 1.0) nextPath = PATH_O; // ओ
            else nextPath = PATH_UU; // ऊ
          } else {
            // High energy (wide open)
            if (hmRatio > 1.2) nextPath = PATH_AI; // ऐ
            else if (mlRatio > 1.2) nextPath = PATH_AA; // आ
            else nextPath = PATH_AU; // औ
          }
        }
      }
      
      if (nextPath !== lastPath) {
        animate(mouthPath, nextPath, { duration: 0.15, ease: "easeOut" });
        lastPath = nextPath;
      }
      
      animationId = requestAnimationFrame(updateAvatar);
    };

    animationId = requestAnimationFrame(updateAvatar);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isModelSpeaking, isLive, mouthPath]);

  // Keep AudioContext alive when returning to foreground
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isLive && audioContextRef.current) {
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isLive]);

  // Keep screen awake during live chat
  useEffect(() => {
    let wakeLock: any = null;
    
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && isLive) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err: any) {
        // Silently ignore NotAllowedError as iframes might block this feature
        if (err.name !== 'NotAllowedError') {
          console.warn(`Wake Lock error: ${err.name}, ${err.message}`);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible' && isLive) {
        requestWakeLock();
      }
    };

    if (isLive) {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (wakeLock !== null) {
        wakeLock.release().then(() => {
          wakeLock = null;
        });
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLive]);

  const handleAppShare = async () => {
    try {
      let shareUrl = window.location.href;
      if (userName.trim()) {
        const url = new URL(shareUrl);
        url.searchParams.set('botName', userName.trim());
        shareUrl = url.toString();
      }

      if (navigator.share) {
        await navigator.share({
          title: displayBotName,
          text: t.subtitle,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setError(t.copied);
      }
    } catch (err) {
      console.warn('Error sharing:', err);
    }
  };

  return (
    <div 
      className="fixed inset-0 flex flex-col overflow-hidden"
    >
      {/* Hidden elements for screen sharing */}
      <video ref={screenVideoRef} style={{ display: 'none' }} playsInline muted />
      <canvas ref={screenCanvasRef} style={{ display: 'none' }} />

      {/* Virtual AI Background */}
      <VirtualNetworkBackground />
      <FloatingStopButton stopAudio={pauseMessageAudio} isPlaying={playingMessageId !== null && !isPaused} titleText={t.stop} />

      {/* Inner App Container */}
      <div className="flex flex-col h-full w-full bg-transparent font-mukta text-gray-900 overflow-hidden relative">
        {/* Header */}
          <header className="text-gray-900 p-2 pt-3 sm:pt-4 flex justify-between items-center z-10">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="relative w-12 h-12 flex-shrink-0 flex items-center justify-center mt-1.5">
                <Flame size={38} className="text-orange-500 drop-shadow-sm relative z-10" />
                <div className="absolute -top-1 right-2.5 z-20">
                  <Sparkles size={14} className="text-blue-400 animate-pulse drop-shadow-sm" />
                </div>
              </div>
              <div className="flex flex-col">
                <h1 className="text-2xl sm:text-3xl font-mukta font-bold tracking-wider text-yellow-500 drop-shadow-sm leading-none">{displayBotName}</h1>
                <p className="text-[10px] text-green-600 font-sans font-medium leading-none mt-0.5">{t.subtitle}</p>
              </div>
              
              {currentChatId && (
                <div className="flex flex-col justify-center overflow-hidden border-l border-gray-200 pl-2">
                  <span className="text-[8px] text-sky-600 uppercase tracking-widest font-bold opacity-70 leading-none">{t.chattingIn}</span>
                  <span className="text-xs font-medium text-gray-900 truncate max-w-[80px] sm:max-w-[150px] leading-tight">
                    {savedChats.find(c => c.id === currentChatId)?.name}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 relative" ref={moreMenuRef}>
              <button 
                onClick={handleNewChat}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-white shadow-sm border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-white shadow-md transition-all"
                title={t.newChat}
              >
                <MessageSquare size={18} />
              </button>

              <button 
                onClick={() => {
                  if (showSettings) {
                    setShowSettings(false);
                  } else {
                    setShowMoreMenu(!showMoreMenu);
                  }
                }}
                className={`flex items-center justify-center w-9 h-9 rounded-full transition-all ${showMoreMenu ? 'bg-sky-200 text-sky-600 border-sky-400' : 'bg-white shadow-sm border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-white shadow-md'} border`}
                title={t.moreOptions}
              >
                <Menu size={18} />
              </button>

              <AnimatePresence>
                {showMoreMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute right-0 top-full mt-2 w-48 bg-white/95 backdrop-blur-xl border border-gray-300 rounded-2xl shadow-2xl z-[100] overflow-hidden"
                  >
                    <div className="p-1.5 flex flex-col gap-1">
                      <button 
                        onClick={() => {
                          setIsHistoryOpen(true);
                          setShowMoreMenu(false);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-white shadow-md transition-colors text-left group"
                      >
                        <div className="p-2 bg-sky-100 rounded-lg text-sky-600 group-hover:bg-sky-200 transition-colors">
                          <MessageSquare size={16} />
                        </div>
                        <span className="text-sm font-medium text-gray-800">{t.chatHistory}</span>
                      </button>
                      
                      <button 
                        onClick={() => {
                          handleAppShare();
                          setShowMoreMenu(false);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-white shadow-md transition-colors text-left group"
                      >
                        <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600 group-hover:bg-emerald-200 transition-colors">
                          <Share2 size={16} />
                        </div>
                        <span className="text-sm font-medium text-gray-800">{t.share}</span>
                      </button>
                      
                      <button 
                        onClick={() => {
                          setShowSettings(!showSettings);
                          setShowMoreMenu(false);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-white shadow-md transition-colors text-left group"
                      >
                        <div className="p-2 bg-amber-100 rounded-lg text-amber-600 group-hover:bg-amber-200 transition-colors">
                          <Settings2 size={16} />
                        </div>
                        <span className="text-sm font-medium text-gray-800">{t.settings}</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </header>

          {/* Error Toast */}
          <AnimatePresence>

          </AnimatePresence>

          {/* Settings Panel */}
          <AnimatePresence>
            {showSettings && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden z-0"
              >
                <div className="p-4 max-w-3xl mx-auto grid grid-cols-1 gap-4 text-sm max-h-[60vh] overflow-y-auto custom-scrollbar">
                  {/* User Name Setting */}
                  <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                        <User size={20} />
                      </div>
                      <div>
                        <h3 className="text-gray-900 font-medium">{t.userNameLabel}</h3>
                        <p className="text-gray-500 text-xs">{t.userNamePlaceholder}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      {isEditingBotName ? (
                        <div className="flex items-center gap-2 w-full">
                          <input
                            type="text"
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            placeholder={t.userNamePlaceholder}
                            className="bg-white text-gray-900 border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-sky-400 transition-colors flex-1 sm:w-48"
                            autoFocus
                            onBlur={() => setIsEditingBotName(false)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') setIsEditingBotName(false);
                            }}
                          />
                          <button 
                            onClick={() => setIsEditingBotName(false)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Save"
                          >
                            <Check size={18} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end bg-gray-50 px-4 py-2 rounded-lg border border-transparent hover:border-gray-200 transition-colors group">
                          <span className="text-gray-900 font-medium truncate max-w-[150px]">
                            {userName || (uiLang === 'hi' ? 'नॉर्ड' : 'Nard')}
                          </span>
                          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => setIsEditingBotName(true)}
                              className="p-1.5 text-sky-600 hover:bg-sky-100 rounded-md transition-colors"
                              title="Edit Name"
                            >
                              <Edit2 size={16} />
                            </button>
                            {userName && (
                              <button 
                                onClick={() => setUserName('')}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                title="Delete/Reset Name"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-sky-100 rounded-lg text-sky-600">
                        <Globe size={20} />
                      </div>
                      <div>
                        <h3 className="text-gray-900 font-medium">{t.language}</h3>
                        <p className="text-gray-500 text-xs">{t.chooseLanguage}</p>
                      </div>
                    </div>
                    <select
                      value={uiLang}
                      onChange={(e) => setUiLang(e.target.value)}
                      className="bg-white text-gray-900 border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-sky-400 transition-colors"
                    >
                      <option value="en">English</option>
                      <option value="hi">हिन्दी (Hindi)</option>
                      <option value="bho">भोजपुरी (Bhojpuri)</option>
                      <option value="bn">বাংলা (Bengali)</option>
                      <option value="ta">தமிழ் (Tamil)</option>
                      <option value="te">తెలుగు (Telugu)</option>
                      <option value="mr">मराठी (Marathi)</option>
                      <option value="gu">ગુજરાતી (Gujarati)</option>
                      <option value="kn">ಕನ್ನಡ (Kannada)</option>
                      <option value="ml">മലയാളം (Malayalam)</option>
                      <option value="or">ଓଡ଼ିଆ (Odia)</option>
                      <option value="pa">ਪੰਜਾਬੀ (Punjabi)</option>
                      <option value="as">অসমীয়া (Assamese)</option>
                      <option value="ur">اردو (Urdu)</option>
                      <option value="ne">नेपाली (Nepali)</option>
                      <option value="mai">मैथिली (Maithili)</option>
                      <option value="sd">سنڌي (Sindhi)</option>
                      <option value="kok">कोंकणी (Konkani)</option>
                      <option value="doi">डोगरी (Dogri)</option>
                      <option value="ks">کأشُر (Kashmiri)</option>
                      <option value="sa">संस्कृतम् (Sanskrit)</option>
                      <option value="sat">ᱥᱟᱱᱛᱟᱲᱤ (Santali)</option>
                      <option value="brx">बर' (Bodo)</option>
                      <option value="mni">মৈতৈ (Manipuri)</option>
                    </select>
                  </div>
                  
                  <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-sky-100 rounded-lg text-sky-600">
                          <Volume2 size={20} />
                        </div>
                        <div>
                          <h3 className="text-gray-900 font-medium">{t.voiceEngine}</h3>
                          <p className="text-gray-500 text-xs">{t.chooseVoiceEngine}</p>
                        </div>
                      </div>
                      <select 
                        className="w-full bg-white shadow-md border border-gray-300 rounded-lg p-2 text-gray-900 outline-none focus:ring-2 focus:ring-sky-500"
                        value={voiceEngine}
                        onChange={(e) => setVoiceEngine(e.target.value as 'standard' | 'premium')}
                      >
                        <option value="standard" className="bg-zinc-800">{t.standard} (Offline, Fast)</option>
                        <option value="premium" className="bg-zinc-800">{t.premium} AI (Natural, Emotional)</option>
                      </select>
                    </div>

                    <div className="h-px w-full bg-white shadow-md"></div>

                    {voiceEngine === 'premium' ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-sky-100 rounded-lg text-sky-600">
                            <Users size={16} />
                          </div>
                          <div>
                            <h3 className="text-gray-900 font-medium">{t.premium} Voice</h3>
                            <p className="text-gray-500 text-xs">{t.selectPremiumVoice}</p>
                          </div>
                        </div>
                        <select 
                          className="w-full bg-white shadow-md border border-gray-300 rounded-lg p-2 text-gray-900 outline-none focus:ring-2 focus:ring-sky-500"
                          value={premiumVoice}
                          onChange={(e) => {
                            setPremiumVoice(e.target.value);
                            safeStorage.setItem('premiumVoice', e.target.value);
                          }}
                        >
                          <option value="Fenrir" className="bg-zinc-800">{t.fenrirDesc}</option>
                          <option value="Charon" className="bg-zinc-800">{t.charonDesc}</option>
                          <option value="Puck" className="bg-zinc-800">{t.puckDesc}</option>
                          <option value="Kore" className="bg-zinc-800">{(t as any).koreDesc || "Kore (Calm Female)"}</option>
                          <option value="Zephyr" className="bg-zinc-800">{(t as any).zephyrDesc || "Zephyr (Strong Female)"}</option>
                        </select>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-sky-100 rounded-lg text-sky-600">
                            <Users size={16} />
                          </div>
                          <div>
                            <h3 className="text-gray-900 font-medium">{t.standard} Voice</h3>
                            <p className="text-gray-500 text-xs">{t.selectStandardVoice}</p>
                          </div>
                        </div>
                        <select 
                          className="w-full bg-white shadow-md border border-gray-300 rounded-lg p-2 text-gray-900 outline-none focus:ring-2 focus:ring-sky-500"
                          value={selectedVoiceURI}
                          onChange={(e) => setSelectedVoiceURI(e.target.value)}
                        >
                          <option value="" className="bg-zinc-800">{t.autoSelect}</option>
                          {availableVoices.map((v, index) => (
                            <option key={`${v.voiceURI}-${index}`} value={v.voiceURI} className="bg-zinc-800">
                              {v.name} ({v.lang})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-sky-100 rounded-lg text-sky-600">
                          <Zap size={20} />
                        </div>
                        <div>
                          <h3 className="text-gray-900 font-medium">{t.speechRate || "Speech Rate"}</h3>
                          <p className="text-gray-500 text-xs">{t.adjustRate || "Adjust voice speed"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input 
                          type="range" 
                          min="0.5" 
                          max="2" 
                          step="0.1" 
                          value={speechRate} 
                          onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                          className="w-24 md:w-32 accent-sky-500"
                        />
                        <span className="text-gray-700 w-8 text-right">{speechRate.toFixed(1)}x</span>
                      </div>
                    </div>

                    <div className="h-px w-full bg-white shadow-md"></div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-sky-100 rounded-lg text-sky-600">
                          <Volume2 size={20} />
                        </div>
                        <div>
                          <h3 className="text-gray-900 font-medium">{t.speechPitch || "Speech Pitch"}</h3>
                          <p className="text-gray-500 text-xs">{t.adjustPitch || "Adjust voice pitch"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input 
                          type="range" 
                          min="0.5" 
                          max="2" 
                          step="0.1" 
                          value={speechPitch} 
                          onChange={(e) => setSpeechPitch(parseFloat(e.target.value))}
                          className="w-24 md:w-32 accent-sky-500"
                        />
                        <span className="text-gray-700 w-8 text-right">{speechPitch.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chat Area */}
          <main id="main-scroll-container" className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col relative">
            <div className="flex-1 flex-shrink-0 min-h-[20px]"></div>
            <div id="chat-messages-container" className="max-w-3xl mx-auto w-full space-y-6 relative transition-opacity duration-300 opacity-100">
              {!isLive && messages.map((msg) => {
                const { mainText, questions } = parseMessage(msg.text);
                return (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id} 
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[95%] md:max-w-[85%] p-3 rounded-[2rem] ${msg.role === 'user' ? 'bg-white shadow-md backdrop-blur-md border border-gray-300 shadow-[0_4px_15px_rgba(0,0,0,0.1)]' : ''}`}>
                    {msg.role === 'model' && (
                      <div id={`message-header-${msg.id}`} className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-yellow-500 drop-shadow-sm">
                          <div className="flex items-center justify-center w-7 h-7 relative mt-1">
                            <Flame size={24} className="text-orange-500 relative z-10" />
                            <div className="absolute -top-2 right-0.5 z-20">
                              <Sparkles size={10} className="text-blue-400 animate-pulse drop-shadow-sm" />
                            </div>
                          </div>
                          <span className="font-mukta text-sm">{displayBotName}</span>
                        </div>
                        
                        {/* Speaker Button at Top Right */}
                        {!(playingMessageId === msg.id && !isPaused && isGeneratingAudio !== msg.id) && (
                          <button 
                            onClick={() => playMessageAudio(mainText, msg.id)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white shadow-md hover:bg-gray-100 shadow-md text-gray-800 hover:text-gray-900 rounded-lg transition-colors text-sm font-medium"
                            title={playingMessageId === msg.id ? (isPaused ? t.listenAgain : t.stop) : t.listen}
                            disabled={isGeneratingAudio === msg.id}
                          >
                            {isGeneratingAudio === msg.id ? (
                              <>
                                <div className="w-4 h-4 border-2 border-gray-300 border-t-white rounded-full animate-spin"></div>
                                <span>{t.loading}</span>
                              </>
                            ) : playingMessageId === msg.id ? (
                              isPaused ? (
                                <>
                                  <Play size={18} className="fill-current" />
                                  <span>{t.listenAgain}</span>
                                </>
                              ) : (
                                <>
                                  <Pause size={18} className="fill-current" />
                                  <span>{t.stop}</span>
                                </>
                              )
                            ) : (
                              <>
                                <Volume2 size={18} />
                                <span>{t.listen}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                    {msg.role === 'user' && (
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 relative">
                          <button 
                            onClick={() => handleCopy(msg.text, msg.id)}
                            className="p-1 text-blue-600 hover:text-gray-900 hover:bg-white shadow-md rounded transition-colors"
                            title={t.copy}
                          >
                            {copiedMessageId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation();
                              setInput(msg.text);
                              setEditMsgId(msg.id);
                            }}
                            className="p-1 text-blue-600 hover:text-gray-900 hover:bg-white shadow-md rounded transition-colors"
                            title={t.edit}
                          >
                            <Edit2 size={12} />
                          </button>
                        </div>
                        <div className="text-xs font-semibold text-blue-700">
                          <span>{t.you}</span>
                        </div>
                      </div>
                    )}
                    <div 
                      className={`prose max-w-none text-gray-900  ${msg.role === 'user' ? 'prose-lg md:prose-xl text-right' : 'prose-2xl md:prose-2xl prose-p:text-[224px] md:prose-p:text-[288px] prose-li:text-[224px] md:prose-li:text-[288px] prose-strong:text-[224px] md:prose-strong:text-[288px] prose-headings:text-[256px] md:prose-headings:text-[320px] font-medium text-left leading-tight ai-message-content'}`}
                    >
                      {msg.image && (
                        <div className="mb-3 flex justify-end">
                          <img 
                            src={`data:${msg.image.mimeType};base64,${msg.image.data}`} 
                            alt="Uploaded content" 
                            className="max-w-[200px] md:max-w-[300px] rounded-xl border border-gray-200 shadow-sm"
                          />
                        </div>
                      )}
                      {playingMessageId === msg.id ? (
                        <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                          {highlightMarkdown(mainText, playingTextIndex)}
                        </ReactMarkdown>
                      ) : (
                        <ReactMarkdown rehypePlugins={[rehypeRaw]}>{mainText}</ReactMarkdown>
                      )}
                    </div>
                    {msg.role === 'model' && (
                      <>
                        <div id={`message-actions-${msg.id}`} className="mt-3 flex justify-end items-center gap-2">
                          {msg.id === '1' && !currentChatId && (
                            <button
                              onClick={() => setIsSaveModalOpen(true)}
                              className="flex items-center justify-center gap-2 px-3 py-1.5 bg-sky-100 hover:bg-sky-200 text-sky-700 hover:text-sky-800 rounded-lg transition-colors mr-auto text-sm font-medium border border-sky-200"
                              title={t.saveChat}
                            >
                              <Bookmark size={14} />
                              <span>{t.saveChat}</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleCopy(msg.text, msg.id)}
                            className="flex items-center justify-center p-2 bg-white shadow-sm hover:bg-white shadow-md text-gray-600 hover:text-gray-900 rounded-lg transition-colors"
                            title={t.copy}
                          >
                            {copiedMessageId === msg.id ? (
                              <Check size={16} className="text-green-400" />
                            ) : (
                              <Copy size={16} />
                            )}
                          </button>
                          <button
                            onClick={() => handleShare(msg.text)}
                            className="flex items-center justify-center p-2 bg-white shadow-sm hover:bg-white shadow-md text-gray-600 hover:text-gray-900 rounded-lg transition-colors"
                            title={t.share}
                          >
                            <Share2 size={16} />
                          </button>
                        </div>
                        {questions.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2 justify-center md:justify-start">
                            {questions.map((q, idx) => (
                              <button
                                key={`${msg.id}-q-${idx}`}
                                onClick={() => handleSend(q)}
                                disabled={isLoading}
                                className="text-xs md:text-sm bg-white hover:bg-white border border-sky-300 text-sky-800 px-3 py-2 rounded-full transition-colors shadow-sm disabled:opacity-50"
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              )})}
              
              {!isLive && messages.length === 1 && !userName && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex justify-start mt-4"
                >
                  <div className="max-w-[95%] md:max-w-[85%] p-4 sm:p-5 rounded-2xl bg-white border border-sky-100 shadow-sm text-gray-800">
                    <div className="flex items-center gap-2 mb-3 text-sky-600">
                      <Bot size={20} />
                      <h3 className="font-medium">{uiLang === 'hi' ? 'अपने सहायक का नाम रखें' : 'Name Your Assistant'}</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                      {uiLang === 'hi' ? 'आप मुझे क्या बुलाना चाहेंगे? आप अपने AI सहायक के लिए एक कस्टम नाम सेट कर सकते हैं। आप अपना नाम भी आजमा सकते हैं।' : 'What would you like to call me? You can set a custom name for your AI assistant. You can also try your own name.'}
                    </p>
                    <div className="flex flex-col gap-3">
                      <input
                        type="text"
                        value={setupName}
                        onChange={(e) => setSetupName(e.target.value)}
                        placeholder={t.userNamePlaceholder}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1 h-8 text-sm outline-none focus:border-sky-400 transition-colors"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && setupName.trim()) {
                            const newName = setupName.trim();
                            setUserName(newName);
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          const newName = setupName.trim();
                          setUserName(newName);
                        }}
                        className="w-1/2 mx-auto bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        {setupName.trim() ? (uiLang === 'hi' ? 'सुरक्षित करें' : 'Save') : (uiLang === 'hi' ? 'कस्टम नाम सेव करें' : 'Save Custom Name')}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {messages.length === 1 && !isLive && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="flex flex-wrap gap-2 mt-4 justify-center md:justify-start"
                >
                  {[
                    t.q1,
                    t.q2,
                    t.q3,
                    t.q4
                  ].map((question, idx) => (
                    <button
                      key={`initial-q-${idx}`}
                      onClick={() => handleSend(question)}
                      className="text-xs md:text-sm bg-white hover:bg-white border border-sky-300 text-sky-800 px-3 py-2 rounded-full transition-colors shadow-sm"
                    >
                      {question}
                    </button>
                  ))}
                </motion.div>
              )}

              {isLoading && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="p-2 flex items-center gap-3">
                    <Loader2 size={18} className="animate-spin text-yellow-500" />
                    <span className="text-sm text-gray-600"><span className="text-yellow-500 font-semibold drop-shadow-sm">{displayBotName}</span> {getGenderAdjustedText(t.thinking, uiLang, displayBotName)}</span>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {isLive && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center z-50 overflow-hidden"
              >
                {/* Virtual AI Background */}
                <VirtualNetworkBackground />
                {/* Circuit Background Pattern */}
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                  <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <pattern id="circuit" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
                        <path d="M 0 50 L 100 50 M 50 0 L 50 100" stroke="#3b82f6" strokeWidth="0.5" opacity="0.3" />
                        <circle cx="50" cy="50" r="2" fill="#3b82f6" opacity="0.5" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#circuit)" />
                  </svg>
                </div>

                <div className="relative flex flex-col items-center justify-center w-full h-full pb-40 md:pb-48">
                  {/* Screen Share Preview */}
                  <AnimatePresence>
                    {isScreenSharing && latestFrame && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="absolute top-4 left-4 z-40 w-48 h-32 md:w-64 md:h-40 rounded-2xl overflow-hidden border-2 border-blue-400/50 shadow-2xl bg-black"
                      >
                        <img 
                          src={latestFrame}
                          alt="Screen Preview"
                          className="w-full h-full object-cover"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Nard Realistic Robot Avatar */}
                  <div 
                    ref={avatarContainerRef}
                    className="relative z-10 w-60 h-60 md:w-96 md:h-96 flex items-center justify-center transition-all duration-300"
                  >
                    {/* Glowing Aura */}
                    {isModelSpeaking && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ 
                          opacity: [0.2, 0.5, 0.2], 
                          scale: [1, 1.2, 1],
                        }}
                        transition={{ 
                          repeat: Infinity, 
                          duration: 3,
                          ease: "easeInOut"
                        }}
                        className="absolute inset-0 rounded-full bg-yellow-400/20 blur-[60px] md:blur-[100px] z-0"
                      />
                    )}

                    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full overflow-visible relative z-10">
                      <defs>
                        <linearGradient id="glassFace" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#1e293b" />
                          <stop offset="100%" stopColor="#020617" />
                        </linearGradient>
                        <radialGradient id="eyeGlow" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="#60a5fa" stopOpacity="1" />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                        </radialGradient>
                        <radialGradient id="yellowEyeGlow" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="#facc15" stopOpacity="1" />
                          <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
                        </radialGradient>
                        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                          <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#000000" floodOpacity="0.5" />
                        </filter>
                      </defs>

                      {/* Robot Head Structure */}
                      <g filter="url(#shadow)">
                        {/* Outer Shell */}
                        <path d="M 40 60 C 40 20, 160 20, 160 60 C 160 140, 130 180, 100 180 C 70 180, 40 140, 40 60 Z" fill="url(#glassFace)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                        
                        {/* Inner Face Plate */}
                        <path d="M 55 70 C 55 40, 145 40, 145 70 C 145 130, 120 160, 100 160 C 80 160, 55 130, 55 70 Z" fill="rgba(0,0,0,0.4)" />
                      </g>
                      
                      {/* Eyes */}
                      <g>
                        {/* Left Eye */}
                        <motion.circle 
                          cx="75" cy="80" r="12" 
                          fill={isModelSpeaking ? "url(#yellowEyeGlow)" : "url(#eyeGlow)"} 
                          opacity="0.8" 
                          animate={isModelSpeaking ? { scaleY: [1, 0.1, 1] } : { scaleY: 1 }}
                          transition={isModelSpeaking ? { repeat: Infinity, duration: 0.2, repeatDelay: 3, ease: "easeInOut" } : {}}
                          style={{ originX: "75px", originY: "80px" }}
                        />
                        <motion.circle 
                          cx="75" cy="80" r="4" 
                          fill={isModelSpeaking ? "#facc15" : "#60a5fa"} 
                          animate={isModelSpeaking ? { scaleY: [1, 0.1, 1] } : { scaleY: 1 }}
                          transition={isModelSpeaking ? { repeat: Infinity, duration: 0.2, repeatDelay: 3, ease: "easeInOut" } : {}}
                          style={{ originX: "75px", originY: "80px" }}
                        />
                        
                        {/* Right Eye */}
                        <motion.circle 
                          cx="125" cy="80" r="12" 
                          fill={isModelSpeaking ? "url(#yellowEyeGlow)" : "url(#eyeGlow)"} 
                          opacity="0.8" 
                          animate={isModelSpeaking ? { scaleY: [1, 0.1, 1] } : { scaleY: 1 }}
                          transition={isModelSpeaking ? { repeat: Infinity, duration: 0.2, repeatDelay: 3, ease: "easeInOut" } : {}}
                          style={{ originX: "125px", originY: "80px" }}
                        />
                        <motion.circle 
                          cx="125" cy="80" r="4" 
                          fill={isModelSpeaking ? "#facc15" : "#60a5fa"} 
                          animate={isModelSpeaking ? { scaleY: [1, 0.1, 1] } : { scaleY: 1 }}
                          transition={isModelSpeaking ? { repeat: Infinity, duration: 0.2, repeatDelay: 3, ease: "easeInOut" } : {}}
                          style={{ originX: "125px", originY: "80px" }}
                        />
                      </g>

                      {/* Realistic Lips */}
                      <g>
                        <motion.path
                          d={mouthPath}
                          stroke={isModelSpeaking ? "#facc15" : "#60a5fa"}
                          strokeWidth="3"
                          fill={isModelSpeaking ? "rgba(250, 204, 21, 0.2)" : "none"}
                          strokeLinecap="round"
                        />
                        {/* Subtle Glow under mouth when speaking */}
                        {isModelSpeaking && (
                          <motion.circle
                            cx="100" cy="150" r="10"
                            fill="#facc15"
                            opacity="0.2"
                            animate={{ scale: [1, 1.5, 1], opacity: [0.1, 0.3, 0.1] }}
                            transition={{ repeat: Infinity, duration: 0.3 }}
                          />
                        )}
                      </g>
                    </svg>
                  </div>

                  {/* Status Indicator */}
                  <div className="absolute bottom-12 flex flex-col items-center z-30 w-full">
                    <motion.div 
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="flex items-center gap-3 bg-white shadow-sm backdrop-blur-md px-6 py-2 rounded-full border border-gray-200 shadow-xl mb-8"
                    >
                      <div className={`w-3 h-3 rounded-full ${isModelSpeaking ? 'bg-yellow-400 shadow-[0_0_10px_#facc15]' : 'bg-blue-400 shadow-[0_0_10px_#60a5fa] animate-pulse'}`}></div>
                      <span className="text-gray-900 font-mukta font-bold text-xl md:text-2xl tracking-wide">
                        {isModelSpeaking 
                          ? getGenderAdjustedText(t.speaking, uiLang, displayBotName) 
                          : getGenderAdjustedText(t.listening, uiLang, displayBotName)}
                      </span>
                    </motion.div>

                    {/* Controls */}
                    <div className="relative flex items-center justify-center w-full">
                      {/* Screen Share Toggle Button */}
                      <div className="absolute left-8 md:left-16 flex items-center justify-center">
                        <button
                          onClick={toggleScreenShare}
                          className={`relative w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center z-10 border-2 transition-all duration-300 hover:scale-105 active:scale-95 ${
                            isScreenSharing
                              ? 'bg-gradient-to-br from-blue-500 to-blue-700 shadow-[0_5px_20px_rgba(30,58,138,0.4)] border-blue-300'
                              : 'bg-white shadow-md border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {isScreenSharing ? (
                            <MonitorUp size={24} className="text-white" />
                          ) : (
                            <MonitorOff size={24} className="text-gray-600" />
                          )}
                        </button>
                        <span className="absolute -bottom-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">
                          {isScreenSharing ? t.screenOn : t.screenOff}
                        </span>
                      </div>

                      <div className="relative flex items-center justify-center">
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className={`absolute w-32 h-32 md:w-40 md:h-40 rounded-full border-2 ${isModelSpeaking ? 'border-yellow-400/30' : (isMicMuted ? 'border-red-400/30' : 'border-blue-400/30')}`}
                        ></motion.div>
                        
                        <button
                          onClick={toggleMicMute}
                          className={`relative w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center z-10 border-2 transition-all duration-300 hover:scale-105 active:scale-95 ${
                            isMicMuted
                              ? 'bg-gradient-to-br from-red-500 to-red-700 shadow-[0_10px_30px_rgba(239,68,68,0.5)] border-red-300'
                              : isModelSpeaking 
                                ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-[0_10px_30px_rgba(234,179,8,0.5)] border-yellow-200/50' 
                                : 'bg-gradient-to-br from-blue-500 to-blue-700 shadow-[0_10px_30px_rgba(30,58,138,0.5)] border-gray-300'
                          }`}
                        >
                          {isMicMuted ? (
                            <MicOff size={40} className="md:w-12 md:h-12 text-white" />
                          ) : (
                            <Mic size={40} className="md:w-12 md:h-12 text-white" />
                          )}
                        </button>
                      </div>

                      {/* Close Button */}
                      <div className="absolute right-8 md:right-16 flex items-center justify-center">
                        <button
                          onClick={toggleLiveAudio}
                          className="relative w-14 h-14 md:w-16 md:h-16 bg-white/80 hover:bg-white text-gray-800 rounded-full shadow-md border border-gray-200 transition-all hover:scale-105 active:scale-95 flex items-center justify-center backdrop-blur-md"
                          title={t.back}
                        >
                          <X size={24} className="text-gray-600" />
                        </button>
                        <span className="absolute -bottom-6 text-[10px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">
                          {t.back}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </main>

          {/* Input Area */}
          <footer className="p-4 pb-5 sm:pb-6 relative z-20">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                className="max-w-3xl mx-auto mb-2 bg-red-500/95 text-white px-4 py-3 rounded-2xl shadow-xl text-sm font-medium flex items-start gap-2 backdrop-blur-md border border-red-400/50"
              >
                <Info size={18} className="mt-0.5 shrink-0" />
                <p className="flex-1">{error}</p>
                <button 
                  onClick={() => setError(null)}
                  className="p-1 hover:bg-white shadow-md rounded-full transition-colors"
                >
                  <X size={16} />
                </button>
              </motion.div>
            )}
        <div className="max-w-3xl mx-auto relative flex items-end gap-2">
          {!isLive && (
            <div className="w-full relative flex flex-col bg-white shadow-md backdrop-blur-xl border border-gray-300 shadow-[0_8px_32px_rgba(0,0,0,0.2)] rounded-[2rem] p-2 transition-all duration-300 focus-within:bg-gray-100 shadow-md focus-within:border-gray-400 focus-within:shadow-[0_8px_32px_rgba(255,255,255,0.1)]">
              {editMsgId && (
                <div className="flex items-center justify-between bg-blue-50 text-blue-700 px-3 py-1.5 mb-2 rounded-xl border border-blue-100 text-xs font-medium mx-2 mt-1">
                  <div className="flex items-center gap-1.5">
                    <Edit2 size={12} />
                    <span>{t.edit}</span>
                  </div>
                  <button 
                    onClick={() => {
                      setEditMsgId(null);
                      setInput('');
                      setSelectedImage(null);
                    }}
                    className="text-blue-500 hover:text-blue-800 p-0.5 rounded-full hover:bg-blue-100 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              {selectedImage && (
                <div className="relative w-20 h-20 mb-2 ml-12">
                  <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} alt="Selected" className="w-full h-full object-cover rounded-lg border border-gray-300 shadow-sm" />
                  <button 
                    onClick={() => setSelectedImage(null)} 
                    className="absolute -top-2 -right-2 bg-white text-gray-800 rounded-full p-1 shadow-md border border-gray-200 hover:bg-gray-100"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className="flex items-end w-full">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center w-11 h-11 rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors shrink-0 mb-1 ml-1"
                  title={t.uploadImage}
                >
                  <Plus size={24} />
                </button>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                />
                
                {!input && !selectedImage && !isInputFocused && !isVoiceTyping && (
                  <div className={`absolute top-0 left-[48px] right-0 h-full pointer-events-none py-3 px-2 ${
                    (isLoading || isVoiceTyping)
                      ? 'pr-[60px] sm:pr-[70px]' 
                      : 'pr-[110px] sm:pr-[120px]'
                  }`}>
                    <div 
                      ref={placeholderRef}
                      className="w-full h-full text-gray-400 font-medium overflow-hidden"
                      style={{ scrollBehavior: 'smooth', wordBreak: 'break-word' }}
                    >
                      {placeholderText}
                    </div>
                  </div>
                )}

                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  placeholder=""
                  className={`w-full bg-transparent text-gray-900 placeholder-gray-400 py-3 px-2 focus:outline-none resize-none min-h-[56px] max-h-32 font-medium ${
                    (isLoading || (input.trim() && !isVoiceTyping) || (!input.trim() && isVoiceTyping) || selectedImage)
                      ? 'pr-[60px] sm:pr-[70px]' 
                      : 'pr-[110px] sm:pr-[120px]'
                  }`}
                  rows={1}
                  disabled={isLoading}
                />
                <div className="absolute right-2 bottom-2 flex gap-2">
                  {(!input.trim() && !selectedImage || isVoiceTyping) && !isLoading && (
                    <button
                      onClick={toggleVoiceTyping}
                      className={`flex items-center justify-center w-11 h-11 rounded-full transition-all transform active:scale-95 border group ${
                        isVoiceTyping 
                          ? 'bg-gradient-to-r from-pink-500 via-purple-500 to-sky-500 text-white border-transparent shadow-[0_0_15px_rgba(168,85,247,0.6)] animate-pulse' 
                          : 'bg-white shadow-md text-gray-800 hover:bg-gray-100 shadow-md hover:text-gray-900 border-gray-300'
                      }`}
                      title={isVoiceTyping ? t.stopVoiceTyping : t.voiceTyping}
                    >
                      {isVoiceTyping ? (
                        <div className="relative flex items-center justify-center">
                          <MicOff size={20} className="group-hover:scale-110 transition-transform" />
                          <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_4px_rgba(59,130,246,0.8)]"></div>
                        </div>
                      ) : (
                        <div className="relative flex items-center justify-center">
                          <Mic size={20} className="group-hover:scale-110 transition-transform" />
                          <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_4px_rgba(59,130,246,0.8)]"></div>
                        </div>
                      )}
                    </button>
                  )}
                  {!input.trim() && !selectedImage && !isVoiceTyping && !isLoading && (
                    <button
                      onClick={toggleLiveAudio}
                      className="relative overflow-hidden flex items-center justify-center w-11 h-11 bg-[#e83e8c] text-white rounded-full hover:bg-[#d6337f] transition-all transform active:scale-95 shadow-[0_0_15px_rgba(232,62,140,0.5)] border border-[#e83e8c]/30 group"
                      title={t.startVoiceChat}
                    >
                      <span className="absolute inset-0 w-full h-full bg-white/60 rounded-full animate-ping" style={{ animationDuration: '3s' }}></span>
                      <span className="absolute inset-0 w-full h-full bg-white/40 rounded-full animate-ping" style={{ animationDuration: '3s', animationDelay: '1.5s' }}></span>
                      <div className="relative flex items-center justify-center z-10">
                        <AudioLines size={22} className="group-hover:scale-110 transition-transform" />
                      </div>
                    </button>
                  )}
                  {isLoading ? (
                    <button
                      onClick={handleStopGeneration}
                      className="flex items-center justify-center w-11 h-11 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all transform active:scale-95 shadow-[0_0_15px_rgba(239,68,68,0.5)] border border-red-400/30"
                      title={t.stopGenerating}
                    >
                      <Square size={18} className="fill-current" />
                    </button>
                  ) : (input.trim() || selectedImage) ? (
                    <button
                      onClick={() => handleSend(undefined, false, editMsgId || undefined)}
                      className="relative flex items-center justify-center w-11 h-11 bg-gradient-to-tr from-blue-600 to-indigo-500 text-white rounded-full hover:from-blue-500 hover:to-indigo-400 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-[0_4px_14px_0_rgba(99,102,241,0.39)] hover:shadow-[0_6px_20px_rgba(99,102,241,0.5)] group"
                    >
                      <ArrowUp size={22} strokeWidth={2.5} className="relative z-10 group-hover:-translate-y-1 transition-transform duration-300" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="max-w-3xl mx-auto mt-2 text-center">
          <p className="text-xs text-blue-700/80 flex items-center justify-center gap-1">
            <Info size={12} />
            {t.poweredBy}
          </p>
        </div>
      </footer>

      {/* Save Chat Modal */}
      <AnimatePresence>
        {isSaveModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-gray-300 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">{t.saveChat}</h2>
              <input
                type="text"
                value={chatNameInput}
                onChange={(e) => setChatNameInput(e.target.value)}
                placeholder={t.enterChatName}
                className="w-full bg-white shadow-md border border-gray-300 rounded-xl p-3 text-gray-900 outline-none focus:ring-2 focus:ring-sky-500 mb-6"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveChat();
                }}
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setIsSaveModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white shadow-md hover:bg-gray-100 shadow-md text-gray-900 transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleSaveChat}
                  disabled={!chatNameInput.trim()}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white transition-colors disabled:opacity-50"
                >
                  {t.save}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat History Sidebar */}
      <AnimatePresence>
        {isHistoryOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-80 bg-white border-r border-gray-200 shadow-2xl flex flex-col"
            >
              <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <MessageSquare size={20} className="text-sky-600" />
                  {t.chatHistory}
                </h2>
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className="p-2 hover:bg-white shadow-md rounded-full transition-colors text-gray-600 hover:text-gray-900"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-4">
                <button
                  onClick={handleNewChat}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-sky-100 hover:bg-sky-200 text-sky-600 border border-sky-300 rounded-xl transition-colors font-medium"
                >
                  <MessageSquare size={18} />
                  {t.newChat}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pt-0 space-y-2">
                {savedChats.length === 0 ? (
                  <div className="text-center text-gray-400 py-8 text-sm">
                    {t.noSavedChats}
                  </div>
                ) : (
                  [...savedChats].sort((a, b) => {
                    if (a.isPinned && !b.isPinned) return -1;
                    if (!a.isPinned && b.isPinned) return 1;
                    return b.timestamp - a.timestamp;
                  }).map(chat => (
                    <div
                      key={chat.id}
                      onClick={() => handleLoadChat(chat)}
                      className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors border ${
                        currentChatId === chat.id 
                          ? 'bg-sky-100 border-sky-400 text-sky-800' 
                          : 'bg-white shadow-sm border-transparent hover:bg-white shadow-md text-gray-700 hover:text-gray-900'
                      }`}
                    >
                      {editingChatId === chat.id ? (
                        <div className="flex-1 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editingChatName}
                            onChange={(e) => setEditingChatName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename();
                              if (e.key === 'Escape') handleCancelRename();
                            }}
                            className="flex-1 bg-white border-gray-300 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 outline-none focus:border-sky-500"
                            autoFocus
                          />
                          <button onClick={handleSaveRename} className="p-1 text-green-400 hover:bg-green-400/20 rounded" title={t.save}>
                            <Check size={14} />
                          </button>
                          <button onClick={handleCancelRename} className="p-1 text-red-600 hover:bg-red-400/20 rounded" title={t.cancel}>
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-col overflow-hidden flex-1">
                            <div className="flex items-center gap-2">
                              {chat.isPinned && <Pin size={12} className="text-sky-600 flex-shrink-0 fill-current" />}
                              <span className="font-medium truncate">{chat.name}</span>
                            </div>
                            <span className="text-xs opacity-60">
                              {new Date(chat.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => handleTogglePin(e, chat.id)}
                              className={`p-1.5 rounded-lg transition-colors ${chat.isPinned ? 'text-sky-600 hover:bg-sky-400/10' : 'text-gray-400 hover:text-gray-900 hover:bg-white shadow-md'}`}
                              title={chat.isPinned ? t.unpinChat : t.pinChat}
                            >
                              <Pin size={14} className={chat.isPinned ? "fill-current" : ""} />
                            </button>
                            <button
                              onClick={(e) => handleStartRename(e, chat)}
                              className="p-1.5 text-gray-400 hover:text-sky-600 hover:bg-sky-400/10 rounded-lg transition-colors"
                              title={t.renameChat}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={(e) => handleDeleteChat(e, chat.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-400/10 rounded-lg transition-colors"
                              title={t.deleteChat}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
