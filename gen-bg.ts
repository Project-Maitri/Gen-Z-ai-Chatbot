import { GoogleGenAI } from "@google/genai";
import fs from "fs";

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API key");
    process.exit(1);
  }
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: {
        parts: [
          {
            text: "A high-tech futuristic digital network background representing social connectivity and digital finance growth. Floating glowing neon text in the scene displaying the exact words: 'E-MAITRI', 'Gen-Z', 'Maitri Chaupal', 'Lok Mitra', 'Earning', 'Part Time', 'Self Employed'. Dark background with vibrant blue, green, and gold glowing nodes, data streams, and financial charts. 16:9 aspect ratio.",
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "1K"
        }
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64Data = part.inlineData.data;
        fs.writeFileSync('./public/custom-bg.png', Buffer.from(base64Data, 'base64'));
        console.log('Image saved to public/custom-bg.png');
      }
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
