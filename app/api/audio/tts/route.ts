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

function buildWavHeader(pcmByteLength: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  const sampleRate = 24000;
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const fileSize = 36 + pcmByteLength;

  writeStr(0, "RIFF");
  view.setUint32(4, fileSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, pcmByteLength, true);

  return new Uint8Array(header);
}

const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const TTS_VOICE = "Aoede";

export async function POST(req: NextRequest) {
  const apiKey = getEnv("GEMINI_API_KEY");
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  let text: string;
  try {
    const body = await req.json() as { text?: unknown };
    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    text = body.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length > 5000) text = text.slice(0, 5000);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Check server-side DB cache first
  const textHash = await sha256hex(text);
  const cachedBase64 = await getTtsCacheEntry(textHash).catch(() => null);
  if (cachedBase64) {
    const binaryStr = atob(cachedBase64);
    const wavBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) wavBytes[i] = binaryStr.charCodeAt(i);
    return new NextResponse(wavBytes, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(wavBytes.byteLength),
        "Cache-Control": "private, max-age=86400",
      },
    });
  }

  const ai = new GoogleGenAI({ apiKey });

  let base64Audio: string;
  try {
    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: text,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: TTS_VOICE },
          },
        },
      },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      return NextResponse.json({ error: "No audio data in response" }, { status: 502 });
    }
    base64Audio = audioData;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Gemini TTS error: ${msg}` }, { status: 502 });
  }

  const binaryStr = atob(base64Audio);
  const pcmBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    pcmBytes[i] = binaryStr.charCodeAt(i);
  }

  const wavHeader = buildWavHeader(pcmBytes.byteLength);
  const wavBytes = new Uint8Array(wavHeader.byteLength + pcmBytes.byteLength);
  wavBytes.set(wavHeader, 0);
  wavBytes.set(pcmBytes, wavHeader.byteLength);

  // Store in DB cache (base64 of full WAV including header)
  const wavBase64 = btoa(String.fromCharCode(...wavBytes));
  setTtsCacheEntry(textHash, wavBase64, TTS_MODEL, TTS_VOICE).catch(() => {});

  return new NextResponse(wavBytes, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(wavBytes.byteLength),
      "Cache-Control": "private, max-age=86400",
    },
  });
}
