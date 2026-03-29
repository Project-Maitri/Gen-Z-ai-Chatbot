const fs = require('fs');

const newKeys = {
  en: { userNameLabel: "Your Name", userNamePlaceholder: "Enter your name" },
  hi: { userNameLabel: "आपका नाम", userNamePlaceholder: "अपना नाम दर्ज करें" },
  bho: { userNameLabel: "रउआ नाम", userNamePlaceholder: "आपन नाम दर्ज करीं" },
  bn: { userNameLabel: "আপনার নাম", userNamePlaceholder: "আপনার নাম লিখুন" },
  ta: { userNameLabel: "உங்கள் பெயர்", userNamePlaceholder: "உங்கள் பெயரை உள்ளிடவும்" },
  te: { userNameLabel: "మీ పేరు", userNamePlaceholder: "మీ పేరు నమోదు చేయండి" },
  mr: { userNameLabel: "तुमचे नाव", userNamePlaceholder: "तुमचे नाव प्रविष्ट करा" },
  gu: { userNameLabel: "તમારું નામ", userNamePlaceholder: "તમારું નામ દાખલ કરો" },
  kn: { userNameLabel: "ನಿಮ್ಮ ಹೆಸರು", userNamePlaceholder: "ನಿಮ್ಮ ಹೆಸರನ್ನು ನಮೂದಿಸಿ" },
  ml: { userNameLabel: "നിങ്ങളുടെ പേര്", userNamePlaceholder: "നിങ്ങളുടെ പേര് നൽകുക" },
  or: { userNameLabel: "ଆପଣଙ୍କ ନାମ", userNamePlaceholder: "ଆପଣଙ୍କ ନାମ ଦିଅନ୍ତୁ" },
  pa: { userNameLabel: "ਤੁਹਾਡਾ ਨਾਮ", userNamePlaceholder: "ਆਪਣਾ ਨਾਮ ਦਰਜ ਕਰੋ" },
  ur: { userNameLabel: "آپ کا نام", userNamePlaceholder: "اپنا نام درج کریں" },
  as: { userNameLabel: "আপোনাৰ নাম", userNamePlaceholder: "আপোনাৰ নাম লিখক" },
  ne: { userNameLabel: "तपाईंको नाम", userNamePlaceholder: "आफ्नो नाम प्रविष्ट गर्नुहोस्" },
  mai: { userNameLabel: "अहाँक नाम", userNamePlaceholder: "अपन नाम दर्ज करू" },
  sd: { userNameLabel: "توهان جو نالو", userNamePlaceholder: "پنهنجو نالو داخل ڪريو" },
  kok: { userNameLabel: "तुमचें नांव", userNamePlaceholder: "तुमचें नांव बरोवचें" },
  doi: { userNameLabel: "तुंदा नां", userNamePlaceholder: "अपना नां दर्ज करो" },
  ks: { userNameLabel: "تُہُنٛد ناو", userNamePlaceholder: "پَنُن ناو دَرٕج کٔرِو" },
  sa: { userNameLabel: "भवतः नाम", userNamePlaceholder: "स्वनाम लिखतु" },
  sat: { userNameLabel: "ᱟᱢᱟᱜ ᱧᱩᱛᱩᱢ", userNamePlaceholder: "ᱟᱢᱟᱜ ᱧᱩᱛᱩᱢ ᱚᱞ ᱢᱮ" },
  brx: { userNameLabel: "नोंथांनि मुं", userNamePlaceholder: "नोंथांनि मुं लिर" },
  mni: { userNameLabel: "নহাক্কী মমিং", userNamePlaceholder: "নহাক্কী মমিং ইবিয়ু" }
};

let content = fs.readFileSync('src/App.tsx', 'utf8');

for (const [lang, keys] of Object.entries(newKeys)) {
  const regex = new RegExp(`(\\b${lang}:\\s*{[\\s\\S]*?)(poweredBy:)`, 'g');
  const replacement = `$1userNameLabel: "${keys.userNameLabel}",\n    userNamePlaceholder: "${keys.userNamePlaceholder}",\n    $2`;
  content = content.replace(regex, replacement);
}

fs.writeFileSync('src/App.tsx', content);
console.log('Done');
