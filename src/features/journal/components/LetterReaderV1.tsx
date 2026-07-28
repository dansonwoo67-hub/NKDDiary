"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Star } from "lucide-react";
import { withdrawLetterAction, markLetterReadAction, toggleStarAction } from "@/features/journal/letter-actions";
import { CommentSection } from "./CommentSection";

const fmt=new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});

type CommentItem = {
  id: string;
  entry_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  editable_until: string | null;
  withdrawn_at: string | null;
  profiles: { display_name: string | null; avatar_url: string | null } | { display_name: string | null; avatar_url: string | null }[] | null;
};

type Props={
  entry:{
    id:string;
    authorId:string;
    publishedAt:string;
    updatedAt:string;
    lockedAt:string;
    richHtml:string|null;
    plainText:string;
    stationeryTheme:string;
    moodEmoji:string|null;
    deletedAt:string|null;
    withdrawnAt:string|null;
    purgeAt:string|null;
    starAt:string|null;
  };
  isAuthor:boolean;
  authorName:string;
  userId:string;
  initialComments: CommentItem[];
  imageUrl:string|null;
};

export function LetterReaderV1({entry,isAuthor,authorName,userId,initialComments,imageUrl}:Props){
  const router=useRouter(); 
  const [message,setMessage]=useState(""); 
  const [pending,startTransition]=useTransition();
  const [isStarred,setIsStarred]=useState(!!entry.starAt);
  const [now, setNow] = useState(0);
  
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
  }, []);
  
  const isWithdrawn=Boolean(entry.withdrawnAt);
  const canManage=isAuthor&&!isWithdrawn&&now>0&&now<=Date.parse(entry.lockedAt);
  
  useEffect(()=>{ 
    if(!isAuthor&&!isWithdrawn){ 
      void markLetterReadAction(entry.id); 
    } 
  },[entry.id,isWithdrawn,isAuthor]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push("/journal");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  async function handleStar() {
    const res = await toggleStarAction(entry.id);
    if (res.ok) {
      setIsStarred(!isStarred);
    }
  }
  
  function withdraw() {
    startTransition(async()=>{
      const res=await withdrawLetterAction(entry.id);
      setMessage(res.message);
      if(res.ok){
        router.replace("/journal");
        router.refresh();
      }
    });
  }
  
  return (
    <div className="space-y-6">
      <article className={`stationery stationery-${entry.stationeryTheme} mx-auto max-w-4xl rounded-[2rem] border border-black/10 p-6 shadow-xl sm:p-10 relative overflow-hidden`}>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent" />
        
        <header className="relative flex flex-wrap items-start justify-between gap-4 border-b border-black/10 pb-5 z-10">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) {
                  router.back();
                } else {
                  router.push("/journal");
                }
              }}
              className="flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2 text-sm text-[var(--muted-ink)] hover:text-[var(--ink)] transition"
            >
              <ArrowLeft size={16} />
              返回信箱
            </button>
            <div>
              <p className="text-sm text-[var(--muted-ink)]">
                {isAuthor?"我写给对方":`${authorName} 写给我`}
                {isWithdrawn && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">已撤回</span>}
              </p>
              <time className="mt-1 block text-sm">{fmt.format(new Date(entry.publishedAt))}</time>
              {entry.moodEmoji && (
                <span className="mt-2 inline-block text-2xl">{entry.moodEmoji}</span>
              )}
              {entry.updatedAt!==entry.publishedAt?<span className="mt-1 block text-xs text-[var(--muted-ink)]">已更新</span>:null}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleStar}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                isStarred 
                  ? "bg-yellow-100 text-yellow-600" 
                  : "bg-white/70 text-[var(--muted-ink)] hover:text-yellow-600"
              }`}
              title={isStarred ? "取消星标" : "添加星标"}
            >
              <Star size={20} fill={isStarred ? "currentColor" : "none"} />
            </button>
            
            {canManage && (
              <span className="text-xs text-[var(--muted-ink)] bg-white/50 px-3 py-1.5 rounded-full">
                可管理至 {fmt.format(new Date(entry.lockedAt))}
              </span>
            )}
          </div>
        </header>

        <div className="relative z-10">
          {isWithdrawn && !isAuthor ? (
            <div className="mt-8 flex min-h-[260px] flex-col items-center justify-center rounded-2xl bg-white/60 p-8 text-center">
              <div className="mb-3 text-4xl">💌</div>
              <p className="text-lg font-medium text-[var(--muted-ink)]">这封信已被对方撤回</p>
              <p className="mt-2 text-sm text-[var(--muted-ink)]">对方在寄出后 24 小时内撤回了这封信。</p>
              {entry.withdrawnAt && (
                <p className="mt-4 text-xs text-[var(--muted-ink)]">
                  撤回时间：{fmt.format(new Date(entry.withdrawnAt))}
                </p>
              )}
            </div>
          ) : (
            <>
              {isWithdrawn && isAuthor && (
                <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                  ⚠️ 你已撤回这封信，收件方将无法查看。
                </div>
              )}
              {entry.richHtml?
                <div className="rich-letter-editor mt-8 min-h-[260px]" dangerouslySetInnerHTML={{__html:entry.richHtml}}/>:
                <div className="rich-letter-editor mt-8 min-h-[260px]"><p className="whitespace-pre-wrap">{entry.plainText}</p></div>
              }
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt="信件图片"
                  width={1600}
                  height={1200}
                  unoptimized
                  className="mt-6 h-auto max-h-[70vh] w-full rounded-2xl object-contain"
                />
              ) : null}
            </>
          )}
        </div>

        {canManage? (
          <div className="relative z-10 mt-8 flex flex-wrap gap-3">
            <button disabled={pending} onClick={withdraw} className="rounded-full border px-4 py-2 text-sm">撤回</button>
          </div>
        ) : null}

        {message?<p className="relative z-10 mt-4 text-sm text-[var(--muted-ink)]">{message}</p>:null}
      </article>

      {!isWithdrawn && (
        <div className="mx-auto max-w-4xl">
          <CommentSection
            entryId={entry.id}
            initialComments={initialComments}
            userId={userId}
          />
        </div>
      )}
    </div>
  );
}
