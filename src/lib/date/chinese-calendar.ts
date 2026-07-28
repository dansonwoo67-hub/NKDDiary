export type ChinaHolidayType = "holiday" | "workday";
export type SolarTerm = string;

export interface LunarDate {
  year: number;
  month: number;
  day: number;
  isLeap: boolean;
  yearName: string;
  monthName: string;
  dayName: string;
}

export interface DateInfo {
  date: string;
  year: number;
  month: number;
  day: number;
  weekday: string;
  lunar: LunarDate;
  solarTerm?: SolarTerm;
  holiday?: { name: string; type: ChinaHolidayType };
}

const LUNAR_YEARS = [
  "甲子", "乙丑", "丙寅", "丁卯", "戊辰", "己巳", "庚午", "辛未", "壬申", "癸酉",
  "甲戌", "乙亥", "丙子", "丁丑", "戊寅", "己卯", "庚辰", "辛巳", "壬午", "癸未",
  "甲申", "乙酉", "丙戌", "丁亥", "戊子", "己丑", "庚寅", "辛卯", "壬辰", "癸巳",
  "甲午", "乙未", "丙申", "丁酉", "戊戌", "己亥", "庚子", "辛丑", "壬寅", "癸卯",
  "甲辰", "乙巳", "丙午", "丁未", "戊申", "己酉", "庚戌", "辛亥", "壬子", "癸丑",
  "甲寅", "乙卯", "丙辰", "丁巳", "戊午", "己未", "庚申", "辛酉", "壬戌", "癸亥"
];

const LUNAR_MONTHS = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
const LUNAR_DAYS = ["", "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];

const SOLAR_TERMS = [
  "小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨", "立夏", "小满", "芒种", "夏至",
  "小暑", "大暑", "立秋", "处暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至"
];

const SOLAR_TERM_DATES: Record<number, number[]> = {
  2024: [5, 20, 4, 19, 5, 20, 4, 20, 5, 21, 5, 21, 7, 23, 7, 23, 8, 23, 8, 23, 7, 22, 7, 22],
  2025: [5, 20, 4, 19, 5, 20, 4, 20, 5, 21, 5, 21, 7, 23, 7, 23, 8, 23, 8, 23, 7, 22, 7, 22],
  2026: [5, 20, 4, 19, 5, 20, 4, 20, 5, 21, 6, 21, 7, 23, 8, 23, 8, 23, 9, 23, 7, 22, 7, 22],
  2027: [5, 20, 4, 19, 5, 20, 4, 20, 5, 21, 6, 21, 7, 23, 8, 23, 8, 23, 9, 23, 8, 22, 7, 22],
  2028: [5, 20, 4, 19, 5, 20, 4, 20, 5, 21, 6, 21, 7, 23, 8, 23, 8, 23, 9, 23, 8, 22, 8, 22],
  2029: [5, 20, 4, 19, 5, 20, 4, 20, 5, 21, 6, 21, 7, 23, 8, 23, 8, 23, 9, 23, 8, 22, 8, 22],
  2030: [5, 20, 4, 19, 5, 20, 4, 20, 5, 21, 6, 21, 7, 23, 8, 23, 8, 23, 9, 23, 8, 22, 8, 22],
};

const CHINA_HOLIDAYS: Record<number, Array<{ date: string; name: string; type: ChinaHolidayType }>> = {
  2024: [
    { date: "2024-01-01", name: "元旦", type: "holiday" },
    { date: "2024-02-09", name: "除夕", type: "holiday" },
    { date: "2024-02-10", name: "春节", type: "holiday" },
    { date: "2024-02-11", name: "春节", type: "holiday" },
    { date: "2024-02-12", name: "春节", type: "holiday" },
    { date: "2024-02-13", name: "春节", type: "holiday" },
    { date: "2024-02-14", name: "春节", type: "holiday" },
    { date: "2024-02-15", name: "春节", type: "holiday" },
    { date: "2024-02-04", name: "班", type: "workday" },
    { date: "2024-02-18", name: "班", type: "workday" },
    { date: "2024-04-04", name: "清明节", type: "holiday" },
    { date: "2024-04-05", name: "清明节", type: "holiday" },
    { date: "2024-04-06", name: "清明节", type: "holiday" },
    { date: "2024-04-07", name: "班", type: "workday" },
    { date: "2024-05-01", name: "劳动节", type: "holiday" },
    { date: "2024-05-02", name: "劳动节", type: "holiday" },
    { date: "2024-05-03", name: "劳动节", type: "holiday" },
    { date: "2024-05-04", name: "劳动节", type: "holiday" },
    { date: "2024-05-05", name: "劳动节", type: "holiday" },
    { date: "2024-04-28", name: "班", type: "workday" },
    { date: "2024-05-11", name: "班", type: "workday" },
    { date: "2024-06-08", name: "端午节", type: "holiday" },
    { date: "2024-06-09", name: "端午节", type: "holiday" },
    { date: "2024-06-10", name: "端午节", type: "holiday" },
    { date: "2024-09-15", name: "中秋节", type: "holiday" },
    { date: "2024-09-16", name: "中秋节", type: "holiday" },
    { date: "2024-09-17", name: "中秋节", type: "holiday" },
    { date: "2024-10-01", name: "国庆节", type: "holiday" },
    { date: "2024-10-02", name: "国庆节", type: "holiday" },
    { date: "2024-10-03", name: "国庆节", type: "holiday" },
    { date: "2024-10-04", name: "国庆节", type: "holiday" },
    { date: "2024-10-05", name: "国庆节", type: "holiday" },
    { date: "2024-10-06", name: "国庆节", type: "holiday" },
    { date: "2024-10-07", name: "国庆节", type: "holiday" },
    { date: "2024-09-29", name: "班", type: "workday" },
    { date: "2024-10-12", name: "班", type: "workday" },
  ],
  2025: [
    { date: "2025-01-01", name: "元旦", type: "holiday" },
    { date: "2025-01-29", name: "除夕", type: "holiday" },
    { date: "2025-01-30", name: "春节", type: "holiday" },
    { date: "2025-01-31", name: "春节", type: "holiday" },
    { date: "2025-02-01", name: "春节", type: "holiday" },
    { date: "2025-02-02", name: "春节", type: "holiday" },
    { date: "2025-02-03", name: "春节", type: "holiday" },
    { date: "2025-02-04", name: "春节", type: "holiday" },
    { date: "2025-01-26", name: "班", type: "workday" },
    { date: "2025-02-08", name: "班", type: "workday" },
    { date: "2025-04-05", name: "清明节", type: "holiday" },
    { date: "2025-04-06", name: "清明节", type: "holiday" },
    { date: "2025-04-07", name: "清明节", type: "holiday" },
    { date: "2025-05-01", name: "劳动节", type: "holiday" },
    { date: "2025-05-02", name: "劳动节", type: "holiday" },
    { date: "2025-05-03", name: "劳动节", type: "holiday" },
    { date: "2025-05-04", name: "劳动节", type: "holiday" },
    { date: "2025-05-05", name: "劳动节", type: "holiday" },
    { date: "2025-04-27", name: "班", type: "workday" },
    { date: "2025-05-10", name: "班", type: "workday" },
    { date: "2025-05-31", name: "端午节", type: "holiday" },
    { date: "2025-06-01", name: "端午节", type: "holiday" },
    { date: "2025-06-02", name: "端午节", type: "holiday" },
    { date: "2025-09-07", name: "中秋节", type: "holiday" },
    { date: "2025-09-08", name: "中秋节", type: "holiday" },
    { date: "2025-09-09", name: "中秋节", type: "holiday" },
    { date: "2025-10-01", name: "国庆节", type: "holiday" },
    { date: "2025-10-02", name: "国庆节", type: "holiday" },
    { date: "2025-10-03", name: "国庆节", type: "holiday" },
    { date: "2025-10-04", name: "国庆节", type: "holiday" },
    { date: "2025-10-05", name: "国庆节", type: "holiday" },
    { date: "2025-10-06", name: "国庆节", type: "holiday" },
    { date: "2025-10-07", name: "国庆节", type: "holiday" },
    { date: "2025-09-28", name: "班", type: "workday" },
    { date: "2025-10-11", name: "班", type: "workday" },
  ],
  2026: [
    { date: "2026-01-01", name: "元旦", type: "holiday" },
    { date: "2026-02-17", name: "除夕", type: "holiday" },
    { date: "2026-02-18", name: "春节", type: "holiday" },
    { date: "2026-02-19", name: "春节", type: "holiday" },
    { date: "2026-02-20", name: "春节", type: "holiday" },
    { date: "2026-02-21", name: "春节", type: "holiday" },
    { date: "2026-02-22", name: "春节", type: "holiday" },
    { date: "2026-02-23", name: "春节", type: "holiday" },
    { date: "2026-02-14", name: "班", type: "workday" },
    { date: "2026-02-28", name: "班", type: "workday" },
    { date: "2026-04-04", name: "清明节", type: "holiday" },
    { date: "2026-04-05", name: "清明节", type: "holiday" },
    { date: "2026-04-06", name: "清明节", type: "holiday" },
    { date: "2026-05-01", name: "劳动节", type: "holiday" },
    { date: "2026-05-02", name: "劳动节", type: "holiday" },
    { date: "2026-05-03", name: "劳动节", type: "holiday" },
    { date: "2026-05-04", name: "劳动节", type: "holiday" },
    { date: "2026-05-05", name: "劳动节", type: "holiday" },
    { date: "2026-04-26", name: "班", type: "workday" },
    { date: "2026-05-09", name: "班", type: "workday" },
    { date: "2026-06-19", name: "端午节", type: "holiday" },
    { date: "2026-06-20", name: "端午节", type: "holiday" },
    { date: "2026-06-21", name: "端午节", type: "holiday" },
    { date: "2026-09-26", name: "中秋节", type: "holiday" },
    { date: "2026-09-27", name: "中秋节", type: "holiday" },
    { date: "2026-09-28", name: "中秋节", type: "holiday" },
    { date: "2026-10-01", name: "国庆节", type: "holiday" },
    { date: "2026-10-02", name: "国庆节", type: "holiday" },
    { date: "2026-10-03", name: "国庆节", type: "holiday" },
    { date: "2026-10-04", name: "国庆节", type: "holiday" },
    { date: "2026-10-05", name: "国庆节", type: "holiday" },
    { date: "2026-10-06", name: "国庆节", type: "holiday" },
    { date: "2026-10-07", name: "国庆节", type: "holiday" },
    { date: "2026-09-27", name: "班", type: "workday" },
    { date: "2026-10-10", name: "班", type: "workday" },
  ],
  2027: [
    { date: "2027-01-01", name: "元旦", type: "holiday" },
    { date: "2027-02-06", name: "除夕", type: "holiday" },
    { date: "2027-02-07", name: "春节", type: "holiday" },
    { date: "2027-02-08", name: "春节", type: "holiday" },
    { date: "2027-02-09", name: "春节", type: "holiday" },
    { date: "2027-02-10", name: "春节", type: "holiday" },
    { date: "2027-02-11", name: "春节", type: "holiday" },
    { date: "2027-02-12", name: "春节", type: "holiday" },
    { date: "2027-01-30", name: "班", type: "workday" },
    { date: "2027-02-13", name: "班", type: "workday" },
    { date: "2027-04-04", name: "清明节", type: "holiday" },
    { date: "2027-04-05", name: "清明节", type: "holiday" },
    { date: "2027-04-06", name: "清明节", type: "holiday" },
    { date: "2027-05-01", name: "劳动节", type: "holiday" },
    { date: "2027-05-02", name: "劳动节", type: "holiday" },
    { date: "2027-05-03", name: "劳动节", type: "holiday" },
    { date: "2027-05-04", name: "劳动节", type: "holiday" },
    { date: "2027-05-05", name: "劳动节", type: "holiday" },
    { date: "2027-04-25", name: "班", type: "workday" },
    { date: "2027-05-08", name: "班", type: "workday" },
    { date: "2027-06-09", name: "端午节", type: "holiday" },
    { date: "2027-06-10", name: "端午节", type: "holiday" },
    { date: "2027-06-11", name: "端午节", type: "holiday" },
    { date: "2027-09-15", name: "中秋节", type: "holiday" },
    { date: "2027-09-16", name: "中秋节", type: "holiday" },
    { date: "2027-09-17", name: "中秋节", type: "holiday" },
    { date: "2027-10-01", name: "国庆节", type: "holiday" },
    { date: "2027-10-02", name: "国庆节", type: "holiday" },
    { date: "2027-10-03", name: "国庆节", type: "holiday" },
    { date: "2027-10-04", name: "国庆节", type: "holiday" },
    { date: "2027-10-05", name: "国庆节", type: "holiday" },
    { date: "2027-10-06", name: "国庆节", type: "holiday" },
    { date: "2027-10-07", name: "国庆节", type: "holiday" },
    { date: "2027-09-25", name: "班", type: "workday" },
    { date: "2027-10-09", name: "班", type: "workday" },
  ],
  2028: [
    { date: "2028-01-01", name: "元旦", type: "holiday" },
    { date: "2028-01-25", name: "除夕", type: "holiday" },
    { date: "2028-01-26", name: "春节", type: "holiday" },
    { date: "2028-01-27", name: "春节", type: "holiday" },
    { date: "2028-01-28", name: "春节", type: "holiday" },
    { date: "2028-01-29", name: "春节", type: "holiday" },
    { date: "2028-01-30", name: "春节", type: "holiday" },
    { date: "2028-01-31", name: "春节", type: "holiday" },
    { date: "2028-01-22", name: "班", type: "workday" },
    { date: "2028-02-05", name: "班", type: "workday" },
    { date: "2028-04-04", name: "清明节", type: "holiday" },
    { date: "2028-04-05", name: "清明节", type: "holiday" },
    { date: "2028-04-06", name: "清明节", type: "holiday" },
    { date: "2028-05-01", name: "劳动节", type: "holiday" },
    { date: "2028-05-02", name: "劳动节", type: "holiday" },
    { date: "2028-05-03", name: "劳动节", type: "holiday" },
    { date: "2028-05-04", name: "劳动节", type: "holiday" },
    { date: "2028-05-05", name: "劳动节", type: "holiday" },
    { date: "2028-04-30", name: "班", type: "workday" },
    { date: "2028-05-06", name: "班", type: "workday" },
    { date: "2028-05-30", name: "端午节", type: "holiday" },
    { date: "2028-05-31", name: "端午节", type: "holiday" },
    { date: "2028-06-01", name: "端午节", type: "holiday" },
    { date: "2028-09-06", name: "中秋节", type: "holiday" },
    { date: "2028-09-07", name: "中秋节", type: "holiday" },
    { date: "2028-09-08", name: "中秋节", type: "holiday" },
    { date: "2028-10-01", name: "国庆节", type: "holiday" },
    { date: "2028-10-02", name: "国庆节", type: "holiday" },
    { date: "2028-10-03", name: "国庆节", type: "holiday" },
    { date: "2028-10-04", name: "国庆节", type: "holiday" },
    { date: "2028-10-05", name: "国庆节", type: "holiday" },
    { date: "2028-10-06", name: "国庆节", type: "holiday" },
    { date: "2028-10-07", name: "国庆节", type: "holiday" },
    { date: "2028-09-30", name: "班", type: "workday" },
    { date: "2028-10-09", name: "班", type: "workday" },
  ],
  2029: [
    { date: "2029-01-01", name: "元旦", type: "holiday" },
    { date: "2029-02-12", name: "除夕", type: "holiday" },
    { date: "2029-02-13", name: "春节", type: "holiday" },
    { date: "2029-02-14", name: "春节", type: "holiday" },
    { date: "2029-02-15", name: "春节", type: "holiday" },
    { date: "2029-02-16", name: "春节", type: "holiday" },
    { date: "2029-02-17", name: "春节", type: "holiday" },
    { date: "2029-02-18", name: "春节", type: "holiday" },
    { date: "2029-02-09", name: "班", type: "workday" },
    { date: "2029-02-24", name: "班", type: "workday" },
    { date: "2029-04-04", name: "清明节", type: "holiday" },
    { date: "2029-04-05", name: "清明节", type: "holiday" },
    { date: "2029-04-06", name: "清明节", type: "holiday" },
    { date: "2029-05-01", name: "劳动节", type: "holiday" },
    { date: "2029-05-02", name: "劳动节", type: "holiday" },
    { date: "2029-05-03", name: "劳动节", type: "holiday" },
    { date: "2029-05-04", name: "劳动节", type: "holiday" },
    { date: "2029-05-05", name: "劳动节", type: "holiday" },
    { date: "2029-04-29", name: "班", type: "workday" },
    { date: "2029-05-07", name: "班", type: "workday" },
    { date: "2029-06-09", name: "端午节", type: "holiday" },
    { date: "2029-06-10", name: "端午节", type: "holiday" },
    { date: "2029-06-11", name: "端午节", type: "holiday" },
    { date: "2029-09-25", name: "中秋节", type: "holiday" },
    { date: "2029-09-26", name: "中秋节", type: "holiday" },
    { date: "2029-09-27", name: "中秋节", type: "holiday" },
    { date: "2029-10-01", name: "国庆节", type: "holiday" },
    { date: "2029-10-02", name: "国庆节", type: "holiday" },
    { date: "2029-10-03", name: "国庆节", type: "holiday" },
    { date: "2029-10-04", name: "国庆节", type: "holiday" },
    { date: "2029-10-05", name: "国庆节", type: "holiday" },
    { date: "2029-10-06", name: "国庆节", type: "holiday" },
    { date: "2029-10-07", name: "国庆节", type: "holiday" },
    { date: "2029-09-29", name: "班", type: "workday" },
    { date: "2029-10-10", name: "班", type: "workday" },
  ],
  2030: [
    { date: "2030-01-01", name: "元旦", type: "holiday" },
    { date: "2030-02-02", name: "除夕", type: "holiday" },
    { date: "2030-02-03", name: "春节", type: "holiday" },
    { date: "2030-02-04", name: "春节", type: "holiday" },
    { date: "2030-02-05", name: "春节", type: "holiday" },
    { date: "2030-02-06", name: "春节", type: "holiday" },
    { date: "2030-02-07", name: "春节", type: "holiday" },
    { date: "2030-02-08", name: "春节", type: "holiday" },
    { date: "2030-01-26", name: "班", type: "workday" },
    { date: "2030-02-11", name: "班", type: "workday" },
    { date: "2030-04-04", name: "清明节", type: "holiday" },
    { date: "2030-04-05", name: "清明节", type: "holiday" },
    { date: "2030-04-06", name: "清明节", type: "holiday" },
    { date: "2030-05-01", name: "劳动节", type: "holiday" },
    { date: "2030-05-02", name: "劳动节", type: "holiday" },
    { date: "2030-05-03", name: "劳动节", type: "holiday" },
    { date: "2030-05-04", name: "劳动节", type: "holiday" },
    { date: "2030-05-05", name: "劳动节", type: "holiday" },
    { date: "2030-04-28", name: "班", type: "workday" },
    { date: "2030-05-06", name: "班", type: "workday" },
    { date: "2030-06-20", name: "端午节", type: "holiday" },
    { date: "2030-06-21", name: "端午节", type: "holiday" },
    { date: "2030-06-22", name: "端午节", type: "holiday" },
    { date: "2030-09-15", name: "中秋节", type: "holiday" },
    { date: "2030-09-16", name: "中秋节", type: "holiday" },
    { date: "2030-09-17", name: "中秋节", type: "holiday" },
    { date: "2030-10-01", name: "国庆节", type: "holiday" },
    { date: "2030-10-02", name: "国庆节", type: "holiday" },
    { date: "2030-10-03", name: "国庆节", type: "holiday" },
    { date: "2030-10-04", name: "国庆节", type: "holiday" },
    { date: "2030-10-05", name: "国庆节", type: "holiday" },
    { date: "2030-10-06", name: "国庆节", type: "holiday" },
    { date: "2030-10-07", name: "国庆节", type: "holiday" },
    { date: "2030-09-28", name: "班", type: "workday" },
    { date: "2030-10-09", name: "班", type: "workday" },
  ],
};

function solarToLunar(year: number, month: number, day: number): LunarDate {
  const lunarInfo: number[] = [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
    0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
    0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0,
    0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
    0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x195a6,
    0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
    0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
    0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
    0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
    0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
    0x05aa0, 0x076a3, 0x096d0, 0x04bd7, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
    0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  ];

  const solarMonth: number[] = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let i, leap = 0, temp = 0;
  const baseYear = 1900;
  const baseDay = 31;

  let total = (year - baseYear) * 365 + Math.floor((year - 1900) / 4) + 
    solarMonth.slice(1, month).reduce((a, b) => a + b, 0) + day - baseDay;

  if (year > 2000) {
    if (year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)) {
      if (month > 2) total++;
    }
  }

  for (i = 1900; i < 2101 && total > 0; i++) {
    temp = lYearDays(i);
    total -= temp;
  }

  if (total < 0) {
    total += temp;
    i--;
  }

  const lunarYear = i;
  leap = leapMonth(i);
  let isLeap = false;

  for (i = 1; i < 13 && total > 0; i++) {
    if (leap > 0 && i === (leap + 1) && isLeap === false) {
      --i;
      isLeap = true;
      temp = leapDays(lunarYear);
    } else {
      temp = monthDays(lunarYear, i);
    }

    if (isLeap === true && i === (leap + 1)) isLeap = false;
    total -= temp;
  }

  if (total === 0 && leap > 0 && i === leap + 1) {
    if (isLeap) {
      isLeap = false;
    } else {
      isLeap = true;
      --i;
    }
  }

  if (total < 0) {
    total += temp;
    --i;
  }

  const lunarMonth = i;
  const lunarDay = total + 1;

  const yearIndex = (lunarYear - 4) % 60;
  const yearName = LUNAR_YEARS[yearIndex];

  return {
    year: lunarYear,
    month: lunarMonth,
    day: lunarDay,
    isLeap,
    yearName,
    monthName: isLeap ? `闰${LUNAR_MONTHS[lunarMonth - 1]}` : LUNAR_MONTHS[lunarMonth - 1],
    dayName: LUNAR_DAYS[lunarDay],
  };

  function lYearDays(y: number): number {
    let i, sum = 348;
    for (i = 0x8000; i > 0x8; i >>= 1) {
      sum += (lunarInfo[y - 1900] & i) ? 1 : 0;
    }
    return (sum + leapDays(y));
  }

  function leapMonth(y: number): number {
    return (lunarInfo[y - 1900] & 0xf);
  }

  function leapDays(y: number): number {
    if (leapMonth(y)) {
      return ((lunarInfo[y - 1900] & 0x10000) ? 30 : 29);
    }
    return (0);
  }

  function monthDays(y: number, m: number): number {
    return ((lunarInfo[y - 1900] & (0x10000 >> m)) ? 30 : 29);
  }
}

export function getDateInfo(dateStr?: string): DateInfo {
  const date = dateStr ? new Date(dateStr) : new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const weekday = weekdays[date.getDay()];

  const lunar = solarToLunar(year, month, day);

  let solarTerm: SolarTerm | undefined;
  const termDates = SOLAR_TERM_DATES[year];
  if (termDates) {
    const termIndex = (month - 1) * 2;
    if (termIndex + 1 < termDates.length) {
      if (day === termDates[termIndex]) {
        solarTerm = SOLAR_TERMS[termIndex];
      } else if (day === termDates[termIndex + 1]) {
        solarTerm = SOLAR_TERMS[termIndex + 1];
      }
    }
  }

  let holiday: { name: string; type: ChinaHolidayType } | undefined;
  const holidays = CHINA_HOLIDAYS[year];
  if (holidays) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    holiday = holidays.find(h => h.date === dateStr);
  }

  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    year,
    month,
    day,
    weekday,
    lunar,
    solarTerm,
    holiday,
  };
}

export function getWeekday(date: string): string {
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return weekdays[new Date(date).getDay()];
}

export function formatDate(date: string): string {
  const d = new Date(date);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
