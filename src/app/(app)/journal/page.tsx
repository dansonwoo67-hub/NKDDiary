import { JournalPageClient } from "@/features/journal/components/JournalPageClient";
import { listLetterThreads } from "@/features/journal/thread-repository";
import { getDraftByAuthor } from "@/features/journal/draft-repository";
import { listActiveSpaceProfiles } from "@/features/profile/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function JournalPage() {
  const [{ userId, spaceId, profile }, client] = await Promise.all([requireUser(), createServerSupabaseClient()]);
  const profiles = await listActiveSpaceProfiles(client, spaceId);
  const partner = (profiles ?? []).find(p => String(p.id) !== userId);
  if (!partner) return <div className="cos-card p-8">还没有找到与你共享空间的伴侣。</div>;
  
  const [threads, draft] = await Promise.all([
    listLetterThreads(client),
    getDraftByAuthor(client, userId),
  ]);
  
  // 使用当前用户设置的爱称，如果没有则使用对方正式昵称
  const partnerNickname = String(profile.partner_nickname ?? partner.display_name ?? "伴侣");
  const partnerId = String(partner.id);

  return <JournalPageClient 
    key={userId}
    threads={threads}
    partnerId={partnerId} 
    partnerName={partnerNickname}
    userId={userId}
    draft={draft}
  />;
}
