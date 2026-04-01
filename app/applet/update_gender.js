const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Add guessGender function
const guessGenderFunc = `
const guessGender = (name: string): 'M' | 'F' => {
  if (!name) return 'M';
  const lowerName = name.trim().toLowerCase();
  
  const femaleSuffixes = ['a', 'i', 'ee', 'ya', 'na', 'ta', 'ra', 'la', 'ka', 'sa', 'ha', 'ma', 'wati', 'vati', 'devi', 'bai', 'kumari', 'kaur', 'ben', 'bibi', 'bano', 'begum', 'khatoon', 'nisa'];
  
  const maleExceptions = ['shiva', 'krishna', 'aditya', 'rama', 'rishi', 'ravi', 'hari', 'murali', 'gopi', 'kavi', 'mani', 'swami', 'yogi', 'bhai', 'singh', 'kumar', 'nath', 'das', 'ram', 'raj', 'ji', 'rahul', 'amit', 'suresh', 'ramesh', 'mahesh', 'dinesh', 'prasad'];
  
  for (const exc of maleExceptions) {
    if (lowerName.endsWith(exc) || lowerName === exc) return 'M';
  }
  
  for (const suf of femaleSuffixes) {
    if (lowerName.endsWith(suf)) return 'F';
  }
  
  return 'M';
};
`;

if (!content.includes('const guessGender')) {
  content = content.replace('const App = () => {', guessGenderFunc + '\nconst App = () => {');
}

// 2. Add botGender state
const botGenderState = `  const [botGender, setBotGender] = useState<'M' | 'F'>(() => (safeStorage.getItem('botGender') as 'M' | 'F') || 'M');`;
if (!content.includes('const [botGender')) {
  content = content.replace('const [userName, setUserName] = useState(() => {', botGenderState + '\n  const [userName, setUserName] = useState(() => {');
}

// 3. Update getInitialMessage
const oldGetInitialMessage = `  const getInitialMessage = (lang: string, name: string) => {
    const trans = translations[lang] || translations['en'];
    const trimmedName = name.trim();
    if (!trimmedName) {
      return trans.initialMessage;
    }
    return trans.initialMessageWithName.replace(/\\{botName\\}/g, trimmedName);
  };`;

const newGetInitialMessage = `  const getInitialMessage = (lang: string, name: string, gender: 'M' | 'F') => {
    const trans = translations[lang] || translations['en'];
    const trimmedName = name.trim();
    if (!trimmedName) {
      return trans.initialMessage;
    }
    let msg = trans.initialMessageWithName.replace(/\\{botName\\}/g, trimmedName);
    
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
  };`;

content = content.replace(oldGetInitialMessage, newGetInitialMessage);

// 4. Update calls to getInitialMessage
content = content.replace(/getInitialMessage\(uiLang, userName\)/g, "getInitialMessage(uiLang, userName, botGender)");
content = content.replace(/getInitialMessage\(lang, userName\)/g, "getInitialMessage(lang, userName, botGender)");
content = content.replace(/getInitialMessage\(uiLang, currentBotName\)/g, "getInitialMessage(uiLang, currentBotName, botGender)");

// 5. Update setUserName to also set botGender
content = content.replace(/setUserName\(setupName\.trim\(\)\);/g, "setUserName(setupName.trim());\n                            const gender = guessGender(setupName.trim());\n                            setBotGender(gender);\n                            safeStorage.setItem('botGender', gender);\n                            if (gender === 'F') { setPremiumVoice('Kore'); safeStorage.setItem('premiumVoice', 'Kore'); } else { setPremiumVoice('Fenrir'); safeStorage.setItem('premiumVoice', 'Fenrir'); }");

content = content.replace(/setUserName\(uiLang === 'hi' \? 'जेन-जी' : 'Gen-Z'\);/g, "setUserName(uiLang === 'hi' ? 'जेन-जी' : 'Gen-Z');\n                            setBotGender('M');\n                            safeStorage.setItem('botGender', 'M');\n                            setPremiumVoice('Fenrir');\n                            safeStorage.setItem('premiumVoice', 'Fenrir');");

// 6. Update startLiveAudio to use premiumVoiceRef.current instead of 'Charon'
content = content.replace(/voiceConfig: \{ prebuiltVoiceConfig: \{ voiceName: 'Charon' \} \}/g, "voiceConfig: { prebuiltVoiceConfig: { voiceName: premiumVoiceRef.current } }");

// 7. Add Kore and Zephyr to translations
const translationsRegex = /puckDesc: "(.*?)"\n  \},/g;
content = content.replace(translationsRegex, (match, p1) => {
  let kore = "Kore (Calm, Measured Female)";
  let zephyr = "Zephyr (Strong, Authoritative Female)";
  
  if (p1.includes("पुरुष")) {
    kore = "कोरे (शांत, नपा-तुला महिला)";
    zephyr = "ज़ेफिर (मजबूत, आधिकारिक महिला)";
  } else if (p1.includes("পুরুষ")) {
    kore = "কোর (শান্ত, পরিমাপিত মহিলা)";
    zephyr = "জেফির (শক্তিশালী, প্রামাণিক মহিলা)";
  }
  
  return `puckDesc: "${p1}",\n    koreDesc: "${kore}",\n    zephyrDesc: "${zephyr}"\n  },`;
});

// 8. Add Kore and Zephyr to the select dropdown
const selectRegex = /<option value="Puck" className="bg-zinc-800">\{t\.puckDesc\}<\/option>/;
const newOptions = `<option value="Puck" className="bg-zinc-800">{t.puckDesc}</option>
                          <option value="Kore" className="bg-zinc-800">{t.koreDesc || "Kore (Calm Female)"}</option>
                          <option value="Zephyr" className="bg-zinc-800">{t.zephyrDesc || "Zephyr (Strong Female)"}</option>`;
content = content.replace(selectRegex, newOptions);

// 9. Update premiumVoice initial state to allow female voices
content = content.replace(/const femaleVoices = \['Kore', 'Zephyr'\];\n    return \(saved && !femaleVoices\.includes\(saved\)\) \? saved : 'Fenrir';/, "return saved || 'Fenrir';");

fs.writeFileSync('src/App.tsx', content);
console.log('App.tsx updated');
