import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API Route for MacroDroid
app.post("/api/macrodroid/message", async (req, res) => {
  try {
    const { message, sender } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    console.log(`Received message from ${sender || 'Unknown'}: ${message}`);

    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing");
      return res.status(500).type('text/plain').send("AI configuration missing");
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are Nard (नार्ड), an AI assistant for the E-Maitri portal. 
A user from a WhatsApp community sent this message: "${message}"
Please provide a helpful, concise response in the same language as the user's message. 
Keep it short enough for a WhatsApp message.`,
    });

    const replyText = response.text;
    console.log(`Sending reply: ${replyText}`);

    res.type('text/plain').send(replyText);

  } catch (error) {
    console.error("Error processing MacroDroid request:", error);
    res.status(500).type('text/plain').send("क्षमा करें, अभी मैं जवाब देने में असमर्थ हूँ।");
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Nard Backend is running" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
