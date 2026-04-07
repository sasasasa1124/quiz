export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getEnv } from "@/lib/env";
import { getTtsCacheEntry, setTtsCacheEntry } from "@/lib/db";

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";
const GEMINI_TTS_VOICE = "Aoede";
const POLLY_VOICE_ID = "Ruth"; // English default; can be overridden

async function synthesizeWithPolly(text: string, voiceId: string = POLLY_VOICE_ID): Promise<Uint8Array> {
  // Lazy load Polly SDK (only on AWS)
  const polly = await import("@aws-sdk/client-polly");
  const { PollyClient, SynthesizeSpeechCommand, OutputFormat, Engine } = polly;

  const client = new PollyClient({ region: process.env.AWS_REGION || "us-west-2" });

  try {
    const command = new SynthesizeSpeechCommand({
      Text: text,
      OutputFormat: OutputFormat.MP3,
      VoiceId: voiceId as any, // Use any to avoid strict type checking with dynamic imports
      Engine: Engine.GENERATIVE, // Use generative engine for higher quality
    });

    const response = await client.send(command);
    const audioStream = response.AudioStream;

    if (!audioStream) {
      throw new Error("No audio stream in Polly response");
    }

    // Convert stream to buffer
    const chunks: Buffer[] = [];

    // Handle both Node.js stream and Web stream
    if (audioStream && typeof audioStream === "object") {
      // If it's a Node.js stream
      if ("on" in audioStream && typeof audioStream.on === "function") {
        return new Promise((resolve, reject) => {
          audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
          audioStream.on("end", () => {
            resolve(new Uint8Array(Buffer.concat(chunks)));
          });
          audioStream.on("error", reject);
        });
      }

      // If it's a Blob-like object
      if ("arrayBuffer" in audioStream && typeof audioStream.arrayBuffer === "function") {
        const buffer = await (audioStream as Blob).arrayBuffer();
        return new Uint8Array(buffer);
      }
    }

    throw new Error("Unable to read audio stream from Polly response");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Polly TTS error: ${msg}`);
  }
}

async function synthesizeWithGemini(text: string): Promise<Uint8Array> {
  const apiKey = getEnv("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TTS_MODEL,
      contents: text,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE },
          },
        },
      },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData || audioData.length < 1000) {
      throw new Error("No audio data in response");
    }

    const binaryStr = atob(audioData);
    const wavBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      wavBytes[i] = binaryStr.charCodeAt(i);
    }
    return wavBytes;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Gemini TTS error: ${msg}`);
  }
}

export async function POST(req: NextRequest) {
  let text: string;
  let voiceId: string | undefined;

  try {
    const body = await req.json() as { text?: unknown; voiceId?: unknown };
    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    text = body.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length > 5000) text = text.slice(0, 5000);
    if (typeof body.voiceId === "string") voiceId = body.voiceId;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Check server-side DB cache first
  const textHash = await sha256hex(text);
  const cachedBase64 = await getTtsCacheEntry(textHash).catch(() => null);
  if (cachedBase64) {
    const binaryStr = atob(cachedBase64);
    const audioBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) audioBytes[i] = binaryStr.charCodeAt(i);
    return new NextResponse(Buffer.from(audioBytes), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBytes.byteLength),
        "Cache-Control": "private, max-age=86400",
      },
    });
  }

  let audioBytes: Uint8Array;
  let modelInfo: string;
  let voiceInfo: string;

  try {
    if (process.env.DEPLOY_TARGET === "aws") {
      audioBytes = await synthesizeWithPolly(text, voiceId || POLLY_VOICE_ID);
      modelInfo = "polly";
      voiceInfo = voiceId || POLLY_VOICE_ID;
    } else {
      audioBytes = await synthesizeWithGemini(text);
      modelInfo = GEMINI_TTS_MODEL;
      voiceInfo = GEMINI_TTS_VOICE;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Store in DB cache (base64 of audio)
  const audioBase64 = btoa(String.fromCharCode(...audioBytes));
  setTtsCacheEntry(textHash, audioBase64, modelInfo, voiceInfo).catch(() => {});

  return new NextResponse(Buffer.from(audioBytes), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audioBytes.byteLength),
      "Cache-Control": "private, max-age=86400",
    },
  });
}
