const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/userNameLabel: "Your Name"/g, 'userNameLabel: "Bot Name"');
content = content.replace(/userNamePlaceholder: "Enter your name"/g, 'userNamePlaceholder: "Enter bot\'s name"');

content = content.replace(/userNameLabel: "आपका नाम"/g, 'userNameLabel: "बॉट का नाम"');
content = content.replace(/userNamePlaceholder: "अपना नाम दर्ज करें"/g, 'userNamePlaceholder: "बॉट का नाम दर्ज करें"');

content = content.replace(/userNameLabel: "रउआ नाम"/g, 'userNameLabel: "बॉट के नाम"');
content = content.replace(/userNamePlaceholder: "आपन नाम दर्ज करीं"/g, 'userNamePlaceholder: "बॉट के नाम दर्ज करीं"');

content = content.replace(/userNameLabel: "আপনার নাম"/g, 'userNameLabel: "বটের নাম"');
content = content.replace(/userNamePlaceholder: "আপনার নাম লিখুন"/g, 'userNamePlaceholder: "বটের নাম লিখুন"');

content = content.replace(/userNameLabel: "உங்கள் பெயர்"/g, 'userNameLabel: "பாட் பெயர்"');
content = content.replace(/userNamePlaceholder: "உங்கள் பெயரை உள்ளிடவும்"/g, 'userNamePlaceholder: "பாட் பெயரை உள்ளிடவும்"');

content = content.replace(/userNameLabel: "మీ పేరు"/g, 'userNameLabel: "బాట్ పేరు"');
content = content.replace(/userNamePlaceholder: "మీ పేరు నమోదు చేయండి"/g, 'userNamePlaceholder: "బాట్ పేరు నమోదు చేయండి"');

content = content.replace(/userNameLabel: "तुमचे नाव"/g, 'userNameLabel: "बॉटचे नाव"');
content = content.replace(/userNamePlaceholder: "तुमचे नाव प्रविष्ट करा"/g, 'userNamePlaceholder: "बॉटचे नाव प्रविष्ट करा"');

content = content.replace(/userNameLabel: "તમારું નામ"/g, 'userNameLabel: "બૉટનું નામ"');
content = content.replace(/userNamePlaceholder: "તમારું નામ દાખલ કરો"/g, 'userNamePlaceholder: "બૉટનું નામ દાખલ કરો"');

content = content.replace(/userNameLabel: "ನಿಮ್ಮ ಹೆಸರು"/g, 'userNameLabel: "ಬಾಟ್ ಹೆಸರು"');
content = content.replace(/userNamePlaceholder: "ನಿಮ್ಮ ಹೆಸರನ್ನು ನಮೂದಿಸಿ"/g, 'userNamePlaceholder: "ಬಾಟ್ ಹೆಸರನ್ನು ನಮೂದಿಸಿ"');

content = content.replace(/userNameLabel: "നിങ്ങളുടെ പേര്"/g, 'userNameLabel: "ബോട്ടിന്റെ പേര്"');
content = content.replace(/userNamePlaceholder: "നിങ്ങളുടെ പേര് നൽകുക"/g, 'userNamePlaceholder: "ബോട്ടിന്റെ പേര് നൽകുക"');

content = content.replace(/userNameLabel: "ଆପଣଙ୍କ ନାମ"/g, 'userNameLabel: "ବଟ୍ ନାମ"');
content = content.replace(/userNamePlaceholder: "ଆପଣଙ୍କ ନାମ ଦିଅନ୍ତୁ"/g, 'userNamePlaceholder: "ବଟ୍ ନାମ ଦିଅନ୍ତୁ"');

content = content.replace(/userNameLabel: "ਤੁਹਾਡਾ ਨਾਮ"/g, 'userNameLabel: "ਬੋਟ ਦਾ ਨਾਮ"');
content = content.replace(/userNamePlaceholder: "ਆਪਣਾ ਨਾਮ ਦਰਜ ਕਰੋ"/g, 'userNamePlaceholder: "ਬੋਟ ਦਾ ਨਾਮ ਦਰਜ ਕਰੋ"');

content = content.replace(/userNameLabel: "آپ کا نام"/g, 'userNameLabel: "بوٹ کا نام"');
content = content.replace(/userNamePlaceholder: "اپنا نام درج کریں"/g, 'userNamePlaceholder: "بوٹ کا نام درج کریں"');

content = content.replace(/userNameLabel: "আপোনাৰ নাম"/g, 'userNameLabel: "বটৰ নাম"');
content = content.replace(/userNamePlaceholder: "আপোনাৰ নাম লিখক"/g, 'userNamePlaceholder: "বটৰ নাম লিখক"');

content = content.replace(/userNameLabel: "तपाईंको नाम"/g, 'userNameLabel: "बोटको नाम"');
content = content.replace(/userNamePlaceholder: "आफ्नो नाम प्रविष्ट गर्नुहोस्"/g, 'userNamePlaceholder: "बोटको नाम प्रविष्ट गर्नुहोस्"');

content = content.replace(/userNameLabel: "अहाँक नाम"/g, 'userNameLabel: "बॉट के नाम"');
content = content.replace(/userNamePlaceholder: "अपन नाम दर्ज करू"/g, 'userNamePlaceholder: "बॉट के नाम दर्ज करू"');

content = content.replace(/userNameLabel: "توهان جو نالو"/g, 'userNameLabel: "بوٽ جو نالو"');
content = content.replace(/userNamePlaceholder: "پنهنجو نالو داخل ڪريو"/g, 'userNamePlaceholder: "بوٽ جو نالو داخل ڪريو"');

content = content.replace(/userNameLabel: "तुमचें नांव"/g, 'userNameLabel: "बॉटचें नांव"');
content = content.replace(/userNamePlaceholder: "तुमचें नांव बरोवचें"/g, 'userNamePlaceholder: "बॉटचें नांव बरोवचें"');

content = content.replace(/userNameLabel: "तुंदा नां"/g, 'userNameLabel: "बॉट दा नां"');
content = content.replace(/userNamePlaceholder: "अपना नां दर्ज करो"/g, 'userNamePlaceholder: "बॉट दा नां दर्ज करो"');

content = content.replace(/userNameLabel: "تُہُنٛد ناو"/g, 'userNameLabel: "بوٹُن ناو"');
content = content.replace(/userNamePlaceholder: "پَنُن ناو دَرٕج کٔرِو"/g, 'userNamePlaceholder: "بوٹُن ناو دَرٕج کٔرِو"');

content = content.replace(/userNameLabel: "भवतः नाम"/g, 'userNameLabel: "बॉट-नाम"');
content = content.replace(/userNamePlaceholder: "स्वनाम लिखतु"/g, 'userNamePlaceholder: "बॉट-नाम लिखतु"');

content = content.replace(/userNameLabel: "ᱟᱢᱟᱜ ᱧᱩᱛᱩᱢ"/g, 'userNameLabel: "ᱵᱚᱴ ᱟᱜ ᱧᱩᱛᱩᱢ"');
content = content.replace(/userNamePlaceholder: "ᱟᱢᱟᱜ ᱧᱩᱛᱩᱢ ᱚᱞ ᱢᱮ"/g, 'userNamePlaceholder: "ᱵᱚᱴ ᱟᱜ ᱧᱩᱛᱩᱢ ᱚᱞ ᱢᱮ"');

content = content.replace(/userNameLabel: "नोंथांनि मुं"/g, 'userNameLabel: "बटनि मुं"');
content = content.replace(/userNamePlaceholder: "नोंथांनि मुं लिर"/g, 'userNamePlaceholder: "बटनि मुं लिर"');

content = content.replace(/userNameLabel: "নহাক্কী মমিং"/g, 'userNameLabel: "বোটকী মমিং"');
content = content.replace(/userNamePlaceholder: "নহাক্কী মমিং ইবিয়ু"/g, 'userNamePlaceholder: "বোটকী মমিং ইবিয়ু"');

fs.writeFileSync('src/App.tsx', content);
console.log('Done replacement');
