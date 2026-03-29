const fs = require('fs');

const newKeys = {
  en: { userNameLabel: "Bot Name", userNamePlaceholder: "Enter bot's name" },
  hi: { userNameLabel: "बॉट का नाम", userNamePlaceholder: "बॉट का नाम दर्ज करें" },
  bho: { userNameLabel: "बॉट के नाम", userNamePlaceholder: "बॉट के नाम दर्ज करीं" },
  bn: { userNameLabel: "বটের নাম", userNamePlaceholder: "বটের নাম লিখুন" },
  ta: { userNameLabel: "பாட் பெயர்", userNamePlaceholder: "பாட் பெயரை உள்ளிடவும்" },
  te: { userNameLabel: "బాట్ పేరు", userNamePlaceholder: "బాట్ పేరు నమోదు చేయండి" },
  mr: { userNameLabel: "बॉटचे नाव", userNamePlaceholder: "बॉटचे नाव प्रविष्ट करा" },
  gu: { userNameLabel: "બૉટનું નામ", userNamePlaceholder: "બૉટનું નામ દાખલ કરો" },
  kn: { userNameLabel: "ಬಾಟ್ ಹೆಸರು", userNamePlaceholder: "ಬಾಟ್ ಹೆಸರನ್ನು ನಮೂದಿಸಿ" },
  ml: { userNameLabel: "ബോട്ടിന്റെ പേര്", userNamePlaceholder: "ബോട്ടിന്റെ പേര് നൽകുക" },
  or: { userNameLabel: "ବଟ୍ ନାମ", userNamePlaceholder: "ବଟ୍ ନାମ ଦିଅନ୍ତୁ" },
  pa: { userNameLabel: "ਬੋਟ ਦਾ ਨਾਮ", userNamePlaceholder: "ਬੋਟ ਦਾ ਨਾਮ ਦਰਜ ਕਰੋ" },
  ur: { userNameLabel: "بوٹ کا نام", userNamePlaceholder: "بوٹ کا نام درج کریں" },
  as: { userNameLabel: "বটৰ নাম", userNamePlaceholder: "বটৰ নাম লিখক" },
  ne: { userNameLabel: "बोटको नाम", userNamePlaceholder: "बोटको नाम प्रविष्ट गर्नुहोस्" },
  mai: { userNameLabel: "बॉट के नाम", userNamePlaceholder: "बॉट के नाम दर्ज करू" },
  sd: { userNameLabel: "بوٽ جو نالو", userNamePlaceholder: "بوٽ جو نالو داخل ڪريو" },
  kok: { userNameLabel: "बॉटचें नांव", userNamePlaceholder: "बॉटचें नांव बरोवचें" },
  doi: { userNameLabel: "बॉट दा नां", userNamePlaceholder: "बॉट दा नां दर्ज करो" },
  ks: { userNameLabel: "بوٹُن ناو", userNamePlaceholder: "بوٹُن ناو دَرٕج کٔرِو" },
  sa: { userNameLabel: "बॉट-नाम", userNamePlaceholder: "बॉट-नाम लिखतु" },
  sat: { userNameLabel: "ᱵᱚᱴ ᱟᱜ ᱧᱩᱛᱩᱢ", userNamePlaceholder: "ᱵᱚᱴ ᱟᱜ ᱧᱩᱛᱩᱢ ᱚᱞ ᱢᱮ" },
  brx: { userNameLabel: "बटनि मुं", userNamePlaceholder: "बटनि मुं लिर" },
  mni: { userNameLabel: "বোটকী মমিং", userNamePlaceholder: "বোটকী মমিং ইবিয়ু" }
};

let content = fs.readFileSync('src/App.tsx', 'utf8');

for (const [lang, keys] of Object.entries(newKeys)) {
  // We can just replace the specific strings since they are mostly unique per language
  // But to be safe, we can find the block for each language.
  
  // Let's just do a simple replace for the exact strings we know are there.
  // Actually, let's just use a regex that looks for userNameLabel: "..."
}
