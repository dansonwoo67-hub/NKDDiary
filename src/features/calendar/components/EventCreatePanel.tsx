"use client";

import { useState } from "react";
import { createCalendarEventAction } from "@/features/calendar/actions";
import type { CalendarEventInput } from "@/features/calendar/types";
import type { CalendarMemoryType } from "@/features/memories/rules";
import { X, Gift, MapPin, Repeat } from "lucide-react";

interface EventCreatePanelProps {
  defaultDate?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const EVENT_TYPES = [
  { type: "anniversary", label: "纪念日", icon: "💍", defaultRecurrence: "yearly" },
  { type: "birthday", label: "生日", icon: "🎂", defaultRecurrence: "yearly" },
  { type: "date", label: "约会", icon: "🍽️", defaultRecurrence: "none" },
  { type: "travel", label: "旅行", icon: "✈️", defaultRecurrence: "none" },
  { type: "todo", label: "待办", icon: "✅", defaultRecurrence: "none" },
  { type: "other", label: "其他", icon: "📌", defaultRecurrence: "none" },
];

const COLORS = [
  { value: "rose", label: "玫瑰", emoji: "🌹" },
  { value: "gold", label: "星星", emoji: "⭐" },
  { value: "blue", label: "天空", emoji: "💙" },
  { value: "green", label: "星球", emoji: "🌍" },
  { value: "purple", label: "晚霞", emoji: "🌅" },
];

export function EventCreatePanel({ defaultDate, onClose, onSuccess }: EventCreatePanelProps) {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<CalendarEventInput>>({
    name: "",
    eventDate: defaultDate || new Date().toISOString().split("T")[0],
    recurrence: "none",
    isImportant: false,
    color: "rose",
    icon: "🌹",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  const handleTypeSelect = (type: string) => {
    const eventType = EVENT_TYPES.find(t => t.type === type);
    setSelectedType(type);
    setFormData(prev => ({
      ...prev,
      eventType: type as CalendarMemoryType,
      recurrence: eventType?.defaultRecurrence as "none" | "monthly" | "yearly" ?? "none",
      icon: eventType?.icon ?? "📌",
    }));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!formData.name?.trim()) {
      setError("请输入事件名称");
      return;
    }
    
    if (!formData.eventDate) {
      setError("请选择日期");
      return;
    }
    
    setLoading(true);
    
    const result = await createCalendarEventAction({
      name: formData.name.trim(),
      eventDate: formData.eventDate,
      endDate: formData.endDate || undefined,
      eventType: formData.eventType || "other",
      recurrence: (formData.recurrence as CalendarEventInput["recurrence"]) || "none",
      isImportant: formData.isImportant ?? false,
      description: formData.description || undefined,
      icon: formData.icon || "📌",
      color: (formData.color as CalendarEventInput["color"]) || "rose",
    });
    
    setLoading(false);
    
    if (result.ok) {
      onSuccess();
      onClose();
    } else {
      setError(result.message);
    }
  };
  
  if (!selectedType) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-sm mx-4 bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="p-6 border-b border-[var(--muted-ink)]/10">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">创建事件</h2>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-[var(--muted-ink)]/5">
                <X size={20} />
              </button>
            </div>
            <p className="mt-1 text-sm text-[var(--muted-ink)]">选择事件类型</p>
          </div>
          <div className="p-6 grid grid-cols-3 gap-3">
            {EVENT_TYPES.map(type => (
              <button
                key={type.type}
                onClick={() => handleTypeSelect(type.type)}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-[var(--muted-ink)]/10 hover:border-[var(--rose)]/30 hover:bg-[var(--rose)]/5 transition"
              >
                <span className="text-3xl">{type.icon}</span>
                <span className="text-sm font-medium">{type.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 p-6 border-b border-[var(--muted-ink)]/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{formData.icon}</span>
              <div>
                <h2 className="text-xl font-semibold">创建{EVENT_TYPES.find(t => t.type === selectedType)?.label}</h2>
                <p className="text-sm text-[var(--muted-ink)]">记录这个特别的日子</p>
              </div>
            </div>
            <button onClick={() => setSelectedType(null)} className="p-2 rounded-full hover:bg-[var(--muted-ink)]/5">
              <X size={20} />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">事件名称</label>
            <input
              type="text"
              value={formData.name || ""}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="比如：在一起一周年"
              className="w-full px-4 py-3 rounded-xl border border-[var(--muted-ink)]/20 focus:border-[var(--rose)]/50 focus:outline-none transition"
              maxLength={40}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">开始日期</label>
              <input
                type="date"
                value={formData.eventDate || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, eventDate: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border border-[var(--muted-ink)]/20 focus:border-[var(--rose)]/50 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">结束日期（可选）</label>
              <input
                type="date"
                value={formData.endDate || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                min={formData.eventDate}
                className="w-full px-4 py-3 rounded-xl border border-[var(--muted-ink)]/20 focus:border-[var(--rose)]/50 focus:outline-none transition"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2">
                <Repeat size={14} />
                重复方式
              </label>
              <select
                value={formData.recurrence || "none"}
                onChange={(e) => setFormData(prev => ({ ...prev, recurrence: e.target.value as "none" | "monthly" | "yearly" }))}
                className="w-full px-4 py-3 rounded-xl border border-[var(--muted-ink)]/20 focus:border-[var(--rose)]/50 focus:outline-none transition"
              >
                <option value="none">不重复</option>
                <option value="monthly">每月</option>
                <option value="yearly">每年</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2">
                <Gift size={14} />
                颜色
              </label>
              <select
                value={formData.color || "rose"}
                onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value as "rose" | "gold" | "blue" | "green" | "purple" }))}
                className="w-full px-4 py-3 rounded-xl border border-[var(--muted-ink)]/20 focus:border-[var(--rose)]/50 focus:outline-none transition"
              >
                {COLORS.map(color => (
                  <option key={color.value} value={color.value}>
                    {color.emoji} {color.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">地点（可选）</label>
            <div className="relative">
              <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted-ink)]" />
              <input
                type="text"
                value={formData.description || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="比如：广州天河"
                className="w-full pl-12 pr-4 py-3 rounded-xl border border-[var(--muted-ink)]/20 focus:border-[var(--rose)]/50 focus:outline-none transition"
                maxLength={1000}
              />
            </div>
          </div>
          
          {selectedType === "other" && (
            <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--muted-ink)]/10 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isImportant ?? false}
                onChange={(e) => setFormData(prev => ({ ...prev, isImportant: e.target.checked }))}
                className="w-5 h-5 accent-[var(--rose)]"
              />
              <span className="text-sm">标记为重要</span>
            </label>
          )}
          
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[var(--rose)] text-white font-medium hover:bg-[var(--rose)]/90 transition disabled:opacity-50"
          >
            {loading ? "创建中..." : "创建事件"}
          </button>
        </form>
      </div>
    </div>
  );
}
