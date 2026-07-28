"use client";

import { useRef, useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { 
  Bold, Italic, Underline, Strikethrough, 
  AlignLeft, AlignCenter, AlignRight, 
  ListOrdered, List, Quote, Minus,
  Undo, Redo, Smile, Send, X, Save, Clock, Calendar
} from "lucide-react";
import { sealFutureDiaryAction, updateFutureDiaryAction } from "@/features/journal/actions";
import { type JournalActionResult } from "@/features/journal/actions";

const THEMES = [
  ["cream","奶油素纸"],["rose","玫瑰花纹"],["moon","星月手帐"],
  ["vintage","复古邮笺"],["sakura","樱花手绘"],["lined","简约横线"],
] as const;

const KAOMOJI = ["(｡･ω･｡)ﾉ♡","(づ｡◕‿‿◕｡)づ","(╥﹏╥)","(๑•̀ㅂ•́)و✧","♡(˃͈ દ ˂͈ ༶ )","(◍•ᴗ•◍)","(≧▽≦)","(°◕‿◕°)"];
const EMOJI = ["❤️","🥺","🫶","🌙","✨","🌷","🕊️","💌","🌸","🍀","🎈","🎀","💝","🌟","💫","🌈"];

type EditorMode = "new" | "draft" | "edit";

const LOCAL_STORAGE_KEY_PREFIX = "nkddiary_capsule_draft";

export function shanghaiWallTimeToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 8, Number(minute));
  const check = new Date(utc + 8 * 60 * 60 * 1_000);
  if (
    check.getUTCFullYear() !== Number(year)
    || check.getUTCMonth() !== Number(month) - 1
    || check.getUTCDate() !== Number(day)
    || check.getUTCHours() !== Number(hour)
    || check.getUTCMinutes() !== Number(minute)
  ) return null;
  return new Date(utc).toISOString();
}

function isoToShanghaiLocal(isoString: string): string {
  try {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${minute}`;
  } catch {
    return "";
  }
}

export function CapsuleLetterComposer({ 
  recipientId, 
  recipientName, 
  entryId,
  initialHtml="", 
  initialText="", 
  initialTheme="cream",
  initialOpenAt="",
  authorId="",
}: { 
  recipientId:string; 
  recipientName:string; 
  entryId?:string;
  initialHtml?:string; 
  initialText?:string; 
  initialTheme?:string;
  initialOpenAt?:string;
  authorId?:string;
}) {
  const editor=useRef<HTMLDivElement>(null);
  const [theme,setTheme]=useState(initialTheme); 
  const [count,setCount]=useState(Array.from(initialText).length);
  const [message,setMessage]=useState(""); 
  const [confirming,setConfirming]=useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [sending,setSending]=useState(false); 
  const [pending,startTransition]=useTransition();
  const [openAt, setOpenAt] = useState(initialOpenAt ? isoToShanghaiLocal(initialOpenAt) : "");
  const [saving]=useState(false);
  const [lastSaved,setLastSaved]=useState<string|null>(null);
  const debounceRef=useRef<number|null>(null);
  const initializedRef=useRef(false);
  const composingRef=useRef(false);
  const hasUnsavedChangesRef=useRef(false);

  const router = useRouter();

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

  const hasContent = useCallback(() => {
    const text = editor.current?.innerText.trim() ?? "";
    return text.length > 0 || theme !== initialTheme || openAt !== initialOpenAt;
  }, [editor, theme, openAt, initialTheme, initialOpenAt]);

  const autoSave = useCallback(() => {
    hasUnsavedChangesRef.current = true;
    setLastSaved(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
    // Save to localStorage for draft recovery
    try {
      const text = editor.current?.innerText.trim() ?? "";
      const html = editor.current?.innerHTML ?? "";
      const draft = {
        authorId,
        recipientId,
        html,
        text,
        plainText: text,
        stationeryTheme: theme,
        openAt,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}_${authorId}`, JSON.stringify(draft));
    } catch (error) {
      console.error("Failed to save capsule draft:", error);
    }
  }, [authorId, recipientId, theme, openAt]);

  const triggerAutoSave = useCallback(() => {
    hasUnsavedChangesRef.current = true;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(autoSave, 1000);
  }, [autoSave]);

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

  const handleClose = useCallback(() => {
    if (!hasContent()) {
      router.push("/journal");
      return;
    }
    if (mode === "edit") {
      if (hasUnsavedChangesRef.current) {
        setCloseConfirm(true);
        return;
      }
      router.push("/journal");
      return;
    }
    // new/draft mode with content
    setCloseConfirm(true);
  }, [hasContent, mode, router]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  const handleSaveDraftAndClose = useCallback(() => {
    autoSave();
    setCloseConfirm(false);
    router.push("/journal");
  }, [autoSave, router]);

  async function send(){
    const text=editor.current?.innerText.trim() ?? "";
    if(!text || Array.from(text).length>5000){
      setMessage("这封信需要有内容，最多 5000 字。");
      return;
    }
    const openingIso = shanghaiWallTimeToIso(openAt);
    if (!openingIso || new Date(openingIso).getTime() <= Date.now()) {
      setMessage("请选择一个晚于现在的有效开启时间。");
      return;
    }

    setConfirming(false); 
    setSending(true);
    window.setTimeout(()=>startTransition(async()=>{
      let res: JournalActionResult;
      
      if (entryId) {
        res = await updateFutureDiaryAction({
          entryId,
          content: text,
          openAt: openingIso,
        });
      } else {
        res = await sealFutureDiaryAction({
          content: text,
          recipientId,
          openAt: openingIso,
        });
      }
      
      setMessage(res.message); 
      if(res.ok){
        if(editor.current) editor.current.innerHTML=""; 
        setCount(0);
        setLastSaved(null);
        hasUnsavedChangesRef.current = false;
        // Clear draft from localStorage
        if (authorId) {
          localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_${authorId}`);
        }
      }
      setSending(false);
      if(res.ok) {
        setTimeout(() => router.push("/journal"), 500);
      }
    }), 850);
  }

  return (
    <section className="relative flex flex-col h-full">
      
      {/* 1. 标题区 - 胶囊信专属风格 */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-orange-100 flex-shrink-0 bg-gradient-to-r from-amber-50 to-orange-50">
        <div>
          <p className="text-xs tracking-[.22em] text-orange-500">FOR LATER</p>
          <h2 className="font-serif text-xl font-semibold text-gray-900">
            {mode === "edit" ? "修改胶囊信" : `写给未来的 ${recipientName}`}
          </h2>
        </div>
        <button 
          type="button"
          onClick={handleClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-lg text-gray-500 transition hover:text-gray-900"
        >
          <X size={20} />
        </button>
      </div>

      {/* 2. 信纸主题区 - 独立一行 */}
      <div className="flex items-center gap-2 px-6 py-4 flex-shrink-0 bg-white/80">
        <span className="text-xs font-medium text-gray-500">信纸样式</span>
        <div className="flex flex-wrap gap-2 ml-2">
          {THEMES.map(([id,label])=>(
            <button 
              key={id} 
              type="button" 
              onClick={()=>{setTheme(id); triggerAutoSave();}} 
              className={`rounded-full px-4 py-1.5 text-sm transition ${theme===id?"bg-orange-500 text-white":"bg-white/70 hover:bg-white"}`}
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

      {/* 4. 正文主体 */}
      <div 
        className={`stationery stationery-${theme} relative flex-1 min-h-0 overflow-y-auto ${sending?"letter-folding":""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            editor.current?.focus();
          }
        }}
      >
        {/* 胶囊信标识 */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-3 py-1 rounded-full text-xs font-medium shadow-lg z-10">
          <Calendar size={12} />
          时间胶囊
        </div>

        {/* 正文区 */}
        <div className="px-8 pb-8 pt-4">
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
            data-placeholder="写给未来的话……" 
            className="rich-letter-editor min-h-[200px] sm:min-h-[360px] outline-none w-full p-8" 
          />
        </div>
        
        {sending ? <div className="dove-flight" aria-hidden="true">🕊️<span>💌</span></div> : null}
      </div>

      {/* 5. 底部操作栏 - 包含时间选择和按钮 */}
      <div className="flex items-center justify-between gap-4 border-t border-orange-100 px-6 py-4 flex-shrink-0 bg-gradient-to-r from-amber-50 to-orange-50">
        <div className="flex items-center gap-4">
          <span className={`text-sm ${count>5000?"text-red-600":"text-gray-600"}`}>
            {count} / 5000
          </span>
          {saving && <span className="text-sm text-gray-500">保存中...</span>}
          {lastSaved && !saving && <span className="text-sm text-gray-500">已保存 {lastSaved}</span>}
        </div>
        
        {/* 中间：时间选择 */}
        <div className="flex items-center gap-3">
          <Clock size={16} className="text-orange-500" />
          <input 
            type="datetime-local" 
            value={openAt} 
            onChange={(e) => { setOpenAt(e.target.value); triggerAutoSave(); }} 
            className="rounded-xl border border-orange-200 bg-white/80 px-4 py-2 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            placeholder="选择开启时间"
          />
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex items-center gap-3">
          {/* 暂存离开 - new/draft 模式 */}
          {mode !== "edit" && (
            <button 
              type="button" 
              onClick={handleSaveDraftAndClose}
              className="flex items-center gap-1.5 h-[44px] rounded-full bg-white/80 px-5 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-white shadow-md transition"
            >
              <Save size={14} />
              暂存离开
            </button>
          )}
          
          {/* 确认封存 / 保存修改 */}
          <button 
            type="button" 
            disabled={pending||sending||count<1||count>5000||!openAt} 
            onClick={()=>setConfirming(true)} 
            className={`h-[44px] flex items-center gap-2 rounded-full px-6 py-2 text-sm font-semibold transition ${
              pending||sending||count<1||count>5000||!openAt
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-amber-400 to-orange-500 text-white hover:opacity-90 shadow-lg"
            }`}
          >
            <Send size={16}/>
            {mode === "edit" ? "保存修改" : "确认封存"}
          </button>
        </div>
      </div>

      {/* 发送确认弹窗 */}
      {confirming && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 flex items-center justify-center">
                <Calendar size={32} className="text-orange-500" />
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-4 text-center">确认{mode === "edit" ? "修改" : "封存"}？</h3>
            <p className="text-gray-600 mb-6 text-center">
              {mode === "edit" 
                ? "修改后将更新胶囊信内容和发送时间。" 
                : "封存后不能修改、撤回或删除。你仍可在“我写出的”中回看。"}
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={()=>setConfirming(false)} className="flex-1 rounded-full border border-gray-200 px-6 py-3 text-sm text-gray-600 hover:text-gray-900 transition">
                再想一想
              </button>
              <button type="button" onClick={send} className="flex-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-3 text-sm font-semibold text-white">
                {mode === "edit" ? "确认修改" : "封存胶囊信"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 关闭确认弹窗 */}
      {closeConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-xl font-semibold mb-4">{mode === "edit" ? "修改还没有保存哦。" : "这封信还没有写完呢。"}</h3>
            <p className="text-gray-600 mb-6">确定要离开吗？</p>
            <div className="flex flex-col gap-3">
              {mode !== "edit" && (
                <button type="button" onClick={handleSaveDraftAndClose} className="flex-1 rounded-full border border-orange-200 bg-orange-50 px-6 py-3 text-sm text-orange-600 hover:bg-orange-100 transition flex items-center justify-center gap-2">
                  <Save size={14} /> 暂存离开
                </button>
              )}
              <button type="button" onClick={()=>{setCloseConfirm(false); router.push("/journal");}} className="flex-1 rounded-full bg-gray-100 px-6 py-3 text-sm text-gray-600 hover:bg-gray-200 transition">
                {mode === "edit" ? "放弃修改" : "放弃这封信"}
              </button>
              <button type="button" onClick={()=>setCloseConfirm(false)} className="flex-1 rounded-full bg-gray-800 px-6 py-3 text-sm font-semibold text-white">
                继续写
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 消息提示 */}
      {message && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] rounded-full bg-gray-900 px-6 py-3 text-sm text-white shadow-lg">
          {message}
        </div>
      )}
    </section>
  );
}

function EmojiPicker({ onInsert }: { onInsert: (text:string)=>void }) {
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLButtonElement>(null);

  useEffect(()=>{
    function close(e:MouseEvent){
      if(ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if(open) document.addEventListener("mousedown",close);
    return ()=>document.removeEventListener("mousedown",close);
  },[open]);

  return (
    <div className="relative" ref={ref as unknown as React.RefObject<HTMLDivElement>}>
      <button type="button" onClick={()=>setOpen(!open)} className="rounded-lg p-2 hover:bg-white" title="表情">
        <Smile size={16}/>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-xl p-3 z-50 max-h-[240px] overflow-y-auto min-w-[200px]">
          <div className="flex flex-wrap gap-1">
            {EMOJI.concat(KAOMOJI).map(e=>(
              <button key={e} type="button" onClick={()=>{onInsert(e); setOpen(false);}} className="rounded-lg p-1.5 hover:bg-black/5 text-xl">
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
