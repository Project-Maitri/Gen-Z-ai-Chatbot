const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = [
  // English
  ['initialMessage: "Hello Nard! Welcome', 'initialMessage: "Hello Gen-Z! Welcome'],
  ['initialMessageWithName: "Hello Nard!🙏', 'initialMessageWithName: "Hello Gen-Z!🙏'],

  // Hindi
  ['initialMessage: "नमस्ते नॉर्ड! ई-मैत्री', 'initialMessage: "नमस्ते जेन-जी! ई-मैत्री'],
  ['initialMessageWithName: "नमस्ते नॉर्ड!🙏', 'initialMessageWithName: "नमस्ते जेन-जी!🙏'],

  // Bhojpuri
  ['initialMessage: "हम नॉर्ड हईं! ई-मैत्री', 'initialMessage: "नमस्ते जेन-जी! ई-मैत्री'],
  ['initialMessageWithName: "नमस्ते नॉर्ड!🙏', 'initialMessageWithName: "नमस्ते जेन-जी!🙏'],

  // Bengali
  ['initialMessage: "আমি নর্ড! ই-মৈত্রী', 'initialMessage: "নমস্কার জেন-জি! ই-মৈত্রী'],
  ['initialMessageWithName: "হ্যালো নর্ড!🙏', 'initialMessageWithName: "নমস্কার জেন-জি!🙏'],

  // Tamil
  ['initialMessage: "நான் நார்ட்! இ-மைத்ரி', 'initialMessage: "வணக்கம் ஜென்-ஜி! இ-மைத்ரி'],
  ['initialMessageWithName: "வணக்கம் நார்ட்!🙏', 'initialMessageWithName: "வணக்கம் ஜென்-ஜி!🙏'],

  // Telugu
  ['initialMessage: "నేను నార్డ్! ఇ-మైత్రి', 'initialMessage: "నమస్తే జెన్-జి! ఇ-మైత్రి'],
  ['initialMessageWithName: "నమస్తే నార్డ్!🙏', 'initialMessageWithName: "నమస్తే జెన్-జి!🙏'],

  // Marathi
  ['initialMessage: "मी नॉर्ड आहे! ई-मैत्री', 'initialMessage: "नमस्ते जेन-जी! ई-मैत्री'],
  ['initialMessageWithName: "नमस्ते नॉर्ड!🙏', 'initialMessageWithName: "नमस्ते जेन-जी!🙏'],

  // Gujarati
  ['initialMessage: "હું જેન-જી છું! ઈ-મૈત્રી', 'initialMessage: "નમસ્તે જેન-જી! ઈ-મૈત્રી'],
  ['initialMessageWithName: "નમસ્તે જેન-જી!🙏 હું {botName} છું!', 'initialMessageWithName: "નમસ્તે જેન-જી!🙏 હું {botName} છું!'], // Already correct mostly, just to be sure

  // Kannada
  ['initialMessage: "ನಾನು ನಾರ್ಡ್! ಇ-ಮೈತ್ರಿ', 'initialMessage: "ನಮಸ್ತೆ ಜೆನ್-ಜಿ! ಇ-ಮೈತ್ರಿ'],
  ['initialMessageWithName: "ನಮಸ್ತೆ ನಾರ್ಡ್!🙏', 'initialMessageWithName: "ನಮಸ್ತೆ ಜೆನ್-ಜಿ!🙏'],

  // Malayalam
  ['initialMessage: "ഞാൻ ജെൻ-ജി! ഇ-മൈത്രി', 'initialMessage: "നമസ്കാരം ജെൻ-ജി! ഇ-മൈത്രി'],
  ['initialMessageWithName: "നമസ്കാരം ജെൻ-ജി!🙏 ഞാൻ {botName} ആണ്!', 'initialMessageWithName: "നമസ്കാരം ജെൻ-ജി!🙏 ഞാൻ {botName} ആണ്!'],

  // Odia
  ['initialMessage: "ମୁଁ ନର୍ଡ! ଇ-ମୈତ୍ରୀ', 'initialMessage: "ନମସ୍ତେ ଜେନ୍-ଜି! ଇ-ମୈତ୍ରୀ'],
  ['initialMessageWithName: "ନମସ୍ତେ ନର୍ଡ!🙏', 'initialMessageWithName: "ନମସ୍ତେ ଜେନ୍-ଜି!🙏'],

  // Punjabi
  ['initialMessage: "ਮੈਂ ਜੇਨ-ਜੀ ਹਾਂ! ਈ-ਮੈਤਰੀ', 'initialMessage: "ਨਮਸਤੇ ਜੇਨ-ਜੀ! ਈ-ਮੈਤਰੀ'],
  ['initialMessageWithName: "ਨਮਸਤੇ ਜੇਨ-ਜੀ!🙏 ਮੈਂ {botName} ਹਾਂ!', 'initialMessageWithName: "ਨਮਸਤੇ ਜੇਨ-ਜੀ!🙏 ਮੈਂ {botName} ਹਾਂ!'],

  // Urdu
  ['initialMessage: "میں نارڈ ہوں! ای-میتری', 'initialMessage: "ہیلو جین-جی! ای-میتری'],
  ['initialMessageWithName: "ہیلو نارڈ!🙏', 'initialMessageWithName: "ہیلو جین-جی!🙏'],

  // Assamese
  ['initialMessage: "মই নর্ড! ই-মৈত্ৰী', 'initialMessage: "নমস্কাৰ জেন-জি! ই-মৈত্ৰী'],
  ['initialMessageWithName: "নমস্কাৰ নর্ড!🙏', 'initialMessageWithName: "নমস্কাৰ জেন-জি!🙏'],

  // Nepali
  ['initialMessage: "म नॉर्ड हुँ! ई-मैत्री', 'initialMessage: "नमस्ते जेन-जी! ई-मैत्री'],
  ['initialMessageWithName: "नमस्ते नॉर्ड!🙏', 'initialMessageWithName: "नमस्ते जेन-जी!🙏'],

  // Maithili
  ['initialMessage: "हम नॉर्ड छी! ई-मैत्री', 'initialMessage: "नमस्ते जेन-जी! ई-मैत्री'],
  ['initialMessageWithName: "नमस्ते नॉर्ड!🙏', 'initialMessageWithName: "नमस्ते जेन-जी!🙏'],

  // Sindhi
  ['initialMessage: "مان نارڊ آهيان! اي-ميتري', 'initialMessage: "هيلو جين-جي! اي-ميتري'],
  ['initialMessageWithName: "هيلو نارڊ!🙏', 'initialMessageWithName: "هيلو جين-جي!🙏'],

  // Konkani
  ['initialMessage: "हांव नॉर्ड! ई-मैत्री', 'initialMessage: "नमस्ते जेन-जी! ई-मैत्री'],
  ['initialMessageWithName: "नमस्ते नॉर्ड!🙏', 'initialMessageWithName: "नमस्ते जेन-जी!🙏'],

  // Dogri
  ['initialMessage: "मैं नॉर्ड आं! ई-मैत्री', 'initialMessage: "नमस्ते जेन-जी! ई-मैत्री'],
  ['initialMessageWithName: "नमस्ते नॉर्ड!🙏', 'initialMessageWithName: "नमस्ते जेन-जी!🙏'],

  // Kashmiri
  ['initialMessage: "بہٕ چھُس نارڈ! ای-میتری', 'initialMessage: "ہیلو جین-جی! ای-میتری'],
  ['initialMessageWithName: "ہیلو نارڈ!🙏', 'initialMessageWithName: "ہیلو جین-جی!🙏'],

  // Sanskrit
  ['initialMessage: "अहं नॉर्ड अस्मि! ई-मैत्री', 'initialMessage: "नमस्ते जेन-जी! ई-मैत्री'],
  ['initialMessageWithName: "नमस्ते नॉर्ड!🙏', 'initialMessageWithName: "नमस्ते जेन-जी!🙏'],

  // Santali
  ['initialMessage: "ᱤᱧ ᱫᱚ ᱱᱚᱨᱰ ᱠᱟᱹᱱᱟᱹᱧ! ᱤ-ᱢᱟᱭᱛᱨᱤ', 'initialMessage: "ᱡᱚᱦᱟᱨ ᱡᱮᱱ-ᱡᱤ! ᱤ-ᱢᱟᱭᱛᱨᱤ'],
  ['initialMessageWithName: "ᱡᱚᱦᱟᱨ ᱱᱚᱨᱰ!🙏', 'initialMessageWithName: "ᱡᱚᱦᱟᱨ ᱡᱮᱱ-ᱡᱤ!🙏'],

  // Bodo
  ['initialMessage: "आं नॉर्ड! ई-मैत्री', 'initialMessage: "खुलुमबाय जेन-जी! ई-मैत्री'],
  ['initialMessageWithName: "खुलुमबाय नॉर्ड!🙏', 'initialMessageWithName: "खुलुमबाय जेन-जी!🙏'],

  // Manipuri
  ['initialMessage: "ঐ নর্ড নি! ই-মৈত্রী', 'initialMessage: "খুরুমজরি জেন-জি! ই-মৈত্রী'],
  ['initialMessageWithName: "খুরুমজরি নর্ড!🙏', 'initialMessageWithName: "খুরুমজরি জেন-জি!🙏'],
];

replacements.forEach(([search, replace]) => {
  content = content.replace(search, replace);
});

fs.writeFileSync('src/App.tsx', content);
console.log('Greetings updated.');
