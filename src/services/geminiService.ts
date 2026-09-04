import { GoogleGenAI } from "@google/genai";

const getApiKey = () => process.env.GEMINI_API_KEY;

export interface ChatResponse {
  text: string;
  sources?: { title: string; uri: string }[];
}

export async function chatWithGemini(message: string): Promise<ChatResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API Key Missing: Please add your GEMINI_API_KEY to the Secrets panel in the AI Studio settings to enable the AI brain.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const chat = ai.chats.create({
      model: "gemini-2.0-preview",
      config: {
        systemInstruction: "You are a highly intelligent AI assistant with a 'digital brain'. You have access to real-time information via Google Search. When answering, be precise, insightful, and cite your sources if you use search results.",
      
      },
    });

    const response = await chat.sendMessage({ message });
    
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map(chunk => chunk.web)
      .filter((web): web is { title: string; uri: string } => !!web?.uri);

    return {
      text: response.text || "I'm sorry, I couldn't process that request.",
      sources: sources && sources.length > 0 ? sources : undefined
    };
  } catch (error: any) {
    console.error("Chat Error:", error);
    
    // Fallback if search grounding fails
    if (error.message?.includes("grounding") || error.message?.includes("tool")) {
      try {
        const fallbackChat = ai.chats.create({
          model: "gemini-3-flash-preview",
          config: {
            systemInstruction: "You are a highly intelligent AI assistant. Answer the user's question precisely and insightfully.",
          },
        });
        const fallbackResponse = await fallbackChat.sendMessage({ message });
        return {
          text: fallbackResponse.text || "I'm sorry, I couldn't process that request.",
        };
      } catch (fallbackError) {
        console.error("Fallback Chat Error:", fallbackError);
        throw fallbackError;
      }
    }
    
    throw error;
  }
}

export async function generateImage(prompt: string) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API Key Missing: Please add your GEMINI_API_KEY to the Secrets panel in the AI Studio settings to enable image generation.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image was generated. Try a different prompt.");
  } catch (error) {
    console.error("Image Error:", error);
    throw error;
  }
}
