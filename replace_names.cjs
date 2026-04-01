const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace Gen-Z with Nard
content = content.replace(/Gen-Z/g, 'Nard');

// Replace जेन-जी with नॉर्ड
content = content.replace(/जेन-जी/g, 'नॉर्ड');

// Replace other scripts
content = content.replace(/জেন-জি/g, 'নর্ড'); // Bengali
content = content.replace(/ஜென்-ஜி/g, 'நார்ட்'); // Tamil
content = content.replace(/జెన్-జి/g, 'నార్డ్'); // Telugu
content = content.replace(/જેન-ઝી/g, 'નોર્ડ'); // Gujarati
content = content.replace(/ಜೆನ್-ಜಿ/g, 'ನಾರ್ಡ್'); // Kannada
content = content.replace(/ജെൻ-സി/g, 'നോർഡ്'); // Malayalam
content = content.replace(/ଜେନ୍-ଜି/g, 'ନର୍ଡ'); // Odia
content = content.replace(/ਜੇਨ-ਜ਼ੀ/g, 'ਨਾਰਡ'); // Punjabi
content = content.replace(/جین-جی/g, 'نارڈ'); // Urdu/Sindhi
content = content.replace(/جين-جي/g, 'نارڊ'); // Sindhi
content = content.replace(/ᱡᱮᱱ-ᱡᱤ/g, 'ᱱᱚᱨᱰ'); // Santali

// Update default voices
// Male: Fenrir -> Charon
// Female: Kore -> Zephyr
// Wait, I should only update the default voice assignments.
// Let's find the guessGender assignments.
content = content.replace(/gender === 'F' \? 'Kore' : 'Fenrir'/g, "gender === 'F' ? 'Zephyr' : 'Charon'");

fs.writeFileSync('src/App.tsx', content);
console.log('Replacements done.');
