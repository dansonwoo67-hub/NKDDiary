import { JournalPageClient } from "@/features/journal/components/JournalPageClient";
import { listLetterBoxes } from "@/features/journal/letter-repository";
import { getDraftByAuthor } from "@/features/journal/draft-repository";
import { listActiveSpaceProfiles } from "@/features/profile/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUnreadNotificationState } from "@/features/notifications/actions";
import { getJournalAccountStateKey } from "@/features/journal/account-state-key";

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ box?: string }> }) {
  const [{ userId, spaceId, profile }, client, params] = await Promise.all([requireUser(), createServerSupabaseClient(), searchParams]);
  const profiles = await listActiveSpaceProfiles(client, spaceId);
  const partner = (profiles ?? []).find(p => String(p.id) !== userId);
  if (!partner) return <div className="cos-card p-8">还没有找到与你共享空间的伴侣。</div>;
  
  const [boxes, draft, unreadNotifications] = await Promise.all([
    listLetterBoxes(client, userId),
    getDraftByAuthor(client, userId),
    getUnreadNotificationState(),
  ]);
  
  // 使用当前用户设置的爱称，如果没有则使用对方正式昵称
  const partnerNickname = String(profile.partner_nickname ?? partner.display_name ?? "伴侣");
  const partnerId = String(partner.id);

  return <JournalPageClient 
    key={getJournalAccountStateKey(userId, unreadNotifications.unreadLetterSourceIds)}
    boxes={boxes} 
    partnerId={partnerId} 
    partnerName={partnerNickname}
    userId={userId}
    draft={draft}
    unreadLetterIds={unreadNotifications.unreadLetterSourceIds}
    defaultBox={params.box}
  />;
}
