export const runtime = 'edge';
import { getExamList } from "@/lib/db";
import ProfileClient from "@/components/ProfileClient";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const exams = await getExamList();
  return <ProfileClient exams={exams} />;
}
