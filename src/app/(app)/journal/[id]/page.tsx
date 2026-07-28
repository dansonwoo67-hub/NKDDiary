import { notFound } from "next/navigation";
import { getJournalEntry } from "@/features/journal/repository";
import { LegacyEntryNotice } from "@/features/journal/components/LegacyEntryNotice";
import { LetterReaderV1 } from "@/features/journal/components/LetterReaderV1";
import { WithdrawnLetterNotice } from "@/features/journal/components/WithdrawnLetterNotice";
import { getReadableImageUrl } from "@/features/media/actions";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CommentProfile = { display_name: string | null; avatar_url: string | null };
type InitialComment = {
  id: string;
  entry_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  editable_until: string | null;
  withdrawn_at: string | null;
  profiles: CommentProfile | CommentProfile[] | null;
};

export default async function JournalEntryPage({params}:{params:Promise<{id:string}>}){
 const [{id},currentUser,client]=await Promise.all([params,requireUser(),createServerSupabaseClient()]);
 const entry=await getJournalEntry(client,id);
 if (!entry) {
   const { data, error } = await client.rpc("get_letter_withdrawal_status", {
     p_entry_id: id,
   });
   const withdrawn = !error && Array.isArray(data) && data.length > 0;
   if (withdrawn) return <WithdrawnLetterNotice />;
   notFound();
 }
 if (entry.withdrawnAt) return <WithdrawnLetterNotice />;
 if (entry.entryType==="today"&&entry.recipientId===null) return <LegacyEntryNotice />;
 if (entry.recipientId===null) notFound();
 const isAuthor=entry.authorId===currentUser.userId;
 const imageUrl=entry.imagePath ? await getReadableImageUrl(entry.id) : null;

 const initialComments: InitialComment[] = [];
 if (!entry.withdrawnAt) {
   try {
     const { data: commentsData } = await client
       .from("journal_comments")
       .select(`
         id,
         entry_id,
         author_id,
         parent_id,
         body,
         created_at,
         updated_at,
         editable_until,
         withdrawn_at,
         profiles:author_id (display_name, avatar_url)
       `)
       .eq("entry_id", id)
       .is("deleted_at", null)
       .order("created_at", { ascending: true });
     if (commentsData) {
       for (const c of commentsData) {
         initialComments.push(c as unknown as InitialComment);
       }
     }
   } catch (e) {
     console.warn("Failed to load comments:", e);
   }
 }

 return <LetterReaderV1 
   entry={entry} 
   isAuthor={isAuthor} 
   authorName={isAuthor?currentUser.profile.display_name:"对方"} 
   userId={currentUser.userId}
   initialComments={initialComments}
   imageUrl={imageUrl}
 />;
}
