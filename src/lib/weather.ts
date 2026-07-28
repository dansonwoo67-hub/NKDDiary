"use server";

import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WeatherData } from "./weather-types";

const DEFAULT_WEATHER: Record<string, WeatherData> = {
  "广州": { city: "广州", weather: "多云", temperature: 31, icon: "⛅" },
  "北京": { city: "北京", weather: "晴", temperature: 26, icon: "☀️" },
  "上海": { city: "上海", weather: "阴", temperature: 28, icon: "☁️" },
  "深圳": { city: "深圳", weather: "晴", temperature: 32, icon: "☀️" },
  "杭州": { city: "杭州", weather: "小雨", temperature: 25, icon: "🌧️" },
  "成都": { city: "成都", weather: "多云", temperature: 24, icon: "⛅" },
  "武汉": { city: "武汉", weather: "晴", temperature: 27, icon: "☀️" },
  "南京": { city: "南京", weather: "阴", temperature: 26, icon: "☁️" },
  "安曼": { city: "安曼", weather: "晴", temperature: 35, icon: "☀️" },
  "开罗": { city: "开罗", weather: "晴", temperature: 38, icon: "☀️" },
  "许昌": { city: "许昌", weather: "晴", temperature: 28, icon: "☀️" },
  "平顶山": { city: "平顶山", weather: "多云", temperature: 26, icon: "⛅" },
};

export async function getWeather(): Promise<WeatherData | null> {
  try {
    const { profile } = await requireUser();
    type ProfileWithCity = { city?: string | null };
    const city = String((profile as ProfileWithCity).city ?? "");
    
    if (!city) {
      return null;
    }

    if (DEFAULT_WEATHER[city]) {
      return DEFAULT_WEATHER[city];
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("get_weather", { p_city: city });
    
    if (error || !data) {
      return {
        city,
        weather: "晴",
        temperature: 25,
        icon: "☀️",
      };
    }

    return data;
  } catch {
    return null;
  }
}

export async function setCity(city: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { userId } = await requireUser();
    const supabase = await createServerSupabaseClient();
    
    const { error } = await supabase
      .from("profiles")
      .update({ city })
      .eq("id", userId);

    if (error) {
      return { ok: false, message: "设置城市失败" };
    }

    return { ok: true, message: `已设置城市为 ${city}` };
  } catch {
    return { ok: false, message: "设置城市失败" };
  }
}
