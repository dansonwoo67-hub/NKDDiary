import { notFound, redirect } from "next/navigation";
import { RichLetterComposer } from "@/features/journal/components/RichLetterComposer";
import { getJournalEntry } from "@/features/journal/repository";
import { listActiveSpaceProfiles } from "@/features/profile/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function EditLetterPage({params}:{params:Promise<{id:string}>}){
 const [{id},current,client]=await Promise.all([params,requireUser(),createServerSupabaseClient()]);
 const entry=await getJournalEntry(client,id); if(!entry) notFound();
 // eslint-disable-next-line react-hooks/purity
if(entry.authorId!==current.userId || entry.deletedAt || entry.withdrawnAt || Date.now()>Date.parse(entry.lockedAt)) redirect(`/journal/${id}`);
 const profiles=await listActiveSpaceProfiles(client,current.spaceId);
 const partner=(profiles??[]).find(p=>String(p.id)!==current.userId);
 if(!partner) notFound();
 return <div className="grid gap-6"><header><p className="text-sm tracking-[.22em] text-[var(--rose)]">EDIT LETTER</p><h1 className="mt-2 font-serif text-3xl font-semibold">修改这封信</h1><p className="mt-2 text-sm text-[var(--muted-ink)]">可编辑至 {new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",dateStyle:"medium",timeStyle:"short"}).format(new Date(entry.lockedAt))}</p></header><RichLetterComposer recipientId={entry.recipientId ?? String(partner.id)} recipientName={String(partner.display_name)} entryId={entry.id} initialHtml={entry.richHtml ?? entry.plainText} initialText={entry.plainText} initialTheme={entry.stationeryTheme} authorId={current.userId}/></div>;
}
