import React, { useState, useEffect, useRef } from 'react';   
import { GoogleGenAI, ThinkingLevel, LiveServerMessage, Modality } from '@google/genai';
import { Send, Mic, MicOff, Volume2, Square, VolumeX, BrainCircuit, Zap, MessageSquare, Info, Loader2, Users, Settings2, Play, Pause, Copy, Check, Globe, Share2, AudioLines, X, Bookmark, Pin, Edit2, Trash2, MoreVertical, Menu } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { motion, AnimatePresence, useMotionValue, animate } from 'motion/react';

// Global error suppression for Google/SDK errors to prevent platform toasts
// We define this at the top level to catch errors as early as possible
let globalSetError: ((msg: string | null) => void) | null = null;

const isQuotaError = (msg: string) => {
  const lowerMsg = String(msg).toLowerCase();
  return lowerMsg.includes('quota') || 
         lowerMsg.includes('429') || 
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
         lowerMsg.includes('busy');
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

  if (isQuotaError(msg)) {
    if (globalSetError) globalSetError("Traffic limit exceeded. Please try again later.");
    return; // Suppress the actual console output
  }
  originalConsoleError.apply(console, args);
};

const originalOnError = window.onerror;
window.onerror = (msg, url, line, col, error) => {
  const errorMsg = String(msg);
  if (isQuotaError(errorMsg)) {
    if (globalSetError) globalSetError("Traffic limit exceeded. Please try again later.");
    return true; // Suppress
  }
  if (originalOnError) {
    return originalOnError(msg, url, line, col, error);
  }
  return false;
};

window.addEventListener('unhandledrejection', (event) => {
  const reason = (event.reason?.message || String(event.reason));
  if (isQuotaError(reason)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (globalSetError) globalSetError("Traffic limit exceeded. Please try again later.");
  }
}, true);

window.addEventListener('error', (event) => {
  if (isQuotaError(event.message)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (globalSetError) globalSetError("Traffic limit exceeded. Please try again later.");
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

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
      className="fixed z-50 text-red-400 hover:text-red-300 bg-gray-900/90 border border-red-500/30 hover:bg-gray-800 rounded-full p-2.5 shadow-xl transition-all flex items-center justify-center cursor-pointer animate-in fade-in zoom-in duration-200"
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
    title: "Gen-Z",
    subtitle: "AI Messenger, E-MAITRI.",
    you: "You",
    copy: "Copy",
    copied: "Copied",
    listen: "Listen",
    stop: "Stop",
    listenAgain: "Listen again",
    speaking: "Gen-Z is speaking...",
    listening: "Gen-Z is listening...",
    thinking: "is thinking...",
    liveChatOn: "Live Voice Chat is on: Please speak",
    stopVoiceChat: "Stop Voice Chat",
    startVoiceChat: "Start Live Voice Chat",
    voiceTyping: "Voice Typing",
    stopVoiceTyping: "Stop Voice Typing",
    speechNotSupported: "Speech recognition is not supported in this browser.",
    liveChat: "Live Chat",
    typeMessage: "Type a message...",
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
    initialMessage: "I am Gen-Z! Welcome to the E-Maitri portal! Tell me friend, how can I help you? What information do you need?",
    errorTraffic: "Sorry, there is too much traffic right now or the quota is exhausted. Please try again later.",
    errorTech: "Sorry, a technical issue occurred. Please try again.",
    premiumQuotaExceeded: "Premium voice quota exceeded. Falling back to standard voice."
  },
  hi: {
    title: "जेन-जी",
    subtitle: "एआई मैसेंजर, ई-मैत्री.",
    you: "आप",
    copy: "कॉपी करें",
    copied: "कॉपी किया गया",
    listen: "सुनें",
    stop: "रोकें",
    listenAgain: "फिर से सुनें",
    speaking: "जेन-जी बोल रहे हैं...",
    listening: "जेन-जी सुन रहे हैं...",
    thinking: "सोच रहे हैं...",
    liveChatOn: "लाइव वॉइस चैट चालू है: कृपया बोलें",
    stopVoiceChat: "वॉइस चैट बंद करें",
    startVoiceChat: "लाइव वॉइस चैट शुरू करें",
    voiceTyping: "बोलकर टाइप करें",
    stopVoiceTyping: "बोलना बंद करें",
    speechNotSupported: "आपके ब्राउज़र में स्पीच रिकग्निशन सपोर्ट नहीं है।",
    liveChat: "लाइव चैट",
    typeMessage: "संदेश टाइप करें...",
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
    initialMessage: "मैं Gen-Z हूं! ई-मैत्री पोर्टल में आपका स्वागत है! बताइए मित्र मैं आपको किस तरह से सहयोग कर सकता हूं? आपको क्या जानकारी चाहिए?",
    errorTraffic: "क्षमा करें, अभी अधिक ट्रैफिक है या कोटा समाप्त हो गया है। कृपया कुछ समय बाद पुनः प्रयास करें।",
    errorTech: "क्षमा करें, एक तकनीकी त्रुटि हुई। कृपया पुनः प्रयास करें।",
    premiumQuotaExceeded: "प्रीमियम वॉइस कोटा समाप्त हो गया है। मानक वॉइस पर स्विच किया जा रहा है।"
  },
  bho: {
    title: "जेन-जी",
    subtitle: "एआई मैसेंजर, ई-मैत्री.",
    you: "रउआ",
    copy: "कॉपी करीं",
    copied: "कॉपी हो गइल",
    listen: "सुनीं",
    stop: "रोकीं",
    listenAgain: "फेरु से सुनीं",
    speaking: "जेन-जी बोल रहल बाड़े...",
    listening: "जेन-जी सुन रहल बाड़े...",
    thinking: "सोच रहल बाड़े...",
    liveChatOn: "लाइव वॉइस चैट चालू बा: कृपया बोलीं",
    stopVoiceChat: "वॉइस चैट बंद करीं",
    startVoiceChat: "लाइव वॉइस चैट शुरू करीं",
    voiceTyping: "बोल के टाइप करीं",
    stopVoiceTyping: "बोलल बंद करीं",
    speechNotSupported: "रउआ ब्राउज़र में स्पीच रिकग्निशन सपोर्ट नइखे।",
    liveChat: "लाइव चैट",
    typeMessage: "संदेश टाइप करीं...",
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
    initialMessage: "हम जेन-जी हईं! ई-मैत्री पोर्टल में रउआ सभे के स्वागत बा! बताईं दोस्त, हम रउआ के कइसे मदद कर सकीले? रउआ के का जानकारी चाहीं?",
    errorTraffic: "माफ करीं, अभी बहुत ट्रैफिक बा या कोटा खतम हो गइल बा। कृपया कुछ देर बाद फेरु से कोशिश करीं।",
    errorTech: "माफ करीं, एगो तकनीकी दिक्कत आ गइल बा। कृपया फेरु से कोशिश करीं।",
    premiumQuotaExceeded: "प्रीमियम वॉइस कोटा खतम हो गइल बा। स्टैंडर्ड वॉइस पर स्विच हो रहल बा।"
  },
  bn: {
    title: "জেন-জি",
    subtitle: "এআই মেসেঞ্জার, ই-মৈত্রী.",
    you: "আপনি",
    copy: "কপি করুন",
    copied: "কপি করা হয়েছে",
    listen: "শুনুন",
    stop: "থামান",
    listenAgain: "আবার শুনুন",
    speaking: "জেন-জি কথা বলছে...",
    listening: "জেন-জি শুনছে...",
    thinking: "চিন্তা করছে...",
    liveChatOn: "লাইভ ভয়েস চ্যাট চালু আছে: দয়া করে কথা বলুন",
    stopVoiceChat: "ভয়েস চ্যাট বন্ধ করুন",
    startVoiceChat: "লাইভ ভয়েস চ্যাট শুরু করুন",
    liveChat: "লাইভ চ্যাট",
    typeMessage: "একটি বার্তা লিখুন...",
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
    initialMessage: "আমি জেন-জি! ই-মৈত্রী পোর্টালে আপনাকে স্বাগতম! বলুন বন্ধু, আমি আপনাকে কীভাবে সাহায্য করতে পারি? আপনার কী তথ্য দরকার?",
    errorTraffic: "দুঃখিত, এই মুহূর্তে খুব বেশি ট্রাফিক আছে অথবা কোটা শেষ হয়ে গেছে। দয়া করে কিছুক্ষণ পরে আবার চেষ্টা করুন।",
    errorTech: "দুঃখিত, একটি প্রযুক্তিগত সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।",
    premiumQuotaExceeded: "প্রিমিয়াম ভয়েস কোটা শেষ হয়ে গেছে। স্ট্যান্ডার্ড ভয়েসে ফিরে যাচ্ছে।"
  },
  ta: {
    title: "ஜென்-ஜி",
    subtitle: "AI மெசஞ்சர், இ-மைத்ரி.",
    you: "நீங்கள்",
    copy: "நகலெடு",
    copied: "நகலெடுக்கப்பட்டது",
    listen: "கேட்க",
    stop: "நிறுத்து",
    listenAgain: "மீண்டும் கேட்க",
    speaking: "ஜென்-ஜி பேசுகிறார்...",
    listening: "ஜென்-ஜி கேட்கிறார்...",
    thinking: "யோசிக்கிறார்...",
    liveChatOn: "நேரலை குரல் அரட்டை இயக்கத்தில் உள்ளது: தயவுசெய்து பேசவும்",
    stopVoiceChat: "குரல் அரட்டையை நிறுத்து",
    startVoiceChat: "நேரலை குரல் அரட்டையைத் தொடங்கு",
    liveChat: "நேரலை அரட்டை",
    typeMessage: "ஒரு செய்தியை தட்டச்சு செய்யவும்...",
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
    initialMessage: "நான் ஜென்-ஜி! இ-மைத்ரி போர்ட்டலுக்கு உங்களை வரவேற்கிறேன்! சொல்லுங்கள் நண்பரே, நான் உங்களுக்கு எப்படி உதவ முடியும்? உங்களுக்கு என்ன தகவல் வேண்டும்?",
    errorTraffic: "மன்னிக்கவும், தற்போது அதிக போக்குவரத்து உள்ளது அல்லது ஒதுக்கீடு தீர்ந்துவிட்டது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.",
    errorTech: "மன்னிக்கவும், ஒரு தொழில்நுட்ப சிக்கல் ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்.",
    premiumQuotaExceeded: "பிரீமியம் குரல் ஒதுக்கீடு முடிந்தது. நிலையான குரலுக்கு மாறுகிறது."
  },
  te: {
    title: "జెన్-జి",
    subtitle: "ఏఐ మెసెంజర్, ఇ-మైత్రి.",
    you: "మీరు",
    copy: "కాపీ చేయండి",
    copied: "కాపీ చేయబడింది",
    listen: "వినండి",
    stop: "ఆపండి",
    listenAgain: "మళ్ళీ వినండి",
    speaking: "జెన్-జి మాట్లాడుతున్నారు...",
    listening: "జెన్-జి వింటున్నారు...",
    thinking: "ఆలోచిస్తున్నారు...",
    liveChatOn: "లైవ్ వాయిస్ చాట్ ఆన్‌లో ఉంది: దయచేసి మాట్లాడండి",
    stopVoiceChat: "వాయిస్ చాట్‌ను ఆపండి",
    startVoiceChat: "లైవ్ వాయిస్ చాట్ ప్రారంభించండి",
    liveChat: "లైవ్ చాట్",
    typeMessage: "సందేశాన్ని టైప్ చేయండి...",
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
    initialMessage: "నేను జెన్-జి! ఇ-మైత్రి పోర్టల్‌కు స్వాగతం! చెప్పండి మిత్రమా, నేను మీకు ఎలా సహాయం చేయగలను? మీకు ఏ సమాచారం కావాలి?",
    errorTraffic: "క్షమించండి, ప్రస్తుతం ట్రాఫిక్ ఎక్కువగా ఉంది లేదా కోటా ముగిసింది. దయచేసి కొద్దిసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.",
    errorTech: "క్షమించండి, సాంకేతిక సమస్య ఏర్పడింది. దయచేసి మళ్లీ ప్రయత్నించండి.",
    premiumQuotaExceeded: "ప్రీమియం వాయిస్ కోటా ముగిసింది. ప్రామాణిక వాయిస్‌కి మారుతోంది."
  },
  mr: {
    title: "जेन-जी",
    subtitle: "एआय मेसेंजर, ई-मैत्री.",
    you: "तुम्ही",
    copy: "कॉपी करा",
    copied: "कॉपी केले",
    listen: "ऐका",
    stop: "थांबवा",
    listenAgain: "पुन्हा ऐका",
    speaking: "जेन-जी बोलत आहेत...",
    listening: "जेन-जी ऐकत आहेत...",
    thinking: "विचार करत आहेत...",
    liveChatOn: "लाइव्ह व्हॉइस चॅट चालू आहे: कृपया बोला",
    stopVoiceChat: "व्हॉइस चॅट थांबवा",
    startVoiceChat: "लाइव्ह व्हॉइस चॅट सुरू करा",
    liveChat: "लाइव्ह चॅट",
    typeMessage: "संदेश टाइप करा...",
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
    initialMessage: "मी जेन-जी आहे! ई-मैत्री पोर्टलवर आपले स्वागत आहे! सांगा मित्रा, मी तुम्हाला कशी मदत करू शकतो? तुम्हाला कोणती माहिती हवी आहे?",
    errorTraffic: "क्षमस्व, सध्या खूप ट्रॅफिक आहे किंवा कोटा संपला आहे. कृपया काही वेळानंतर पुन्हा प्रयत्न करा.",
    errorTech: "क्षमस्व, एक तांत्रिक समस्या आली. कृपया पुन्हा प्रयत्न करा.",
    premiumQuotaExceeded: "प्रीमियम व्हॉइस कोटा संपला आहे. मानक व्हॉइसवर स्विच करत आहे."
  },
  gu: {
    title: "જેન-જી",
    subtitle: "એઆઈ મેસેન્જર, ઈ-મૈત્રી.",
    you: "તમે",
    copy: "કૉપિ કરો",
    copied: "કૉપિ કર્યું",
    listen: "સાંભળો",
    stop: "અટકાવો",
    listenAgain: "ફરી સાંભળો",
    speaking: "જેન-જી બોલી રહ્યા છે...",
    listening: "જેન-જી સાંભળી રહ્યા છે...",
    thinking: "વિચારી રહ્યા છે...",
    liveChatOn: "લાઇવ વૉઇસ ચેટ ચાલુ છે: કૃપા કરીને બોલો",
    stopVoiceChat: "વૉઇસ ચેટ બંધ કરો",
    startVoiceChat: "લાઇવ વૉઇસ ચેટ શરૂ કરો",
    liveChat: "લાઇવ ચેટ",
    typeMessage: "સંદેશ લખો...",
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
    initialMessage: "હું જેન-જી છું! ઈ-મૈત્રી પોર્ટલમાં તમારું સ્વાગત છે! કહો મિત્ર, હું તમને કેવી રીતે મદદ કરી શકું? તમારે કઈ માહિતી જોઈએ છે?",
    errorTraffic: "માફ કરશો, અત્યારે ઘણો ટ્રાફિક છે અથવા ક્વોટા પૂરો થઈ ગયો છે. કૃપા કરીને થોડા સમય પછી ફરી પ્રયાસ કરો.",
    errorTech: "માફ કરશો, એક તકનીકી સમસ્યા આવી. કૃપા કરીને ફરી પ્રયાસ કરો.",
    premiumQuotaExceeded: "પ્રીમિયમ વૉઇસ ક્વોટા પૂરો થઈ ગયો છે. સ્ટાન્ડર્ડ વૉઇસ પર સ્વિચ કરી રહ્યાં છીએ."
  },
  kn: {
    title: "ಜೆನ್-ಜಿ",
    subtitle: "ಎಐ ಮೆಸೆಂಜರ್, ಇ-ಮೈತ್ರಿ.",
    you: "ನೀವು",
    copy: "ನಕಲಿಸಿ",
    copied: "ನಕಲಿಸಲಾಗಿದೆ",
    listen: "ಆಲಿಸಿ",
    stop: "ನಿಲ್ಲಿಸಿ",
    listenAgain: "ಮತ್ತೆ ಆಲಿಸಿ",
    speaking: "ಜೆನ್-ಜಿ ಮಾತನಾಡುತ್ತಿದ್ದಾರೆ...",
    listening: "ಜೆನ್-ಜಿ ಆಲಿಸುತ್ತಿದ್ದಾರೆ...",
    thinking: "ಯೋಚಿಸುತ್ತಿದ್ದಾರೆ...",
    liveChatOn: "ಲೈವ್ ವಾಯ್ಸ್ ಚಾಟ್ ಆನ್ ಆಗಿದೆ: ದಯವಿಟ್ಟು ಮಾತನಾಡಿ",
    stopVoiceChat: "ವಾಯ್ಸ್ ಚಾಟ್ ನಿಲ್ಲಿಸಿ",
    startVoiceChat: "ಲೈವ್ ವಾಯ್ಸ್ ಚಾಟ್ ಪ್ರಾರಂಭಿಸಿ",
    voiceTyping: "ಧ್ವನಿ ಟೈಪಿಂಗ್",
    stopVoiceTyping: "ಧ್ವನಿ ಟೈಪಿಂಗ್ ನಿಲ್ಲಿಸಿ",
    speechNotSupported: "ನಿಮ್ಮ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆ ಬೆಂಬಲಿತವಾಗಿಲ್ಲ.",
    liveChat: "ಲೈವ್ ಚಾಟ್",
    typeMessage: "ಸಂದೇಶವನ್ನು ಟೈಪ್ ಮಾಡಿ...",
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
    initialMessage: "ನಾನು ಜೆನ್-ಜಿ! ಇ-ಮೈತ್ರಿ ಪೋರ್ಟಲ್‌ಗೆ ಸುಸ್ವಾಗತ! ಹೇಳಿ ಸ್ನೇಹಿತರೆ, ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು? ನಿಮಗೆ ಯಾವ ಮಾಹಿತಿ ಬೇಕು?",
    errorTraffic: "ಕ್ಷಮಿಸಿ, ಪ್ರಸ್ತುತ ಹೆಚ್ಚಿನ ಟ್ರಾಫಿಕ್ ಇದೆ ಅಥವಾ ಕೋಟಾ ಮುಗಿದಿದೆ. ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    errorTech: "ಕ್ಷಮಿಸಿ, ತಾಂತ್ರಿಕ ಸಮಸ್ಯೆ ಉಂಟಾಗಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    premiumQuotaExceeded: "ಪ್ರೀಮಿಯಂ ಧ್ವನಿ ಕೋಟಾ ಮುಗಿದಿದೆ. ಪ್ರಮಾಣಿತ ಧ್ವನಿಗೆ ಬದಲಾಯಿಸಲಾಗುತ್ತಿದೆ."
  },
  ml: {
    title: "ജെൻ-ജി",
    subtitle: "എഐ മെസഞ്ചർ, ഇ-മൈത്രി.",
    you: "നിങ്ങൾ",
    copy: "പകർത്തുക",
    copied: "പകർത്തി",
    listen: "കേൾക്കുക",
    stop: "നിർത്തുക",
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
    initialMessage: "ഞാൻ ജെൻ-ജി! ഇ-മൈത്രി പോർട്ടലിലേക്ക് സ്വാഗതം! പറയൂ സുഹൃത്തേ, ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കണം? നിങ്ങൾക്ക് എന്ത് വിവരമാണ് വേണ്ടത്?",
    errorTraffic: "ക്ഷമിക്കണം, ഇപ്പോൾ തിരക്ക് കൂടുതലാണ് അല്ലെങ്കിൽ ക്വാട്ട കഴിഞ്ഞു. ദയവായി കുറച്ച് കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക.",
    errorTech: "ക്ഷമിക്കണം, ഒരു സാങ്കേതിക പ്രശ്നം ഉണ്ടായി. ദയവായി വീണ്ടും ശ്രമിക്കുക.",
    premiumQuotaExceeded: "പ്രീമിയം വോയ്‌സ് ക്വാട്ട കഴിഞ്ഞു. സ്റ്റാൻഡേർഡ് വോയ്‌സിലേക്ക് മാറുന്നു."
  },
  or: {
    title: "ଜେନ୍-ଜି",
    subtitle: "ଏଆଇ ମେସେଞ୍ଜର, ଇ-ମୈତ୍ରୀ.",
    you: "ଆପଣ",
    copy: "କପି କରନ୍ତୁ",
    copied: "କପି ହୋଇଛି",
    listen: "ଶୁଣନ୍ତୁ",
    stop: "ବନ୍ଦ କରନ୍ତୁ",
    listenAgain: "ପୁଣି ଶୁଣନ୍ତୁ",
    speaking: "ଜେନ୍-ଜି କହୁଛନ୍ତି...",
    listening: "ଜେନ୍-ଜି ଶୁଣୁଛନ୍ତି...",
    thinking: "ଭାବୁଛନ୍ତି...",
    liveChatOn: "ଲାଇଭ୍ ଭଏସ୍ ଚାଟ୍ ଅନ୍ ଅଛି: ଦୟାକରି କୁହନ୍ତୁ",
    stopVoiceChat: "ଭଏସ୍ ଚାଟ୍ ବନ୍ଦ କରନ୍ତୁ",
    startVoiceChat: "ଲାଇଭ୍ ଭଏସ୍ ଚାଟ୍ ଆରମ୍ଭ କରନ୍ତୁ",
    voiceTyping: "ଭଏସ୍ ଟାଇପିଂ",
    stopVoiceTyping: "ଭଏସ୍ ଟାଇପିଂ ବନ୍ଦ କରନ୍ତୁ",
    speechNotSupported: "ଆପଣଙ୍କ ବ୍ରାଉଜରରେ ସ୍ପିଚ୍ ରେକଗ୍ନିସନ୍ ସପୋର୍ଟ କରେ ନାହିଁ।",
    liveChat: "ଲାଇଭ୍ ଚାଟ୍",
    typeMessage: "ଏକ ମେସେଜ୍ ଟାଇପ୍ କରନ୍ତୁ...",
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
    initialMessage: "ମୁଁ ଜେନ୍-ଜି! ଇ-ମୈତ୍ରୀ ପୋର୍ଟାଲକୁ ସ୍ୱାଗତ! କୁହନ୍ତୁ ବନ୍ଧୁ, ମୁଁ ଆପଣଙ୍କୁ କିପରି ସାହାଯ୍ୟ କରିପାରିବି? ଆପଣଙ୍କୁ କେଉଁ ସୂଚନା ଦରକାର?",
    errorTraffic: "କ୍ଷମା କରିବେ, ବର୍ତ୍ତମାନ ବହୁତ ଟ୍ରାଫିକ୍ ଅଛି କିମ୍ବା କୋଟା ସରିଯାଇଛି। ଦୟାକରି କିଛି ସମୟ ପରେ ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",
    errorTech: "କ୍ଷମା କରିବେ, ଏକ ବୈଷୟିକ ସମସ୍ୟା ଦେଖାଦେଇଛି। ଦୟାକରି ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।",
    premiumQuotaExceeded: "ପ୍ରିମିୟମ୍ ଭଏସ୍ କୋଟା ସରିଯାଇଛି। ଷ୍ଟାଣ୍ଡାର୍ଡ ଭଏସକୁ ଫେରୁଛି।"
  },
  pa: {
    title: "ਜੇਨ-ਜੀ",
    subtitle: "ਏਆਈ ਮੈਸੇਂਜਰ, ਈ-ਮੈਤਰੀ.",
    you: "ਤੁਸੀਂ",
    copy: "ਕਾਪੀ ਕਰੋ",
    copied: "ਕਾਪੀ ਕੀਤਾ ਗਿਆ",
    listen: "ਸੁਣੋ",
    stop: "ਰੋਕੋ",
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
    initialMessage: "ਮੈਂ ਜੇਨ-ਜੀ ਹਾਂ! ਈ-ਮੈਤਰੀ ਪੋਰਟਲ ਵਿੱਚ ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ! ਦੱਸੋ ਦੋਸਤ, ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ? ਤੁਹਾਨੂੰ ਕਿਹੜੀ ਜਾਣਕਾਰੀ ਚਾਹੀਦੀ ਹੈ?",
    errorTraffic: "ਮੁਆਫ ਕਰਨਾ, ਇਸ ਸਮੇਂ ਬਹੁਤ ਟ੍ਰੈਫਿਕ ਹੈ ਜਾਂ ਕੋਟਾ ਖਤਮ ਹੋ ਗਿਆ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਕੁਝ ਸਮੇਂ ਬਾਅਦ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
    errorTech: "ਮੁਆਫ ਕਰਨਾ, ਇੱਕ ਤਕਨੀਕੀ ਸਮੱਸਿਆ ਆਈ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
    premiumQuotaExceeded: "ਪ੍ਰੀਮੀਅਮ ਵੌਇਸ ਕੋਟਾ ਖਤਮ ਹੋ ਗਿਆ ਹੈ। ਸਟੈਂਡਰਡ ਵੌਇਸ 'ਤੇ ਸਵਿਚ ਕਰ ਰਿਹਾ ਹੈ।"
  },
  ur: {
    title: "جین-جی",
    subtitle: "اے آئی میسنجر، ای-میتری.",
    you: "آپ",
    copy: "کاپی کریں",
    copied: "کاپی ہو گیا",
    listen: "سنیں",
    stop: "روکیں",
    listenAgain: "دوبارہ سنیں",
    speaking: "جین-جی بول رہے ہیں...",
    listening: "جین-جی سن رہے ہیں...",
    thinking: "سوچ رہے ہیں...",
    liveChatOn: "لائیو وائس چیٹ آن ہے: براہ کرم بولیں",
    stopVoiceChat: "وائس چیٹ بند کریں",
    startVoiceChat: "لائیو وائس چیٹ شروع کریں",
    voiceTyping: "وائس ٹائپنگ",
    stopVoiceTyping: "وائس ٹائپنگ بند کریں",
    speechNotSupported: "آپ کے براؤزر میں اسپیچ ریکگنیشن سپورٹ نہیں ہے۔",
    liveChat: "لائیو چیٹ",
    typeMessage: "پیغام ٹائپ کریں...",
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
    initialMessage: "میں جین-جی ہوں! ای-میتری پورٹل میں خوش آمدید! بتائیں دوست، میں آپ کی کیسے مدد کر سکتا ہوں؟ آپ کو کیا معلومات چاہیے؟",
    errorTraffic: "معذرت، اس وقت بہت ٹریفک ہے یا کوٹہ ختم ہو گیا ہے۔ براہ کرم کچھ دیر بعد دوبارہ کوشش کریں۔",
    errorTech: "معذرت، ایک تکنیکی مسئلہ پیش آیا ہے۔ براہ کرم دوبارہ کوشش کریں۔",
    premiumQuotaExceeded: "پریمیم وائس کوٹہ ختم ہو گیا ہے۔ معیاری وائس پر سوئچ کر رہا ہے۔"
  },
  as: {
    title: "জেন-জি",
    subtitle: "এআই মেছেঞ্জাৰ, ই-মৈত্ৰী.",
    you: "আপুনি",
    copy: "কপি কৰক",
    copied: "কপি কৰা হৈছে",
    listen: "শুনক",
    stop: "বন্ধ কৰক",
    listenAgain: "আকৌ শুনক",
    speaking: "জেন-জিয়ে কথা পাতি আছে...",
    listening: "জেন-জিয়ে শুনি আছে...",
    thinking: "ভাবি আছে...",
    liveChatOn: "লাইভ ভইচ চেট অন আছে: অনুগ্ৰহ কৰি কওক",
    stopVoiceChat: "ভইচ চেট বন্ধ কৰক",
    startVoiceChat: "লাইভ ভইচ চেট আৰম্ভ কৰক",
    voiceTyping: "ভইচ টাইপিং",
    stopVoiceTyping: "ভইচ টাইপিং বন্ধ কৰক",
    speechNotSupported: "আপোনাৰ ব্ৰাউজাৰত স্পীচ ৰিকগনিচন চাপোৰ্ট নকৰে।",
    liveChat: "লাইভ চেট",
    typeMessage: "এটা মেছেজ টাইপ কৰক...",
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
    initialMessage: "মই জেন-জি! ই-মৈত্ৰী পোৰ্টেললৈ স্বাগতম! কওক বন্ধু, মই আপোনাক কেনেকৈ সহায় কৰিব পাৰোঁ? আপোনাক কি তথ্য লাগে?",
    errorTraffic: "ক্ষমা কৰিব, বৰ্তমান বহুত ট্ৰেফিক আছে বা কোটা শেষ হৈ গৈছে। অনুগ্ৰহ কৰি কিছু সময় পিছত পুনৰ চেষ্টা কৰক।",
    errorTech: "ক্ষমা কৰিব, এটা কাৰিকৰী সমস্যা হৈছে। অনুগ্ৰহ কৰি পুনৰ চেষ্টা কৰক।",
    premiumQuotaExceeded: "প্ৰিমিয়াম ভইচ কোটা শেষ হৈছে। ষ্টেণ্ডাৰ্ড ভইচলৈ সলনি কৰা হৈছে।"
  }
};

export default function App() {
  const [uiLang, setUiLang] = useState(() => localStorage.getItem('uiLang_v2') || 'en');
  
  useEffect(() => {
    localStorage.setItem('uiLang_v2', uiLang);
  }, [uiLang]);

  const t = translations[uiLang] || translations['en'];

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'model',
      text: t.initialMessage
    }
  ]);

  // Update initial message when language changes if it's the only message
  useEffect(() => {
    setMessages(prev => {
      if (prev.length === 1 && Object.values(translations).some(lang => lang.initialMessage === prev[0].text)) {
        return [{ ...prev[0], text: t.initialMessage }];
      }
      return prev;
    });
  }, [uiLang, t.initialMessage]);
  const [input, setInput] = useState('');
  const [editMsgId, setEditMsgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Chat History States
  const [savedChats, setSavedChats] = useState<SavedChat[]>(() => {
    const saved = localStorage.getItem('savedChats_v1');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [chatNameInput, setChatNameInput] = useState('');
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingChatName, setEditingChatName] = useState('');

  useEffect(() => {
    localStorage.setItem('savedChats_v1', JSON.stringify(savedChats));
  }, [savedChats]);

  // Sync messages to the current saved chat
  useEffect(() => {
    if (currentChatId && messages.length > 0) {
      setSavedChats(prev => prev.map(chat => 
        chat.id === currentChatId ? { ...chat, messages, timestamp: Date.now() } : chat
      ));
    }
  }, [messages, currentChatId]);

  const [isLive, setIsLive] = useState(false);
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
  const [speechRate, setSpeechRate] = useState(() => parseFloat(localStorage.getItem('speechRate_v4') || '0.8'));
  const [speechPitch, setSpeechPitch] = useState(() => parseFloat(localStorage.getItem('speechPitch_v4') || '1.0'));
  const [selectedVoiceURI, setSelectedVoiceURI] = useState(() => localStorage.getItem('selectedVoiceURI') || '');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceEngine, setVoiceEngine] = useState<'standard' | 'premium'>(() => (localStorage.getItem('voiceEngine_v3') as 'standard' | 'premium') || 'premium');
  const [premiumVoice, setPremiumVoice] = useState(() => {
    const saved = localStorage.getItem('premiumVoice');
    const femaleVoices = ['Kore', 'Zephyr'];
    return (saved && !femaleVoices.includes(saved)) ? saved : 'Fenrir';
  });

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
      setError("आप केवल 10 चैट ही सेव कर सकते हैं। कृपया नई चैट सेव करने के लिए पुरानी चैट डिलीट करें।");
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
    setMessages([{ id: '1', role: 'model', text: t.initialMessage }]);
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
    localStorage.setItem('voiceEngine_v3', voiceEngine);
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
    localStorage.setItem('premiumVoice', premiumVoice);
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
    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      // Filter out voices that are explicitly labeled as female
      const maleVoices = allVoices.filter(v => {
        const name = v.name.toLowerCase();
        return !name.includes('female') && !name.includes('woman') && !name.includes('girl');
      });
      setAvailableVoices(maleVoices);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  // Save selected voice
  useEffect(() => {
    localStorage.setItem('selectedVoiceURI', selectedVoiceURI);
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
    localStorage.setItem('speechRate_v4', speechRate.toString());
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
    localStorage.setItem('speechPitch_v4', speechPitch.toString());
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
    // Don't copy the suggested questions part
    const cleanText = text.split('---SUGGESTED_QUESTIONS---')[0].trim();
    navigator.clipboard.writeText(cleanText);
    setCopiedMessageId(id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };
  
  const handleShare = async (text: string) => {
    const cleanText = text.split('---SUGGESTED_QUESTIONS---')[0].trim();
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Gen-Z Response',
          text: cleanText,
        });
      } catch (error) {
        console.warn('Error sharing:', error);
      }
    } else {
      // Fallback to copy if share is not supported
      navigator.clipboard.writeText(cleanText);
      setError('Text copied to clipboard!');
    }
  };
  
  const parseMessage = (text: string) => {
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

  const chatRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const playingMessageIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Live API Refs
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
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

  // Initialize Chat
  useEffect(() => {
    const modelName = useFastModel ? "gemini-3.1-flash-lite-preview" : "gemini-3.1-pro-preview";
    const config: any = {
      systemInstruction: SYSTEM_INSTRUCTION,
    };
    chatRef.current = ai.chats.create({
      model: modelName,
      config: config
    });
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
    window.speechSynthesis.cancel();
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
    window.speechSynthesis.cancel();
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
      window.speechSynthesis.cancel();
    }
    
    setPlayingMessageId(messageId);
    playingMessageIdRef.current = messageId;
    setIsPaused(false);

    try {
      // Remove basic markdown characters and replace emojis with spaces for cleaner speech
      // We replace with spaces of the same length to keep indices aligned for highlighting
      const cleanText = text
        .replace(/[*_#`]/g, '')
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
              const response = await ai.models.generateContent({
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
              const rawAudio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
              if (rawAudio) {
                const wavBase64 = createWavFromPcmBase64(rawAudio);
                audioCacheRef.current[cacheKey] = wavBase64;
                base64Audio = wavBase64;
              }
            } catch (e: any) {
              const errStr = typeof e === 'string' ? e : (e?.message || JSON.stringify(e));
              const isQuotaError = errStr.toLowerCase().includes('429') || 
                                   errStr.toLowerCase().includes('quota') || 
                                   errStr.includes('RESOURCE_EXHAUSTED') ||
                                   errStr.toLowerCase().includes('limit') ||
                                   errStr.toLowerCase().includes('exceeded');
              
              if (isQuotaError) {
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
      
      const voices = window.speechSynthesis.getVoices();
      
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
          const femaleNames = [
            'kalpana', 'lekha', 'aditi', 'female', 'woman', 'girl', 'lady',
            'neerja', 'pallavi', 'vani', 'swara', 'zira', 'samantha', 'victoria', 'hazel', 'susan',
            '-standard-a', '-standard-d', '-standard-e', '-standard-f',
            '-wavenet-a', '-wavenet-d', '-wavenet-e', '-wavenet-f',
            '-neural-a', '-neural-d', '-neural-e', '-neural-f'
          ];
          selectedVoice = matchingVoices.find(v => !femaleNames.some(f => v.name.toLowerCase().includes(f))) || null;
        }

        // 3. Fallback to the first available voice in that language
        if (!selectedVoice && matchingVoices.length > 0) {
          selectedVoice = matchingVoices[0];
        }
        
        // 4. Ultimate fallback to any voice if language not found
        if (!selectedVoice && voices.length > 0) {
          selectedVoice = voices[0];
        }

        // 5. Try to find the specific Charon-like male voice requested by user if we are speaking Hindi or as a strong fallback
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

      window.speechSynthesis.speak(utterance);
    } catch (e: any) {
      console.warn("TTS Error", e);
      setError("An error occurred while playing the audio.");
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
    if (isVoiceTyping && recognitionRef.current) {
      // Clear the transcript ref so onend doesn't send it again
      voiceTypingTranscriptRef.current = '';
      recognitionRef.current.stop();
      setIsVoiceTyping(false);
    }

    const userText = typeof textToSend === 'string' ? textToSend : input.trim();
    if (!userText || isLoading) return;
    
    if (!editMsgId) {
      setInput('');
    }
    const newMsgId = editMsgId || Date.now().toString();
    
    // Update messages state first
    let currentMessages: any[] = [];
    setMessages(prev => {
      if (editMsgId) {
        currentMessages = prev.map(m => m.id === editMsgId ? { ...m, text: userText } : m);
      } else {
        currentMessages = [...prev, { id: newMsgId, role: 'user', text: userText }];
      }
      return currentMessages;
    });

    if (editMsgId) {
      // Re-initialize chat
      const modelName = useFastModel ? "gemini-3.1-flash-lite-preview" : "gemini-3.1-pro-preview";
      chatRef.current = ai.chats.create({ model: modelName, config: { systemInstruction: SYSTEM_INSTRUCTION } });
      
      // Re-send all messages up to the edited message
      const msgIndex = currentMessages.findIndex(m => m.id === editMsgId);
      for (let i = 0; i < msgIndex; i++) {
        await chatRef.current.sendMessage({ message: currentMessages[i].text });
      }
    }

    setIsLoading(true);
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    try {
      const response = await chatRef.current.sendMessage({ message: userText });
      
      if (abortController.signal.aborted) {
        return;
      }
      
      const modelText = response.text;
      
      const newModelMsgId = newMsgId + '-model-' + Date.now();
      setMessages(prev => {
        if (editMsgId) {
          const msgIndex = prev.findIndex(m => m.id === editMsgId);
          if (msgIndex !== -1 && msgIndex + 1 < prev.length) {
            const nextMessages = [...prev];
            nextMessages[msgIndex + 1] = { ...nextMessages[msgIndex + 1], text: modelText, id: newModelMsgId };
            return nextMessages;
          }
        }
        return [...prev, { id: newModelMsgId, role: 'model', text: modelText }];
      });
      
      if (autoPlayResponse) {
        const { mainText } = parseMessage(modelText);
        setTimeout(() => {
          playMessageAudio(mainText, newModelMsgId);
        }, 100);
      }
      
    } catch (error: any) {
      if (abortController.signal.aborted) {
        return;
      }
      const errStr = typeof error === 'string' ? error : (error?.message || JSON.stringify(error));
      const isQuotaError = errStr.toLowerCase().includes('429') || 
                           errStr.toLowerCase().includes('quota') || 
                           errStr.includes('RESOURCE_EXHAUSTED') ||
                           errStr.toLowerCase().includes('limit') ||
                           errStr.toLowerCase().includes('exceeded') ||
                           errStr.toLowerCase().includes('safety') ||
                           errStr.toLowerCase().includes('blocked');
      
      if (isQuotaError) {
        const quotaMsg = t.errorTraffic || "Sorry, there is too much traffic right now or the quota is exhausted. Please try again later.";
        const errorId = newMsgId + '-error';
        setMessages(prev => [...prev, { id: errorId, role: 'model', text: quotaMsg }]);
        setError(quotaMsg);
        
        // Auto-remove the error message from chat after 1 second
        setTimeout(() => {
          setMessages(prev => prev.filter(m => m.id !== errorId));
        }, 1000);
      } else {
        const techMsg = t.errorTech || "Sorry, a technical issue occurred. Please try again.";
        const errorId = newMsgId + '-error';
        setMessages(prev => [...prev, { id: errorId, role: 'model', text: techMsg }]);
        setError(techMsg);
        
        // Auto-remove tech error from chat after 1 second as well
        setTimeout(() => {
          setMessages(prev => prev.filter(m => m.id !== errorId));
        }, 1000);
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        setIsLoading(false);
        abortControllerRef.current = null;
        setEditMsgId(null);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(undefined, false, editMsgId || undefined);
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
  const toggleLiveAudio = async () => {
    if (isLive) {
      stopLiveAudio();
      return;
    }

    if (isVoiceTyping && recognitionRef.current) {
      voiceTypingTranscriptRef.current = '';
      recognitionRef.current.stop();
      setIsVoiceTyping(false);
    }

    setLiveTranscript([]);
    liveTranscriptRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 16000, 
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      mediaStreamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      await audioCtx.resume();
      audioContextRef.current = audioCtx;
      
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
      analyser.connect(audioCtx.destination);
      analyserRef.current = analyser;
      
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      processor.onaudioprocess = (e) => {
        // Mute all output channels to prevent local echo
        for (let c = 0; c < e.outputBuffer.numberOfChannels; c++) {
          e.outputBuffer.getChannelData(c).fill(0);
        }

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        const buffer = new ArrayBuffer(pcm16.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < pcm16.length; i++) {
          view.setInt16(i * 2, pcm16[i], true);
        }
        
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        
        if (sessionPromiseRef.current) {
          sessionPromiseRef.current.then(s => {
             s.sendRealtimeInput({ audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
          });
        }
      };
      
      source.connect(processor);
      // Connect to a MediaStreamDestination to ensure onaudioprocess fires without playing audio back to speakers
      const dummyDest = audioCtx.createMediaStreamDestination();
      processor.connect(dummyDest);
      
      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION + "\n\nCRITICAL FOR LIVE VOICE CONVERSATION: DO NOT output the ---SUGGESTED_QUESTIONS--- section or any suggested questions at all. Just answer the user directly.",
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } }
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
             console.log("Live API connected");
             nextAudioTimeRef.current = 0;
          },
          onmessage: async (message: LiveServerMessage) => {
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
          onclose: () => {
             console.log("Live API closed");
             stopLiveAudio();
          }
        }
      });
      sessionPromiseRef.current = sessionPromise;
      setIsLive(true);
    } catch (e: any) {
      console.warn("Live Audio Error:", e);
      const errStr = typeof e === 'string' ? e : JSON.stringify(e);
      const isQuotaError = errStr.toLowerCase().includes('429') || 
                           errStr.toLowerCase().includes('quota') || 
                           errStr.includes('RESOURCE_EXHAUSTED') ||
                           errStr.toLowerCase().includes('limit') ||
                           errStr.toLowerCase().includes('exceeded');
      if (isQuotaError) {
        setError("Live voice feature is currently unavailable due to high traffic/quota limits. Please try again later.");
      } else {
        setError("माइक्रोफोन की अनुमति नहीं मिली या कोई अन्य त्रुटि हुई।");
      }
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
      if (navigator.share) {
        await navigator.share({
          title: t.title,
          text: t.subtitle,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setError('Link copied to clipboard!');
      }
    } catch (err) {
      console.warn('Error sharing:', err);
    }
  };

  return (
    <div 
      className="fixed inset-0 flex flex-col overflow-hidden bg-[#002277]"
    >
      <FloatingStopButton stopAudio={pauseMessageAudio} isPlaying={playingMessageId !== null && !isPaused} titleText={t.stop} />

      {/* Inner App Container */}
      <div className="flex flex-col h-full w-full bg-transparent font-mukta text-white overflow-hidden relative">
        {/* Header */}
          <header className="text-white p-2 pt-3 sm:pt-4 flex justify-between items-center z-10">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="relative w-8 h-8 flex-shrink-0 flex items-center justify-center">
                <img src="/logo.png" alt="Gen-Z" className="w-full h-full object-contain relative z-10" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <Users size={18} className="text-sky-300 drop-shadow-[0_0_10px_rgba(125,211,252,1)] absolute z-0" />
                <div className="absolute top-0 right-0 w-2 h-2 bg-green-400 rounded-full border border-slate-800 shadow-[0_0_5px_rgba(74,222,128,0.8)] z-20"></div>
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-mukta font-bold tracking-wider text-yellow-300 drop-shadow-[0_0_10px_rgba(253,224,71,0.8)] leading-none">{t.title}</h1>
                <p className="text-[10px] text-white/80 font-sans leading-none mt-0.5">{t.subtitle}</p>
              </div>
              
              {currentChatId && (
                <div className="flex flex-col justify-center overflow-hidden border-l border-white/10 pl-2">
                  <span className="text-[8px] text-sky-300 uppercase tracking-widest font-bold opacity-70 leading-none">Chatting in</span>
                  <span className="text-xs font-medium text-white truncate max-w-[80px] sm:max-w-[150px] leading-tight">
                    {savedChats.find(c => c.id === currentChatId)?.name}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 relative" ref={moreMenuRef}>
              <button 
                onClick={handleNewChat}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-all"
                title="New Chat"
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
                className={`flex items-center justify-center w-9 h-9 rounded-full transition-all ${showMoreMenu ? 'bg-sky-500/30 text-sky-300 border-sky-500/50' : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10'} border`}
                title="More Options"
              >
                <MoreVertical size={18} />
              </button>

              <AnimatePresence>
                {showMoreMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute right-0 top-full mt-2 w-48 bg-[#002266]/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl z-[100] overflow-hidden"
                  >
                    <div className="p-1.5 flex flex-col gap-1">
                      <button 
                        onClick={() => {
                          setIsHistoryOpen(true);
                          setShowMoreMenu(false);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-white/10 transition-colors text-left group"
                      >
                        <div className="p-2 bg-sky-500/20 rounded-lg text-sky-300 group-hover:bg-sky-500/30 transition-colors">
                          <MessageSquare size={16} />
                        </div>
                        <span className="text-sm font-medium text-white/90">History</span>
                      </button>
                      
                      <button 
                        onClick={() => {
                          handleAppShare();
                          setShowMoreMenu(false);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-white/10 transition-colors text-left group"
                      >
                        <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-300 group-hover:bg-emerald-500/30 transition-colors">
                          <Share2 size={16} />
                        </div>
                        <span className="text-sm font-medium text-white/90">Share</span>
                      </button>
                      
                      <button 
                        onClick={() => {
                          setShowSettings(!showSettings);
                          setShowMoreMenu(false);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl hover:bg-white/10 transition-colors text-left group"
                      >
                        <div className="p-2 bg-amber-500/20 rounded-lg text-amber-300 group-hover:bg-amber-500/30 transition-colors">
                          <Settings2 size={16} />
                        </div>
                        <span className="text-sm font-medium text-white/90">{t.settings}</span>
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
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-sky-500/20 rounded-lg text-sky-300">
                        <Globe size={20} />
                      </div>
                      <div>
                        <h3 className="text-white font-medium">{t.language}</h3>
                        <p className="text-white/60 text-xs">Choose your preferred language</p>
                      </div>
                    </div>
                    <select
                      value={uiLang}
                      onChange={(e) => setUiLang(e.target.value)}
                      className="bg-[#001a4d] text-white border border-white/20 rounded-lg px-3 py-2 outline-none focus:border-sky-400 transition-colors"
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
                    </select>
                  </div>
                  
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-sky-500/20 rounded-lg text-sky-300">
                          <Volume2 size={20} />
                        </div>
                        <div>
                          <h3 className="text-white font-medium">Voice Engine</h3>
                          <p className="text-white/60 text-xs">Choose between standard and premium AI voices</p>
                        </div>
                      </div>
                      <select 
                        className="w-full bg-white/10 border border-white/20 rounded-lg p-2 text-white outline-none focus:ring-2 focus:ring-sky-500"
                        value={voiceEngine}
                        onChange={(e) => setVoiceEngine(e.target.value as 'standard' | 'premium')}
                      >
                        <option value="standard" className="bg-[#001a4d]">Standard (Offline, Fast)</option>
                        <option value="premium" className="bg-[#001a4d]">Premium AI (Natural, Emotional)</option>
                      </select>
                    </div>

                    <div className="h-px w-full bg-white/10"></div>

                    {voiceEngine === 'premium' ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-sky-500/20 rounded-lg text-sky-300">
                            <Users size={16} />
                          </div>
                          <div>
                            <h3 className="text-white font-medium">Premium Voice</h3>
                            <p className="text-white/60 text-xs">Select a high-quality AI voice model</p>
                          </div>
                        </div>
                        <select 
                          className="w-full bg-white/10 border border-white/20 rounded-lg p-2 text-white outline-none focus:ring-2 focus:ring-sky-500"
                          value={premiumVoice}
                          onChange={(e) => setPremiumVoice(e.target.value)}
                        >
                          <option value="Fenrir" className="bg-[#001a4d]">Fenrir (Strong, Authoritative Male)</option>
                          <option value="Charon" className="bg-[#001a4d]">Charon (Calm, Measured Male)</option>
                          <option value="Puck" className="bg-[#001a4d]">Puck (Friendly, Energetic Male)</option>
                        </select>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-sky-500/20 rounded-lg text-sky-300">
                            <Users size={16} />
                          </div>
                          <div>
                            <h3 className="text-white font-medium">Standard Voice</h3>
                            <p className="text-white/60 text-xs">Choose a device voice</p>
                          </div>
                        </div>
                        <select 
                          className="w-full bg-white/10 border border-white/20 rounded-lg p-2 text-white outline-none focus:ring-2 focus:ring-sky-500"
                          value={selectedVoiceURI}
                          onChange={(e) => setSelectedVoiceURI(e.target.value)}
                        >
                          <option value="" className="bg-[#001a4d]">Auto-select (Default)</option>
                          {availableVoices.map(v => (
                            <option key={v.voiceURI} value={v.voiceURI} className="bg-[#001a4d]">
                              {v.name} ({v.lang})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-sky-500/20 rounded-lg text-sky-300">
                          <Zap size={20} />
                        </div>
                        <div>
                          <h3 className="text-white font-medium">{t.speechRate || "Speech Rate"}</h3>
                          <p className="text-white/60 text-xs">{t.adjustRate || "Adjust voice speed"}</p>
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
                        <span className="text-white/80 w-8 text-right">{speechRate.toFixed(1)}x</span>
                      </div>
                    </div>
                    
                    <div className="h-px w-full bg-white/10"></div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-sky-500/20 rounded-lg text-sky-300">
                          <Volume2 size={20} />
                        </div>
                        <div>
                          <h3 className="text-white font-medium">{t.speechPitch || "Speech Pitch"}</h3>
                          <p className="text-white/60 text-xs">{t.adjustPitch || "Adjust voice pitch"}</p>
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
                        <span className="text-white/80 w-8 text-right">{speechPitch.toFixed(1)}</span>
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
            <div id="chat-messages-container" className="max-w-3xl mx-auto w-full space-y-6 relative">
              {!isLive && messages.map((msg) => {
                const { mainText, questions } = parseMessage(msg.text);
                return (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id} 
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[95%] md:max-w-[85%] p-3 rounded-[2rem] ${msg.role === 'user' ? 'bg-white/10 backdrop-blur-md border border-white/20 shadow-[0_4px_15px_rgba(0,0,0,0.1)]' : ''}`}>
                    {msg.role === 'model' && (
                      <div id={`message-header-${msg.id}`} className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-yellow-300 drop-shadow-[0_0_5px_rgba(253,224,71,0.5)]">
                          <div className="flex items-center justify-center w-6 h-6 bg-[#001a4d] rounded-full border border-sky-300/50 shadow-[0_0_5px_rgba(125,211,252,0.5)] relative overflow-hidden">
                            <img src="/logo.png" alt="Gen-Z" className="w-full h-full object-cover relative z-10" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            <Users size={12} className="text-sky-300 absolute z-0" />
                          </div>
                          <span className="font-mukta text-sm">{t.title}</span>
                        </div>
                        
                        {/* Speaker Button at Top Right */}
                        {!(playingMessageId === msg.id && !isPaused && isGeneratingAudio !== msg.id) && (
                          <button 
                            onClick={() => playMessageAudio(mainText, msg.id)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/90 hover:text-white rounded-lg transition-colors text-sm font-medium"
                            title={playingMessageId === msg.id ? (isPaused ? t.listenAgain : t.stop) : t.listen}
                            disabled={isGeneratingAudio === msg.id}
                          >
                            {isGeneratingAudio === msg.id ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                <span>Loading...</span>
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
                            className="p-1 text-blue-300 hover:text-white hover:bg-white/10 rounded transition-colors"
                            title="Copy message"
                          >
                            {copiedMessageId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation();
                              setInput(msg.text);
                              setEditMsgId(msg.id);
                            }}
                            className="p-1 text-blue-300 hover:text-white hover:bg-white/10 rounded transition-colors"
                            title="Edit message"
                          >
                            <Edit2 size={12} />
                          </button>
                        </div>
                        <div className="text-xs font-semibold text-blue-200">
                          <span>{t.you}</span>
                        </div>
                      </div>
                    )}
                    <div 
                      className={`prose max-w-none text-white prose-invert ${msg.role === 'user' ? 'prose-lg md:prose-xl text-right' : 'prose-2xl md:prose-2xl prose-p:text-[224px] md:prose-p:text-[288px] prose-li:text-[224px] md:prose-li:text-[288px] prose-strong:text-[224px] md:prose-strong:text-[288px] prose-headings:text-[256px] md:prose-headings:text-[320px] font-medium text-left leading-tight ai-message-content'}`}
                    >
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
                              className="flex items-center justify-center p-2 bg-sky-500/20 hover:bg-sky-500/40 text-sky-300 hover:text-sky-200 rounded-lg transition-colors mr-auto"
                              title="Save Chat"
                            >
                              <Bookmark size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => handleCopy(msg.text, msg.id)}
                            className="flex items-center justify-center p-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-lg transition-colors"
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
                            className="flex items-center justify-center p-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-lg transition-colors"
                            title="Share"
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
                                className="text-xs md:text-sm bg-[#001a4d]/50 hover:bg-[#002266]/50 border border-sky-300/30 text-sky-100 px-3 py-2 rounded-full transition-colors shadow-sm disabled:opacity-50"
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
                      className="text-xs md:text-sm bg-[#001a4d]/50 hover:bg-[#002266]/50 border border-sky-300/30 text-sky-100 px-3 py-2 rounded-full transition-colors shadow-sm"
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
                    <Loader2 size={18} className="animate-spin text-yellow-300" />
                    <span className="text-sm text-white/70"><span className="text-yellow-300 font-semibold drop-shadow-[0_0_5px_rgba(253,224,71,0.5)]">{t.title}</span> {t.thinking}</span>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {isLive && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-[#002277] overflow-hidden"
              >
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

                <div className="absolute inset-0 bg-gradient-to-b from-[#002277] via-transparent to-[#002277]"></div>
                
                <div className="relative flex flex-col items-center justify-center w-full h-full pb-40 md:pb-48">
                  {/* Gen-Z Realistic Robot Avatar */}
                  <div 
                    ref={avatarContainerRef}
                    className="relative z-10 w-64 h-64 md:w-96 md:h-96 flex items-center justify-center transition-all duration-300"
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
                  <div className="absolute bottom-12 flex flex-col items-center z-30">
                    <motion.div 
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 shadow-xl mb-8"
                    >
                      <div className={`w-3 h-3 rounded-full ${isModelSpeaking ? 'bg-yellow-400 shadow-[0_0_10px_#facc15]' : 'bg-blue-400 shadow-[0_0_10px_#60a5fa] animate-pulse'}`}></div>
                      <span className="text-white font-mukta font-bold text-xl md:text-2xl tracking-wide">
                        {isModelSpeaking ? t.speaking : t.listening}
                      </span>
                    </motion.div>

                    {/* Microphone Button */}
                    <div className="relative flex items-center justify-center">
                      <motion.div 
                        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className={`absolute w-32 h-32 md:w-40 md:h-40 rounded-full border-2 ${isModelSpeaking ? 'border-yellow-400/30' : 'border-blue-400/30'}`}
                      ></motion.div>
                      
                      <button
                        onClick={toggleLiveAudio}
                        className={`relative w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center z-10 border-2 transition-all duration-300 hover:scale-105 active:scale-95 ${
                          isModelSpeaking 
                            ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-[0_10px_30px_rgba(234,179,8,0.5)] border-yellow-200/50' 
                            : 'bg-gradient-to-br from-blue-500 to-blue-700 shadow-[0_10px_30px_rgba(30,58,138,0.5)] border-white/20'
                        }`}
                      >
                        <Mic size={40} className="md:w-12 md:h-12" />
                      </button>
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
                  className="p-1 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={16} />
                </button>
              </motion.div>
            )}
        <div className="max-w-3xl mx-auto relative flex items-end gap-2">
          {!isLive && (
            <div className="w-full relative flex items-end bg-white/10 backdrop-blur-xl border border-white/30 shadow-[0_8px_32px_rgba(0,0,0,0.2)] rounded-[2rem] p-2 transition-all duration-300 focus-within:bg-white/20 focus-within:border-white/50 focus-within:shadow-[0_8px_32px_rgba(255,255,255,0.1)]">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.typeMessage}
                className={`w-full bg-transparent text-white placeholder-white/60 py-3 px-4 focus:outline-none resize-none min-h-[56px] max-h-32 font-medium ${
                  (isLoading || (input.trim() && !isVoiceTyping) || (!input.trim() && isVoiceTyping))
                    ? 'pr-[60px] sm:pr-[70px]' 
                    : 'pr-[110px] sm:pr-[120px]'
                }`}
                rows={1}
                disabled={isLoading}
              />
              <div className="absolute right-2 bottom-2 flex gap-2">
                {(!input.trim() || isVoiceTyping) && !isLoading && (
                  <button
                    onClick={toggleVoiceTyping}
                    className={`flex items-center justify-center w-11 h-11 rounded-full transition-all transform active:scale-95 border group ${
                      isVoiceTyping 
                        ? 'bg-gradient-to-r from-pink-500 via-purple-500 to-sky-500 text-white border-transparent shadow-[0_0_15px_rgba(168,85,247,0.6)] animate-pulse' 
                        : 'bg-white/10 text-white/90 hover:bg-white/20 hover:text-white border-white/20'
                    }`}
                    title={isVoiceTyping ? t.stopVoiceTyping : t.voiceTyping}
                  >
                    {isVoiceTyping ? (
                      <MicOff size={20} className="group-hover:scale-110 transition-transform" />
                    ) : (
                      <Mic size={20} className="group-hover:scale-110 transition-transform" />
                    )}
                  </button>
                )}
                {!input.trim() && !isVoiceTyping && !isLoading && (
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
                    title={t.stop}
                  >
                    <Square size={18} className="fill-current" />
                  </button>
                ) : input.trim() ? (
                  <button
                    onClick={() => handleSend(undefined, false, editMsgId || undefined)}
                    className="flex items-center justify-center w-11 h-11 bg-gradient-to-br from-white to-blue-100 text-[#0038b8] rounded-full hover:from-blue-50 hover:to-white transition-all transform active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.3)] border border-white/50 group"
                  >
                    <Send size={18} className="ml-0.5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
        <div className="max-w-3xl mx-auto mt-2 text-center">
          <p className="text-xs text-blue-200/80 flex items-center justify-center gap-1">
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
              className="bg-[#002266] border border-white/20 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              <h2 className="text-xl font-bold text-white mb-4">Save Chat</h2>
              <input
                type="text"
                value={chatNameInput}
                onChange={(e) => setChatNameInput(e.target.value)}
                placeholder="Enter chat name..."
                className="w-full bg-white/10 border border-white/20 rounded-xl p-3 text-white outline-none focus:ring-2 focus:ring-sky-500 mb-6"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveChat();
                }}
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setIsSaveModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveChat}
                  disabled={!chatNameInput.trim()}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white transition-colors disabled:opacity-50"
                >
                  Save
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
              className="fixed inset-y-0 left-0 z-50 w-80 bg-[#002266] border-r border-white/10 shadow-2xl flex flex-col"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#001a4d]/50">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <MessageSquare size={20} className="text-sky-400" />
                  Chat History
                </h2>
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-4">
                <button
                  onClick={handleNewChat}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 rounded-xl transition-colors font-medium"
                >
                  <MessageSquare size={18} />
                  New Chat
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pt-0 space-y-2">
                {savedChats.length === 0 ? (
                  <div className="text-center text-white/40 py-8 text-sm">
                    No saved chats yet.
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
                          ? 'bg-sky-500/20 border-sky-500/50 text-sky-100' 
                          : 'bg-white/5 border-transparent hover:bg-white/10 text-white/80 hover:text-white'
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
                            className="flex-1 bg-black/20 border border-white/20 rounded px-2 py-1 text-sm text-white outline-none focus:border-sky-500"
                            autoFocus
                          />
                          <button onClick={handleSaveRename} className="p-1 text-green-400 hover:bg-green-400/20 rounded">
                            <Check size={14} />
                          </button>
                          <button onClick={handleCancelRename} className="p-1 text-red-400 hover:bg-red-400/20 rounded">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-col overflow-hidden flex-1">
                            <div className="flex items-center gap-2">
                              {chat.isPinned && <Pin size={12} className="text-sky-400 flex-shrink-0 fill-current" />}
                              <span className="font-medium truncate">{chat.name}</span>
                            </div>
                            <span className="text-xs opacity-60">
                              {new Date(chat.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => handleTogglePin(e, chat.id)}
                              className={`p-1.5 rounded-lg transition-colors ${chat.isPinned ? 'text-sky-400 hover:bg-sky-400/10' : 'text-white/40 hover:text-white hover:bg-white/10'}`}
                              title={chat.isPinned ? "Unpin chat" : "Pin chat"}
                            >
                              <Pin size={14} className={chat.isPinned ? "fill-current" : ""} />
                            </button>
                            <button
                              onClick={(e) => handleStartRename(e, chat)}
                              className="p-1.5 text-white/40 hover:text-sky-400 hover:bg-sky-400/10 rounded-lg transition-colors"
                              title="Rename chat"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={(e) => handleDeleteChat(e, chat.id)}
                              className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                              title="Delete chat"
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
