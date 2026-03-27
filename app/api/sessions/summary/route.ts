export const runtime = 'edge';
import { NextResponse } from "next/server";
import { getDailyProgress } from "@/lib/db";
import { getUserEmail } from "@/lib/user";


function computeStreak(activeDays: string[]): number {
  if (activeDays.length === 0) return 0;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Streak requires activity today or yesterday
  if (activeDays[0] !== today && activeDays[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < activeDays.length; i++) {
    const prevDate = new Date(activeDays[i - 1]);
    const currDate = new Date(activeDays[i]);
    const diffDays = Math.round((prevDate.getTime() - currDate.getTime()) / 86400000);
    if (diffDays === 1) streak++;
    else break;
  }
  return streak;
}

export async function GET() {
  const userEmail = await getUserEmail();
  const { todayCount, activeDays } = await getDailyProgress(userEmail);
  const streak = computeStreak(activeDays);
  return NextResponse.json({ todayCount, streak });
}
