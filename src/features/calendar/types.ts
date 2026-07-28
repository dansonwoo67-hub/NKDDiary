export type CalendarEventInput = {
  name: string;
  eventDate: string;
  endDate?: string;
  eventType: CalendarMemoryType;
  recurrence: "none" | "monthly" | "yearly";
  isImportant: boolean;
  description?: string;
  icon: string;
  color: "rose" | "gold" | "blue" | "green" | "purple";
};

export type CalendarEventChip = { id:string; name:string; icon:string; color:"rose"|"gold"|"blue"|"green"|"purple"; eventType:string; isImportant:boolean; description:string; };
export type MonthCalendarLetter = { id:string; label:string; href:string; status:"sealed"|"unread"|"read"; isFuture:boolean; };
export type MonthCalendarContent = { id:string; kind:"mood"|"memory"; icon:string; label:string; href:string; };
export type MonthCalendarDay = { date:string; dayOfMonth:number; isToday?:boolean; letters?:MonthCalendarLetter[]; content?:MonthCalendarContent[]; events:CalendarEventChip[]; recordCount?:number; };
export type MonthCalendarState = { year:number; month:number; days:MonthCalendarDay[]; };
export type YearCalendarDay = { date: string; count: number; level: number };
export type YearCalendarState = { 
  year: number; 
  days: YearCalendarDay[]; 
  importantDates: Array<{ 
    date: string; 
    name: string; 
    icon: string; 
    eventType: string; 
    isImportant: boolean; 
  }>; 
};

import type { CalendarMemoryType } from "@/features/memories/rules";
