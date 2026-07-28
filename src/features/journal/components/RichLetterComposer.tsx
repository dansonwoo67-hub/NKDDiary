"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { 
  Bold, Italic, Underline, Strikethrough, 
  AlignLeft, AlignCenter, AlignRight, 
  ListOrdered, List, Quote, Minus,
  Undo, Redo, Smile, Send, Save
} from "lucide-react";
import { sendAndClearDraft, saveDraftAction, deleteDraftAction } from "@/features/journal/draft-actions";

const THEMES = [
  ["cream","奶油素纸"],["rose","玫瑰花纹"],["moon","星月手帐"],
  ["vintage","复古邮笺"],["sakura","樱花手绘"],["lined","简约横线"],
] as const;

const MOODS = [
  { emoji: "😊", label: "开心" },
  { emoji: "💕", label: "被爱" },
  { emoji: "🥺", label: "难过" },
  { emoji: "😤", label: "生气" },
  { emoji: "😴", label: "疲惫" },
  { emoji: "🤔", label: "若有所思" },
  { emoji: "😌", label: "平静" },
  { emoji: "😭", label: "情绪化" },
] as const;

const KAOMOJI = ["(｡･ω･｡)ﾉ♡","(づ｡◕‿‿◕｡)づ","(╥﹏╥)","(๑•̀ㅂ•́)و✧","♡(˃͈ દ ˂͈ ༶ )","(◍•ᴗ•◍)","(≧▽≦)","(°◕‿◕°)"];
const EMOJI = ["❤️","🥺","🫶","🌙","✨","🌷","🕊️","💌","🌸","🍀","🎈","🎀","💝","🌟","💫","🌈"];

const LOCAL_STORAGE_KEY_PREFIX = "nkddiary_letter_draft";

type EditorMode = "new" | "draft" | "edit";

export function RichLetterComposer({ 
  recipientId, 
  recipientName, 
  entryId, 
  initialHtml="", 
  initialText="", 
  initialTheme="cream",
  initialMood="",
  initialDraftId=null,
  onClose,
  authorId,
  onSent,
  onDraftSaved,
}: { 
  recipientId:string; 
  recipientName:string; 
  entryId?:string; 
  initialHtml?:string; 
  initialText?:string; 
  initialTheme?:string;
  initialMood?:string;
  initialDraftId?:string|null;
  onClose?:()=>void;
  authorId?:string;
  onSent?:()=>void;
  onDraftSaved?:()=>void;
}) {
  const router = useRouter();
  const editor=useRef<HTMLDivElement>(null);
  const [theme,setTheme]=useState(initialTheme); 
  const [mood,setMood]=useState(initialMood);
  const [count,setCount]=useState(Array.from(initialText).length);
  const [message,setMessage]=useState(""); 
  const [confirming,setConfirming]=useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [sending,setSending]=useState(false); 
  const [saving,setSaving]=useState(false);
  const [lastSaved,setLastSaved]=useState<string|null>(null);
  const currentDraftIdRef = useRef<string | null>(initialDraftId ?? null);
  const debounceRef=useRef<number|null>(null);
  const initializedRef=useRef(false);
  const composingRef=useRef(false);
  const hasUnsavedChangesRef=useRef(false);

  const mode: EditorMode = entryId ? "edit" : (initialText && initialText.trim().length > 0 ? "draft" : "new");

  useEffect(() => {
    if (editor.current && !initializedRef.current) {
      initializedRef.current = true;
      if (initialHtml) {
        // 有草稿/编辑内容，直接恢复
        editor.current.innerHTML = initialHtml;
        setCount(Array.from(editor.current.innerText.trim()).length);
      } else {
        // 新信，插入爱称作为初始可编辑内容
        const salutation = `亲爱的${recipientName}：`;
        editor.current.innerHTML = `<p>${salutation}</p>`;
        setCount(salutation.length);
      }
    }
  }, [initialHtml, recipientName]);

  const saveToLocalStorage = useCallback(() => {
    if (!editor.current || count === 0) return;
    if (mode === "edit") return;
    try {
      const text = editor.current.innerText.trim();
      const draft = {
        authorId,
        recipientId,
        html: editor.current.innerHTML,
        text,
        plainText: text,
        stationeryTheme: theme,
        moodEmoji: mood || null,
        draftId: currentDraftIdRef.current,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}_${authorId}`, JSON.stringify(draft));
    } catch (error) {
      console.error("Failed to save draft to localStorage:", error);
    }
  }, [editor, count, theme, mood, recipientId, authorId, mode]);

  const clearLocalStorage = useCallback(() => {
    try {
      if (authorId) {
        localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_${authorId}`);
      }
      localStorage.removeItem(LOCAL_STORAGE_KEY_PREFIX);
    } catch (error) {
      console.error("Failed to clear localStorage:", error);
    }
  }, [authorId]);

  const autoSave = useCallback(async () => {
    if (!editor.current || count === 0) return;
    if (mode === "edit") {
      hasUnsavedChangesRef.current = true;
      setLastSaved(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
      return;
    }
    
    const html = editor.current.innerHTML;
    const text = editor.current.innerText.trim();
    
    if (!text) return;

    setSaving(true);

    try {
      saveToLocalStorage();
      
      const result = await saveDraftAction({
        recipientId,
        html,
        text,
        stationeryTheme: theme,
        moodEmoji: mood || undefined,
      });
      
      if (result.ok) {
        setLastSaved(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
        hasUnsavedChangesRef.current = false;
        if (result.draftId) {
          currentDraftIdRef.current = result.draftId;
        }
      } else {
        console.warn("Auto-save to database failed, keeping localStorage fallback");
      }
    } catch (error) {
      console.error("Auto-save failed:", error);
    } finally {
      setSaving(false);
    }
  }, [editor, count, theme, mood, recipientId, saveToLocalStorage, mode]);

  const triggerAutoSave = useCallback(() => {
    if (mode === "edit") {
      hasUnsavedChangesRef.current = true;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(autoSave, 1000);
  }, [autoSave, mode]);

  function command(name:string,value?:string){ 
    editor.current?.focus(); 
    document.execCommand(name,false,value); 
    sync(); 
    triggerAutoSave();
  }
  
  function sync(){ 
    const text = editor.current?.innerText.trim() ?? "";
    setCount(Array.from(text).length); 
  }
  
  function insert(text:string){ 
    editor.current?.focus();
    document.execCommand("insertText", false, text);
    sync();
    triggerAutoSave();
  }

  function insertHr(){
    editor.current?.focus();
    document.execCommand("insertHTML", false, "<hr/>");
    sync();
    triggerAutoSave();
  }

  const handleSaveDraftAndClose = useCallback(async () => {
    setCloseConfirm(false);
    if (count > 0 && mode !== "edit") {
      setSaving(true);
      try {
        const html = editor.current?.innerHTML ?? "";
        const text = editor.current?.innerText.trim() ?? "";
        if (text) {
          const result = await saveDraftAction({
            recipientId,
            html,
            text,
            stationeryTheme: theme,
            moodEmoji: mood || undefined,
          });
          
          if (result.ok) {
            saveToLocalStorage();
            // Track the draft ID returned by the server
            if (result.draftId) {
              currentDraftIdRef.current = result.draftId;
            }
            // Notify parent and refresh server data
            if (onDraftSaved) onDraftSaved();
            router.refresh();
          } else {
            // Save failed - show gentle error, don't close
            setMessage(result.message || "刚刚没有保存好，内容还在这里，再试一次就好啦。");
            setSaving(false);
            return;
          }
        }
      } catch (error) {
        console.error("Save draft failed:", error);
        setMessage("刚刚没有保存好，内容还在这里，再试一次就好啦。");
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    if (onClose) onClose();
  }, [count, mode, editor, recipientId, theme, mood, saveToLocalStorage, onClose, onDraftSaved, router]);

  const handleDiscardAndClose = useCallback(async () => {
    setCloseConfirm(false);
    if (mode !== "edit") {
      try {
        await deleteDraftAction();
      } catch (e) {
        console.error("Delete draft failed:", e);
      }
    }
    clearLocalStorage();
    if (onClose) onClose();
  }, [mode, clearLocalStorage, onClose]);

  async function send(){
    const text=editor.current?.innerText.trim() ?? "";
    if(!text || Array.from(text).length>5000){
      setMessage("这封信需要有内容，最多 5000 字。");
      return;
    }
    setConfirming(false); 
    setSending(true);

    try {
      const html = editor.current?.innerHTML ?? "";
      const res = await sendAndClearDraft({
        html,
        text,
        stationeryTheme: theme,
        moodEmoji: mood || undefined,
        recipientId,
      });
      
      setMessage(res.message); 
      if(res.ok){
        clearLocalStorage();
        if(editor.current) editor.current.innerHTML=""; 
        setCount(0);
        setMood("");
        setLastSaved(null);
        currentDraftIdRef.current = null;
        hasUnsavedChangesRef.current = false;

        if (onSent) onSent();
        if (onClose) onClose();
      }
      setSending(false);
    } catch (error) {
      console.error("Send letter failed:", error);
      setMessage("寄信失败，请稍后再试。");
      setSending(false);
    }
  }

  return (
    <section className="relative flex flex-col h-full">
      
      {/* 1. 标题区 */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-black/5 flex-shrink-0">
        <div>
          <p className="text-xs tracking-[.22em] text-[var(--rose)]">WRITE A LETTER</p>
          <h2 className="font-serif text-xl font-semibold">
            {mode === "edit" ? "修改这封信" : `写给 ${recipientName}`}
          </h2>
        </div>
      </div>

      {/* 2. 信纸主题区 - 独立一行 */}
      <div className="flex items-center gap-2 px-6 py-4 flex-shrink-0">
        <span className="text-xs font-medium text-[var(--muted-ink)]">信纸样式</span>
        <div className="flex flex-wrap gap-2 ml-2">
          {THEMES.map(([id,label])=>(
            <button 
              key={id} 
              type="button" 
              onClick={()=>{setTheme(id); triggerAutoSave();}} 
              className={`rounded-full px-4 py-1.5 text-sm transition ${theme===id?"bg-[var(--ink)] text-white":"bg-white/70 hover:bg-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. 富文本工具栏 - 独立一行，分组 */}
      <div className="flex flex-wrap items-center gap-0 bg-white/45 px-6 py-3 border-y border-black/5 flex-shrink-0">
        {/* 字体 / 字号 */}
        <div className="flex items-center gap-2 mr-4">
          <select aria-label="字体" onChange={e=>command("fontName",e.target.value)} className="flex-shrink-0 rounded-lg bg-white px-3 py-1.5 text-sm">
            <option>默认正文</option>
            <option value="SimSun">宋体</option>
            <option value="SimHei">黑体</option>
            <option value="KaiTi">楷体</option>
            <option value="FangSong">仿宋</option>
            <option value="Georgia">Georgia</option>
            <option value="Times New Roman">Times New Roman</option>
          </select>
          <select aria-label="字号" onChange={e=>command("fontSize",e.target.value)} className="flex-shrink-0 rounded-lg bg-white px-3 py-1.5 text-sm">
            <option value="2">小</option>
            <option value="3">正常</option>
            <option value="4">中</option>
            <option value="5">大</option>
            <option value="6">特大</option>
          </select>
        </div>

        <div className="w-px h-6 bg-black/10 mr-4" />
        
        {/* 加粗 / 斜体 / 下划线 / 删除线 */}
        <div className="flex items-center gap-1 mr-4">
          <button type="button" onClick={()=>command("bold")} className="rounded-lg p-2 hover:bg-white" title="加粗">
            <Bold size={16}/>
          </button>
          <button type="button" onClick={()=>command("italic")} className="rounded-lg p-2 hover:bg-white" title="斜体">
            <Italic size={16}/>
          </button>
          <button type="button" onClick={()=>command("underline")} className="rounded-lg p-2 hover:bg-white" title="下划线">
            <Underline size={16}/>
          </button>
          <button type="button" onClick={()=>command("strikeThrough")} className="rounded-lg p-2 hover:bg-white" title="删除线">
            <Strikethrough size={16}/>
          </button>
        </div>

        <div className="w-px h-6 bg-black/10 mr-4" />
        
        {/* 对齐 / 列表 / 引用 */}
        <div className="flex items-center gap-1 mr-4">
          <button type="button" onClick={()=>command("justifyLeft")} className="rounded-lg p-2 hover:bg-white" title="左对齐">
            <AlignLeft size={16}/>
          </button>
          <button type="button" onClick={()=>command("justifyCenter")} className="rounded-lg p-2 hover:bg-white" title="居中">
            <AlignCenter size={16}/>
          </button>
          <button type="button" onClick={()=>command("justifyRight")} className="rounded-lg p-2 hover:bg-white" title="右对齐">
            <AlignRight size={16}/>
          </button>
          <button type="button" onClick={()=>command("insertOrderedList")} className="rounded-lg p-2 hover:bg-white" title="有序列表">
            <ListOrdered size={16}/>
          </button>
          <button type="button" onClick={()=>command("insertUnorderedList")} className="rounded-lg p-2 hover:bg-white" title="无序列表">
            <List size={16}/>
          </button>
          <button type="button" onClick={()=>command("formatBlock","blockquote")} className="rounded-lg p-2 hover:bg-white" title="引用">
            <Quote size={16}/>
          </button>
          <button type="button" onClick={insertHr} className="rounded-lg p-2 hover:bg-white" title="分隔线">
            <Minus size={16}/>
          </button>
        </div>

        <div className="w-px h-6 bg-black/10 mr-4" />
        
        {/* 颜色 / 表情 / 撤销重做 */}
        <div className="flex items-center gap-1">
          <input 
            aria-label="文字颜色" 
            type="color" 
            onChange={e=>command("foreColor",e.target.value)} 
            className="h-8 w-8 rounded cursor-pointer" 
          />
          <EmojiPicker onInsert={insert} />
          <button type="button" onClick={()=>command("undo")} className="rounded-lg p-2 hover:bg-white" title="撤销">
            <Undo size={16}/>
          </button>
          <button type="button" onClick={()=>command("redo")} className="rounded-lg p-2 hover:bg-white" title="重做">
            <Redo size={16}/>
          </button>
        </div>
      </div>

      {/* 4. 心情 + 正文主体 */}
      <div 
        className={`stationery stationery-${theme} relative flex-1 min-h-0 overflow-y-auto`}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            editor.current?.focus();
          }
        }}
      >
        {/* 心情区 - 压缩 */}
        <div className="px-8 py-4">
          <p className="text-xs font-semibold text-[var(--muted-ink)] mb-2">此刻心情</p>
          <div className="flex flex-wrap gap-2">
            {MOODS.map(({emoji,label})=>(
              <button
                key={emoji}
                type="button"
                onClick={()=>{setMood(mood===emoji?"":emoji); triggerAutoSave();}}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition ${
                  mood===emoji
                    ? "bg-[var(--rose)] text-white"
                    : "bg-white/60 hover:bg-white/90"
                }`}
              >
                <span className="text-lg">{emoji}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 正文区 */}
        <div className="px-8 pb-8 pt-0">
          <div 
            ref={editor} 
            contentEditable={true}
            suppressContentEditableWarning={true}
            role="textbox"
            aria-multiline="true"
            onInput={() => { 
              if (!composingRef.current) {
                sync(); 
                triggerAutoSave(); 
              }
            }} 
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { 
              composingRef.current = false; 
              sync(); 
              triggerAutoSave(); 
            }}
            data-placeholder={`亲爱的${recipientName}：`} 
            className="rich-letter-editor min-h-[200px] sm:min-h-[360px] outline-none w-full p-8" 
          />
        </div>
      </div>

      {/* 5. 底部操作栏 */}
      <div className="flex items-center justify-between gap-4 border-t border-black/5 px-6 py-4 flex-shrink-0 bg-white">
        <div className="flex items-center gap-4">
          <span className={`text-sm ${count>5000?"text-red-600":"text-[var(--muted-ink)]"}`}>
            {count} / 5000
          </span>
          {saving && <span className="text-sm text-[var(--muted-ink)]">保存中...</span>}
          {lastSaved && !saving && <span className="text-sm text-[var(--muted-ink)]">已保存 {lastSaved}</span>}
        </div>
        <div className="flex items-center gap-3">
          {mode !== "edit" && (
            <button 
              type="button"
              onClick={handleSaveDraftAndClose}
              className="flex items-center gap-2 h-[44px] rounded-full bg-white border border-black/10 px-6 text-sm text-[var(--muted-ink)] hover:text-[var(--ink)] hover:border-[var(--ink)] transition"
            >
              <Save size={16} />
              暂存离开
            </button>
          )}
          <button 
            type="button" 
            disabled={sending||count<1||count>5000} 
            onClick={()=>setConfirming(true)} 
            className="flex items-center gap-2 h-[44px] rounded-full bg-[var(--ink)] px-8 text-sm text-white hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={16}/>
            {mode === "edit" ? "保存修改" : "完成写信"}
          </button>
        </div>
      </div>

      {message?<p className="px-6 pb-4 text-sm text-[var(--muted-ink)] flex-shrink-0">{message}</p>:null}

      {confirming&&(
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/25 p-4">
          <div className="w-full max-w-sm rounded-[2rem] bg-[var(--paper)] p-6 text-center shadow-2xl">
            <p className="font-serif text-xl font-semibold">
              {mode === "edit" ? "确认保存修改？" : "确认寄出这封信？"}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button type="button" onClick={()=>setConfirming(false)} className="rounded-full bg-white px-6 py-2">再想一想</button>
              <button type="button" onClick={send} className="rounded-full bg-[var(--ink)] px-6 py-2 text-white">寄出这封信</button>
            </div>
          </div>
        </div>
      )}

      {closeConfirm && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/25 p-4">
          <div className="w-full max-w-sm rounded-[2rem] bg-[var(--paper)] p-6 text-center shadow-2xl">
            <p className="font-serif text-xl font-semibold">
              {mode === "edit" ? "修改还没有保存哦。" : "这封信还没有写完呢。"}
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              {mode !== "edit" ? (
                <>
                  <button 
                    type="button" 
                    onClick={handleSaveDraftAndClose} 
                    className="w-full rounded-full bg-[var(--ink)] px-6 py-2 text-white"
                  >
                    暂存离开
                  </button>
                  <button 
                    type="button" 
                    onClick={handleDiscardAndClose} 
                    className="w-full rounded-full bg-white px-6 py-2 text-red-600"
                  >
                    放弃这封信
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setCloseConfirm(false)} 
                    className="w-full rounded-full bg-transparent px-6 py-2 text-[var(--muted-ink)]"
                  >
                    继续写
                  </button>
                </>
              ) : (
                <>
                  <button 
                    type="button" 
                    onClick={() => setCloseConfirm(false)} 
                    className="w-full rounded-full bg-[var(--ink)] px-6 py-2 text-white"
                  >
                    继续编辑
                  </button>
                  <button 
                    type="button" 
                    onClick={handleDiscardAndClose} 
                    className="w-full rounded-full bg-white px-6 py-2 text-red-600"
                  >
                    放弃修改
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function EmojiPicker({ onInsert }: { onInsert: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleInsert = (text: string) => {
    onInsert(text);
    setOpen(false);
  };

  return (
    <div className="relative" ref={pickerRef}>
      <button 
        type="button" 
        onClick={() => setOpen(!open)} 
        className="rounded-lg p-1.5 hover:bg-white"
        title="表情"
      >
        <Smile size={16}/>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 max-h-60 overflow-y-auto rounded-2xl bg-white p-3 shadow-xl">
          <div className="flex flex-wrap gap-2">
            {[...EMOJI,...KAOMOJI].map(x=>(
              <button 
                type="button" 
                key={x} 
                onClick={()=>handleInsert(x)} 
                className="rounded-lg px-2 py-1 text-lg hover:bg-rose-50 transition flex-shrink-0"
              >
                {x}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
