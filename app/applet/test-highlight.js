function highlightMarkdown(text, cleanIndex) {
  const cleanText = text.replace(/[*_#`]/g, '');
  if (cleanIndex >= cleanText.length) return text;

  // Find the end of the current word in cleanText
  const cleanWordMatch = cleanText.substring(cleanIndex).match(/^\S+/);
  const cleanWordLength = cleanWordMatch ? cleanWordMatch[0].length : 0;
  if (cleanWordLength === 0) return text;
  
  const cleanEndIndex = cleanIndex + cleanWordLength;

  let cIndex = 0;
  let originalStartIndex = -1;
  let originalEndIndex = -1;

  for (let i = 0; i <= text.length; i++) {
    if (cIndex === cleanIndex && originalStartIndex === -1) {
      originalStartIndex = i;
    }
    if (cIndex === cleanEndIndex && originalEndIndex === -1) {
      originalEndIndex = i;
      break;
    }
    if (i < text.length && !/[*_#`]/.test(text[i])) {
      cIndex++;
    }
  }

  if (originalStartIndex !== -1 && originalEndIndex !== -1) {
    return (
      text.substring(0, originalStartIndex) +
      '<mark id="current-spoken-word" class="bg-yellow-400 text-black rounded px-1">' +
      text.substring(originalStartIndex, originalEndIndex) +
      '</mark>' +
      text.substring(originalEndIndex)
    );
  }

  return text;
}

console.log(highlightMarkdown("This is **bold** text.", 0));
console.log(highlightMarkdown("This is **bold** text.", 5));
console.log(highlightMarkdown("This is **bold** text.", 8));
console.log(highlightMarkdown("This is **bold** text.", 13));
