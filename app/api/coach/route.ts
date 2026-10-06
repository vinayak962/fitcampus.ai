import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CoachPayload = {
  message?: string;
  profile?: { sport?: string; level?: string; goal?: string; time?: number; equipment?: string };
};

const safetyContext = `You are FitCoach AI, a supportive student fitness coach. Give concise, practical and non-medical fitness guidance. Respect the user's sport, fitness level, time and equipment. Do not diagnose, prescribe treatment, promise results, or push someone through pain. If they mention chest pain, fainting, severe dizziness, difficulty breathing unrelated to normal exertion, serious injury, or significant pain, tell them to stop activity and seek appropriate medical care. Keep recommendations beginner-appropriate when relevant.`;

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "FitCoach is not configured." }, { status: 503 });

  try {
    const { message, profile }: CoachPayload = await request.json();
    if (!message?.trim() || message.length > 1000) {
      return NextResponse.json({ error: "Please send a message under 1,000 characters." }, { status: 400 });
    }

    const profileText = `Student profile: sport=${profile?.sport ?? "general fitness"}; level=${profile?.level ?? "beginner"}; goal=${profile?.goal ?? "general fitness"}; available time=${profile?.time ?? 20} minutes; equipment=${profile?.equipment ?? "no equipment"}.`;
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: safetyContext }] },
        contents: [{ role: "user", parts: [{ text: `${profileText}\n\nStudent: ${message}` }] }],
        generationConfig: {
          // FitCoach responses are brief, practical prompts; minimal thinking keeps
          // latency low and preserves the response budget for the student-facing answer.
          thinkingConfig: { thinkingLevel: "minimal" },
          maxOutputTokens: 512,
          temperature: 0.6,
        },
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      console.error("Google AI request failed:", response.status);
      return NextResponse.json({ error: "FitCoach is temporarily unavailable. Your saved workouts are still available." }, { status: 502 });
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.filter((part: { text?: string; thought?: boolean }) => !part.thought)
      .map((part: { text?: string }) => part.text ?? "")
      .join("")
      .trim();
    if (!text) return NextResponse.json({ error: "FitCoach did not return a response. Please try again." }, { status: 502 });
    return NextResponse.json({ text });
  } catch (error) {
    console.error("FitCoach route error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "FitCoach is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
}
