import React, { useState, useRef, useEffect } from 'react';
import { BUSINESS_INFO } from '../data/opticsData';
import { ChatMessage, ChatButton } from '../types';
import { MessageCircle, Send, X, Bot, Glasses, ExternalLink, Calendar, Phone, MapPin } from 'lucide-react';

const INITIAL_WEB_MESSAGE: ChatMessage = {
  id: 'init-web-1',
  sender: 'bot',
  text: `היי! 😊 איזה כיף שהגעת לאופטיקה הטובה, מושב אמירים 👓\n\nאנחנו מאמינים שראייה טובה מתחילה מיחס טוב, ואשמח לעזור לך למצוא בדיוק את מה שמתאים לך.\n\nבמה נוכל לעזור לך היום? בחר/י מהרשימה מטה:`,
  buttons: [
    { id: 'btn_opt_1', title: '👁️ לקבוע בדיקת ראייה' },
    { id: 'btn_opt_2', title: '👓 משקפיים ומסגרות' },
    { id: 'btn_opt_3', title: '🔍 עדשות מולטיפוקל' },
    { id: 'btn_opt_4', title: '🔍 עדשות מגע' },
    { id: 'btn_opt_5', title: '💰 אחריות ועלויות' },
    { id: 'btn_opt_6', title: 'ℹ️ אודותינו' },
    { id: 'btn_opt_7', title: '📍 דרכי הגעה וחניה' },
  ],
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  botType: 'web',
};

// Helpers for persistent cookies
const setPersistentCookie = (name: string, value: string) => {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=31536000; path=/; SameSite=Lax`;
};

const getPersistentCookie = (name: string): string => {
  if (typeof document === 'undefined') return '';
  const matches = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
  return matches ? decodeURIComponent(matches[1]) : '';
};

// Helpers for phone normalization to international format (country code 972)
const normalizePhoneToInternational = (phoneInput: string): string => {
  if (!phoneInput) return '';
  const digits = phoneInput.replace(/\D/g, '');
  if (!digits) return '';

  // Israeli local format starting with 0:
  // Mobile: 05X-XXXXXXX (10 digits, e.g. 0547866119 -> 972547866119)
  // Landline: 02/03/04/08/09-XXXXXXX (9 digits, e.g. 046901234 -> 97246901234)
  if (digits.startsWith('0')) {
    if (digits.length === 10 || digits.length === 9) {
      return '972' + digits.substring(1);
    }
  }

  // Already 972...
  if (digits.startsWith('972')) {
    if (digits.length === 11 || digits.length === 12) {
      return digits;
    }
  }

  // 9 digits starting with 5 (e.g. 547866119)
  if (digits.length === 9 && digits.startsWith('5')) {
    return '972' + digits;
  }

  return '';
};

const extractPhoneFromText = (text: string): string | null => {
  if (!text) return null;
  
  // Match Israeli mobile: 050-058 or +972-50...
  const mobileMatch = text.match(/(?:\+?972-?|0)(5[0-8])[\s-]?(\d{3})[\s-]?(\d{4})\b/);
  if (mobileMatch) {
    const norm = normalizePhoneToInternational(mobileMatch[0]);
    if (norm) return norm;
  }

  // Match Israeli landline: 02, 03, 04, 08, 09
  const landlineMatch = text.match(/(?:\+?972-?|0)([23489])[\s-]?(\d{3})[\s-]?(\d{4})\b/);
  if (landlineMatch) {
    const norm = normalizePhoneToInternational(landlineMatch[0]);
    if (norm) return norm;
  }

  return null;
};

// Helper to parse direct n8n webhook response nodes on client fallback
const parseN8nDataNode = (dataNode: any): { replyText: string; imageUrl?: string; buttons: ChatButton[] } => {
  let replyText = '';
  let imageUrl: string | undefined = undefined;
  const buttons: ChatButton[] = [];

  if (!dataNode) return { replyText, imageUrl, buttons };

  if (typeof dataNode === 'string') {
    return { replyText: dataNode, imageUrl, buttons };
  }

  if (dataNode.whatsapp_payload?.message) {
    const msg = dataNode.whatsapp_payload.message;
    if (msg.interactive) {
      const textParts = [];
      if (msg.interactive.header?.text) textParts.push(msg.interactive.header.text);
      if (msg.interactive.body?.text) textParts.push(msg.interactive.body.text);
      if (msg.interactive.footer?.text) textParts.push(msg.interactive.footer.text);
      if (textParts.length > 0) replyText = textParts.join('\n\n');

      const rawBtns = msg.interactive.action?.buttons || [];
      for (const b of rawBtns) {
        buttons.push({
          id: b.reply?.id || b.id || `btn_${buttons.length + 1}`,
          title: b.reply?.title || b.title || 'כפתור',
        });
      }

      const sections = msg.interactive.action?.sections || msg.interactive.sections || [];
      for (const sec of sections) {
        const rows = sec.rows || sec.items || [];
        for (const row of rows) {
          buttons.push({
            id: row.id || row.row_id || `row_${buttons.length + 1}`,
            title: row.title || row.text || row.name || 'בחירה',
          });
        }
      }
    } else if (msg.text?.body) {
      replyText = msg.text.body;
    }
    if (msg.image?.link || msg.image?.url) {
      imageUrl = msg.image.link || msg.image.url;
    }
    if (msg.image?.caption && !replyText) {
      replyText = msg.image.caption;
    }
    if (replyText || buttons.length > 0 || imageUrl) {
      return { replyText, imageUrl, buttons };
    }
  }

  const msgObj = dataNode.message || dataNode.reply || dataNode.output || dataNode.response || dataNode.data || dataNode.text;

  if (msgObj && typeof msgObj === 'object') {
    if (msgObj.type === 'image' || msgObj.image) {
      const imgInfo = msgObj.image || msgObj;
      if (typeof imgInfo === 'object') {
        imageUrl = imgInfo.link || imgInfo.url || imgInfo.src || imgInfo.href;
        if (imgInfo.caption) replyText = imgInfo.caption;
        else if (msgObj.caption) replyText = msgObj.caption;
        else if (msgObj.text) replyText = typeof msgObj.text === 'string' ? msgObj.text : JSON.stringify(msgObj.text);
      } else if (typeof imgInfo === 'string') {
        imageUrl = imgInfo;
        if (msgObj.caption) replyText = msgObj.caption;
        else if (msgObj.text) replyText = typeof msgObj.text === 'string' ? msgObj.text : JSON.stringify(msgObj.text);
      }
    } else {
      if (msgObj.caption) replyText = msgObj.caption;
      else if (msgObj.text) replyText = typeof msgObj.text === 'string' ? msgObj.text : JSON.stringify(msgObj.text);
      else if (msgObj.body) replyText = typeof msgObj.body === 'string' ? msgObj.body : JSON.stringify(msgObj.body);
      else if (msgObj.content) replyText = typeof msgObj.content === 'string' ? msgObj.content : JSON.stringify(msgObj.content);

      if (msgObj.imageUrl || msgObj.image) {
        const img = msgObj.imageUrl || msgObj.image;
        if (typeof img === 'string') imageUrl = img;
        else if (typeof img === 'object') {
          imageUrl = img.link || img.url || img.src;
          if (img.caption && !replyText) replyText = img.caption;
        }
      }
    }
  } else if (typeof msgObj === 'string') {
    replyText = msgObj;
  }

  if (!replyText) {
    const stringCandidate = dataNode.reply || dataNode.output || dataNode.text || dataNode.content || dataNode.caption || dataNode.message || dataNode.response;
    if (typeof stringCandidate === 'string') {
      replyText = stringCandidate;
    }
  }

  if (!imageUrl) {
    const topImg = dataNode.image || dataNode.imageUrl || dataNode.img;
    if (typeof topImg === 'string') {
      imageUrl = topImg;
    } else if (topImg && typeof topImg === 'object') {
      imageUrl = topImg.link || topImg.url || topImg.src;
      if (topImg.caption && !replyText) {
        replyText = topImg.caption;
      }
    }
  }

  const rawButtons = dataNode.buttons || msgObj?.buttons;
  if (Array.isArray(rawButtons)) {
    for (const b of rawButtons) {
      if (typeof b === 'string') {
        buttons.push({ id: `btn_${buttons.length + 1}`, title: b });
      } else if (b && typeof b === 'object') {
        buttons.push({ id: b.id || `btn_${buttons.length + 1}`, title: b.title || b.text || b.label || 'כפתור' });
      }
    }
  }

  const directSections = dataNode.sections || dataNode.action?.sections || dataNode.interactive?.action?.sections || msgObj?.sections || [];
  for (const sec of directSections) {
    const rows = sec.rows || sec.items || [];
    for (const row of rows) {
      buttons.push({
        id: row.id || row.row_id || `row_${buttons.length + 1}`,
        title: row.title || row.text || row.name || 'בחירה',
      });
    }
  }

  return { replyText, imageUrl, buttons };
};

// Helper to ensure every button title has a clear emoji icon
const ensureEmojiInTitle = (title: string): string => {
  if (!title) return '';
  const trimmed = title.trim();
  const hasEmoji = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/u.test(trimmed);
  if (hasEmoji) return trimmed;

  const tLower = trimmed.toLowerCase();
  if (tLower.includes('תור') || tLower.includes('בדיק') || tLower.includes('יומן') || tLower.includes('cal')) return `📅 ${trimmed}`;
  if (tLower.includes('אביגיל') || tLower.includes('טלפון') || tLower.includes('התקשר')) return `📞 ${trimmed}`;
  if (tLower.includes('וואטסאפ') || tLower.includes('צביקה') || tLower.includes("צ'אט")) return `💬 ${trimmed}`;
  if (tLower.includes('וויז') || tLower.includes('waze') || tLower.includes('הגעה') || tLower.includes('כתובת')) return `🚗 ${trimmed}`;
  if (tLower.includes('מחיר') || tLower.includes('150') || tLower.includes('250')) return `🏷️ ${trimmed}`;
  if (tLower.includes('משקפיים') || tLower.includes('מסגרת') || tLower.includes('עדש')) return `👓 ${trimmed}`;
  if (tLower.includes('ראייה') || tLower.includes('עין')) return `👁️ ${trimmed}`;

  return `🔹 ${trimmed}`;
};

// Helper to render text with clickable links
const renderFormattedText = (text: string) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline font-semibold break-all hover:text-blue-800 transition-colors"
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

export const ChatWidget: React.FC = () => {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [scriptError, setScriptError] = useState(false);

  // Fallback state if script fails to load
  const [isOpen, setIsOpen] = useState(false);
  const [botType, setBotType] = useState<'web' | 'whatsapp'>('web');
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_WEB_MESSAGE]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Inject external bot widget script from https://app.smartesek.com/bot-widget.js
  useEffect(() => {
    const scriptId = 'smartesek-bot-widget-script';
    let scriptEl = document.getElementById(scriptId) as HTMLScriptElement;

    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.id = scriptId;
      scriptEl.src = 'https://app.smartesek.com/bot-widget.js';
      scriptEl.async = true;
      scriptEl.setAttribute('data-bot-id', 'bot_generic_252');
      scriptEl.setAttribute('data-title', 'אופטיקה הטובה אמירים');
      scriptEl.setAttribute('data-whatsapp', '972552502584');
      scriptEl.setAttribute('data-theme-color', '#0047AB');
      scriptEl.setAttribute('data-webhook-url', 'https://n8n.srv1239769.hstgr.cloud/webhook/65325d34-0c9e-4cc3-8b7c-c03c47105b3a');

      scriptEl.onload = () => {
        setScriptLoaded(true);
        const searchParams = new URLSearchParams(window.location.search);
        const chatParam = searchParams.get('chat') || searchParams.get('Chat') || searchParams.get('bot') || searchParams.get('open');
        if (chatParam && ['open', 'true', '1'].includes(chatParam.toLowerCase())) {
          setTimeout(() => {
            const fab = document.getElementById('obw-fab');
            const win = document.getElementById('obw-window');
            if (fab && win && win.classList.contains('obw-hidden')) {
              fab.click();
            }
          }, 300);
        }
      };

      scriptEl.onerror = () => {
        console.warn('Could not load https://app.smartesek.com/bot-widget.js, falling back to built-in React widget UI');
        setScriptError(true);
      };

      document.body.appendChild(scriptEl);
    } else {
      setScriptLoaded(true);
    }

    const searchParams = new URLSearchParams(window.location.search);
    const chatParam = searchParams.get('chat') || searchParams.get('Chat') || searchParams.get('bot') || searchParams.get('open');
    if (chatParam && ['open', 'true', '1'].includes(chatParam.toLowerCase())) {
      setIsOpen(true);
      setTimeout(() => {
        const fab = document.getElementById('obw-fab');
        const win = document.getElementById('obw-window');
        if (fab && win && win.classList.contains('obw-hidden')) {
          fab.click();
        }
      }, 400);
    }
  }, []);

  // Client Anonymous UUID cookie/storage for session persistence when phone is not provided
  const [clientUUID] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      let saved = localStorage.getItem('optics_client_uuid') || getPersistentCookie('optics_client_uuid');
      if (!saved) {
        saved = 'web_client_' + Math.random().toString(36).substring(2, 10) + '_' + Math.random().toString(36).substring(2, 10);
      }
      localStorage.setItem('optics_client_uuid', saved);
      setPersistentCookie('optics_client_uuid', saved);
      return saved;
    }
    return 'web_client_anon';
  });

  const [userPhone, setUserPhone] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('optics_user_phone') || getPersistentCookie('optics_user_phone') || '';
      return saved;
    }
    return '';
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, loading]);

  const sendTextMessage = async (textToSend: string, buttonId?: string) => {
    if (!textToSend.trim() || loading) return;

    const userText = textToSend.trim();

    // Check if user text contains or is a phone number
    const detectedPhone = extractPhoneFromText(userText);
    let activePhone = userPhone;

    if (detectedPhone) {
      activePhone = detectedPhone;
      setUserPhone(detectedPhone);
      if (typeof window !== 'undefined') {
        localStorage.setItem('optics_user_phone', detectedPhone);
        setPersistentCookie('optics_user_phone', detectedPhone);
        localStorage.setItem('optics_session_id', detectedPhone);
        setPersistentCookie('optics_session_id', detectedPhone);
      }
    }

    // Session ID is either the international phone number if available, or the client UUID string
    const activeSessionId = activePhone ? activePhone : clientUUID;

    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      botType,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setLoading(true);

    if (botType === 'whatsapp') {
      // Direct WhatsApp redirect or webhook send
      window.open(BUSINESS_INFO.whatsappAgentUrl, '_blank');
      
      const botReply: ChatMessage = {
        id: 'bot-' + Date.now(),
        sender: 'bot',
        text: `מעביר אותך כעת לסוכן הוואטסאפ במספר ${BUSINESS_INFO.whatsappAgentPhone}. אם החלון לא נפתח אוטומטית, לחץ על הכפתור מטה.`,
        buttons: [{ id: 'wa_direct', title: `📱 פתח וואטסאפ (${BUSINESS_INFO.whatsappAgentPhone})` }],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        botType: 'whatsapp',
      };
      setMessages((prev) => [...prev, botReply]);
      setLoading(false);
      return;
    }

    const webhookPayload = {
      bot_id: 'bot_generic_252',
      botId: 'bot_generic_252',
      message: userText,
      buttonId,
      sessionId: activeSessionId,
      sessionID: activeSessionId,
      userPhone: activePhone,
      timestamp: new Date().toISOString(),
    };

    let gotResponse = false;

    // 1. Try local Express server route (/api/bot/web)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const res = await fetch('/api/bot/web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data && (data.reply || data.buttons?.length > 0 || data.imageUrl)) {
          const replyText = data.reply;
          const buttons: ChatButton[] = data.buttons || [];
          const imageUrl = data.imageUrl;

          const botMsg: ChatMessage = {
            id: 'bot-' + Date.now(),
            sender: 'bot',
            text: replyText,
            buttons: buttons.length > 0 ? buttons : undefined,
            imageUrl,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            botType: 'web',
          };

          setMessages((prev) => [...prev, botMsg]);
          gotResponse = true;
        }
      }
    } catch (err) {
      console.warn('Backend proxy /api/bot/web unavailable or timed out, trying direct n8n webhook fetch...', err);
    }

    // 2. Direct Fallback to n8n Webhook (works on static deployments like GitHub Pages / Vercel / Netlify)
    if (!gotResponse) {
      try {
        const n8nWebhookUrl = 'https://n8n.srv1239769.hstgr.cloud/webhook/65325d34-0c9e-4cc3-8b7c-c03c47105b3a';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        const directRes = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookPayload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (directRes.ok) {
          const rawData = await directRes.json().catch(() => null);
          if (rawData) {
            let replyText = '';
            let buttons: ChatButton[] = [];
            let imageUrl: string | undefined = undefined;

            const items = Array.isArray(rawData) ? rawData : [rawData];
            for (const item of items) {
              const dataNode = item?.json || item || {};
              const extracted = parseN8nDataNode(dataNode);
              if (extracted.replyText) {
                replyText = replyText ? `${replyText}\n\n${extracted.replyText}` : extracted.replyText;
              }
              if (extracted.imageUrl) {
                imageUrl = extracted.imageUrl;
              }
              if (extracted.buttons.length > 0) {
                buttons = [...buttons, ...extracted.buttons];
              }
            }

            if (replyText || buttons.length > 0 || imageUrl) {
              const botMsg: ChatMessage = {
                id: 'bot-' + Date.now(),
                sender: 'bot',
                text: replyText || 'תשובה מבוט האופטיקה',
                buttons: buttons.length > 0 ? buttons : undefined,
                imageUrl,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                botType: 'web',
              };
              setMessages((prev) => [...prev, botMsg]);
              gotResponse = true;
            }
          }
        }
      } catch (directErr) {
        console.error('Direct n8n webhook call failed:', directErr);
      }
    }

    // 3. Fallback message if all attempts fail
    if (!gotResponse) {
      const fallbackMsg: ChatMessage = {
        id: 'bot-' + Date.now(),
        sender: 'bot',
        text: 'תודה על פנייתך! לשירות מהיר ניתן לקבוע תור ביומן הדיגיטלי או לפנות אלינו ישירות בטלפון 054-913-1704 (אביגיל).',
        buttons: [
          { id: 'btn_cal', title: '📅 יומן תורים דיגיטלי' },
          { id: 'btn_avigail', title: '📞 התקשר לאביגיל (054-913-1704)' },
          { id: 'btn_wa', title: '💬 וואטסאפ צביקה (055-250-2584)' }
        ],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        botType: 'web',
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    }

    setLoading(false);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendTextMessage(inputMessage);
  };

  const handleOptionClick = (btn: ChatButton) => {
    if (btn.id === 'wa_direct') {
      window.open(BUSINESS_INFO.whatsappAgentUrl, '_blank');
      return;
    }

    sendTextMessage(btn.title, btn.id);
  };

  const openWhatsappAgent = () => {
    window.open(BUSINESS_INFO.whatsappAgentUrl, '_blank');
  };

  // If external bot widget script loaded successfully, the widget UI is rendered into document.body by bot-widget.js
  if (scriptLoaded && !scriptError) {
    return null;
  }

  return (
    <div className="fixed bottom-5 left-5 z-50">
      {/* Floating Toggle Buttons (Two Distinct Bot Bubbles) */}
      {!isOpen ? (
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2.5">
          {/* Bubble 1: WEB Bot */}
          <button
            onClick={() => {
              setBotType('web');
              setIsOpen(true);
            }}
            className="bg-[#0047AB] hover:bg-[#003580] text-white p-3.5 sm:px-4 sm:py-3 rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2.5 border border-white/20 group cursor-pointer"
            aria-label="פתח בוט WEB"
          >
            <div className="relative">
              <Bot className="w-5 h-5 text-white group-hover:rotate-12 transition-transform" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-300 rounded-full animate-ping" />
            </div>
            <div className="text-right">
              <span className="block font-black text-xs font-['Rubik']">בוט WEB</span>
              <span className="text-[10px] text-blue-100 hidden sm:block">צ'אט אוטומטי באתר</span>
            </div>
          </button>

          {/* Bubble 2: WhatsApp Bot */}
          <button
            onClick={openWhatsappAgent}
            className="bg-[#25D366] hover:bg-[#1DA851] text-white p-3.5 sm:px-4 sm:py-3 rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2.5 border border-white/20 group cursor-pointer"
            aria-label="פתח בוט WhatsApp"
          >
            <div className="relative">
              <MessageCircle className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-200 rounded-full animate-ping" />
            </div>
            <div className="text-right">
              <span className="block font-black text-xs font-['Rubik']">בוט WhatsApp</span>
              <span className="text-[10px] text-emerald-100 hidden sm:block">{BUSINESS_INFO.whatsappAgentPhone}</span>
            </div>
          </button>
        </div>
      ) : (
        /* Chat Drawer Popup */
        <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-80 sm:w-96 flex flex-col h-[560px] max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom-5">
          {/* Top Header - Centered title */}
          <div className="bg-gradient-to-r from-[#0047AB] via-sky-600 to-[#002D6B] px-4 py-3.5 text-white flex items-center justify-between relative shadow-md">
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white p-1 rounded-lg transition-colors z-10 cursor-pointer"
              aria-label="סגור צ'אט"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-2.5 text-center">
                <div className="w-8 h-8 rounded-full bg-white text-[#0047AB] flex items-center justify-center font-bold shadow-sm shrink-0 border border-blue-200">
                  <Glasses className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm sm:text-base font-['Rubik'] text-white leading-tight">
                    האופטיקה הטובה
                  </h4>
                  <p className="text-[11px] text-blue-100 font-medium leading-tight">מושב אמירים</p>
                </div>
              </div>
            </div>

            <div className="w-5 h-5 opacity-0 pointer-events-none" />
          </div>

          {/* Bot Selector Bar */}
          <div className="bg-slate-100 p-1.5 flex gap-1 text-xs border-b border-slate-200">
            <button
              onClick={() => setBotType('web')}
              className={`flex-1 py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                botType === 'web'
                  ? 'bg-white text-[#0047AB] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-[#0047AB]" />
              <span>צ'אט WEB באתר</span>
            </button>

            <button
              onClick={openWhatsappAgent}
              className="flex-1 py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 bg-[#25D366] text-white hover:bg-[#1DA851] transition-all cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>בוט WhatsApp</span>
            </button>
          </div>

          {/* Message Thread */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50 text-xs">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] leading-relaxed whitespace-pre-line ${
                    msg.sender === 'user'
                      ? 'bg-[#0047AB] text-white rounded-2xl rounded-br-xs px-4 py-2.5 text-sm font-medium shadow-xs'
                      : 'bg-white text-gray-800 border border-blue-100 rounded-2xl rounded-bl-xs p-3.5 text-xs shadow-sm'
                  }`}
                >
                  <p className={msg.sender === 'user' ? 'text-sm font-medium text-white' : ''}>
                    {renderFormattedText(msg.text)}
                  </p>

                  {/* Render Image if returned */}
                  {msg.imageUrl && (
                    <div className="mt-2.5 rounded-xl overflow-hidden border border-gray-200 shadow-2xs group relative">
                      <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="block relative">
                        <img
                          src={msg.imageUrl}
                          alt="תמונה מהבוט"
                          className="w-full h-auto object-cover max-h-60 transition-transform duration-200 group-hover:scale-102"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-medium text-xs bg-black/30">
                          🔍 לחץ להגדלת התמונה
                        </div>
                      </a>
                    </div>
                  )}

                  {/* Render Interactive Buttons if present */}
                  {msg.buttons && msg.buttons.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-blue-100 grid grid-cols-2 gap-2">
                      {msg.buttons.map((btn) => (
                        <button
                          key={btn.id}
                          onClick={() => handleOptionClick(btn)}
                          className="w-full bg-white hover:bg-blue-50 text-[#0047AB] border border-blue-300 font-bold px-2.5 py-2 rounded-xl text-center text-[11px] sm:text-xs transition-all shadow-2xs hover:border-[#0047AB] flex items-center justify-center gap-1 active:scale-95"
                        >
                          <span>{ensureEmojiInTitle(btn.title)}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Timestamp - only for bot messages */}
                  {msg.sender !== 'user' && (
                    <span className="block text-[9px] mt-1.5 text-gray-400 text-right">
                      {msg.timestamp}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-blue-200 p-3 rounded-2xl text-slate-600 text-xs flex items-center gap-2 shadow-xs">
                  <div className="w-2 h-2 bg-[#0047AB] rounded-full animate-ping" />
                  <span>מעבד תשובה מבוט האופטיקה...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Calendar Link Banner */}
          <div className="p-2 bg-[#E8F0FE] border-t border-blue-100 flex items-center justify-between px-3 text-[11px]">
            <span className="text-[#0047AB] font-bold">מעדיף לקבוע תור ישירות ביומן?</span>
            <a
              href={BUSINESS_INFO.calComUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0047AB] font-black underline hover:text-blue-900 flex items-center gap-1"
            >
              <span>קביעת תור ביומן</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Input Bar */}
          <form onSubmit={handleFormSubmit} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
            <input
              type="text"
              placeholder="הקלד הודעה לבוט האופטיקה..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              className="flex-1 bg-slate-100 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0047AB]"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || loading}
              className="bg-[#0047AB] hover:bg-[#003580] disabled:opacity-50 text-white p-2.5 rounded-xl transition-colors shadow-xs"
              aria-label="שלח הודעה"
            >
              <Send className="w-4 h-4 rotate-180" />
            </button>
          </form>

          {/* Credit Footer */}
          <div className="py-2 bg-slate-50 border-t border-slate-200 text-center text-[11px] text-slate-500 font-medium flex items-center justify-center gap-1 shrink-0">
            <span>Powered by</span>
            <a
              href="https://app.smartesek.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0047AB] font-bold hover:underline flex items-center gap-1"
            >
              <span>בוט חכם</span>
              <span>🤖</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
