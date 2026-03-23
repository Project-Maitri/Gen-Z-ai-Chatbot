const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = [
  // Text colors
  { from: /text-white\/90/g, to: 'text-gray-800' },
  { from: /text-white\/80/g, to: 'text-gray-700' },
  { from: /text-white\/70/g, to: 'text-gray-600' },
  { from: /text-white\/60/g, to: 'text-gray-500' },
  { from: /text-white\/40/g, to: 'text-gray-400' },
  { from: /text-white/g, to: 'text-gray-900' },
  
  // Hover text colors
  { from: /hover:text-white/g, to: 'hover:text-gray-900' },
  
  // Backgrounds
  { from: /bg-white\/5/g, to: 'bg-white shadow-sm' },
  { from: /bg-white\/10/g, to: 'bg-white shadow-md' },
  { from: /bg-white\/20/g, to: 'bg-gray-100 shadow-md' },
  { from: /hover:bg-white\/10/g, to: 'hover:bg-gray-50' },
  { from: /hover:bg-white\/20/g, to: 'hover:bg-gray-100' },
  
  // Borders
  { from: /border-white\/10/g, to: 'border-gray-200' },
  { from: /border-white\/20/g, to: 'border-gray-300' },
  { from: /border-white\/30/g, to: 'border-gray-300' },
  { from: /border-white\/50/g, to: 'border-gray-400' },
  
  // Specific accents
  { from: /text-sky-300/g, to: 'text-sky-600' },
  { from: /text-sky-100/g, to: 'text-sky-800' },
  { from: /text-sky-200/g, to: 'text-sky-700' },
  { from: /text-sky-400/g, to: 'text-sky-600' },
  { from: /bg-sky-500\/20/g, to: 'bg-sky-100' },
  { from: /bg-sky-500\/30/g, to: 'bg-sky-200' },
  { from: /hover:bg-sky-500\/30/g, to: 'hover:bg-sky-200' },
  { from: /hover:bg-sky-500\/40/g, to: 'hover:bg-sky-300' },
  { from: /border-sky-500\/30/g, to: 'border-sky-300' },
  { from: /border-sky-500\/50/g, to: 'border-sky-400' },
  { from: /border-sky-300\/30/g, to: 'border-sky-300' },
  
  { from: /text-yellow-300/g, to: 'text-yellow-600' },
  { from: /drop-shadow-\[0_0_10px_rgba\(253,224,71,0\.8\)\]/g, to: 'drop-shadow-sm' },
  { from: /drop-shadow-\[0_0_5px_rgba\(253,224,71,0\.5\)\]/g, to: 'drop-shadow-sm' },
  { from: /drop-shadow-\[0_0_10px_rgba\(125,211,252,1\)\]/g, to: 'drop-shadow-sm' },
  
  { from: /text-emerald-300/g, to: 'text-emerald-600' },
  { from: /bg-emerald-500\/20/g, to: 'bg-emerald-100' },
  { from: /hover:bg-emerald-500\/30/g, to: 'hover:bg-emerald-200' },
  
  { from: /text-amber-300/g, to: 'text-amber-600' },
  { from: /bg-amber-500\/20/g, to: 'bg-amber-100' },
  { from: /hover:bg-amber-500\/30/g, to: 'hover:bg-amber-200' },

  { from: /text-blue-200/g, to: 'text-blue-700' },
  { from: /text-blue-300/g, to: 'text-blue-600' },
  
  { from: /text-red-400/g, to: 'text-red-600' },
  { from: /hover:text-red-300/g, to: 'hover:text-red-700' },
  { from: /bg-gray-900\/90/g, to: 'bg-white/90' },
  { from: /hover:bg-gray-800/g, to: 'hover:bg-gray-50' },
  { from: /border-red-500\/30/g, to: 'border-red-200' },
  
  { from: /bg-slate-800\/50/g, to: 'bg-white' },
  { from: /hover:bg-slate-700\/50/g, to: 'hover:bg-gray-50' },
  { from: /bg-slate-800/g, to: 'bg-white' },
  
  { from: /placeholder-white\/60/g, to: 'placeholder-gray-400' },
  { from: /placeholder-gray-900\/60/g, to: 'placeholder-gray-400' },
  
  { from: /prose-invert/g, to: '' },
  
  // Specific fixes for the chat input
  { from: /bg-black\/20/g, to: 'bg-white border-gray-300' },
  
  // Fixes for the main container
  { from: /bg-\[\#020617\]/g, to: 'bg-white' },
  { from: /bg-gray-50/g, to: 'bg-white' }, // Just in case
];

replacements.forEach(({from, to}) => {
  content = content.replace(from, to);
});

// Special fix for the VirtualNetworkBackground to make sure it stays milky white
content = content.replace(
  /bg-white\s*{\/\*\s*Base Tech Image\s*\*\//g, 
  'bg-[#fdfbf7] {/* Base Tech Image */'
);

fs.writeFileSync('src/App.tsx', content, 'utf8');
console.log('Replacements done.');
