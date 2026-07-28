export interface WeatherData {
  city: string;
  weather: string;
  temperature: number;
  icon: string;
}

export const CITY_OPTIONS = [
  { label: "约旦-安曼", value: "安曼" },
  { label: "埃及-开罗", value: "开罗" },
  { label: "湖北-武汉", value: "武汉" },
  { label: "广东-广州", value: "广州" },
  { label: "北京", value: "北京" },
  { label: "河南-许昌", value: "许昌" },
  { label: "河南平顶山", value: "平顶山" },
];
