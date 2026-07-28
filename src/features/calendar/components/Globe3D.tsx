"use client";

import { useEffect, useState } from "react";

export function Globe3D() {
  const [rotation, setRotation] = useState(0);
  const [time, setTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => {
      setRotation(prev => prev + 0.1);
      setTime(new Date());
    }, 50);
    return () => clearInterval(timer);
  }, []);
  
  // 计算当前时区对应的经度偏移（0-360度）
  const timeOffset = time.getTimezoneOffset(); // 分钟
  const longitude = (180 + (timeOffset / 60) * 15) % 360;
  
  return (
    <div className="relative w-full flex items-center justify-center">
      <div 
        className="relative w-32 h-32 sm:w-40 sm:h-40"
        style={{ perspective: "500px" }}
      >
        {/* 地球 */}
        <div 
          className="absolute inset-0 rounded-full"
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateY(${rotation}deg)`,
            transition: "transform 0.05s linear",
          }}
        >
          {/* 地球表面 */}
          <div 
            className="absolute inset-0 rounded-full"
            style={{
              background: `
                radial-gradient(circle at 30% 30%, #4a90d9 0%, #2563eb 30%, #1e40af 70%, #1e3a8a 100%),
                radial-gradient(circle at ${(longitude / 360) * 100}% 50%, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 20%, transparent 50%)
              `,
              boxShadow: `
                inset -4px -4px 8px rgba(0,0,0,0.3),
                inset 4px 4px 8px rgba(255,255,255,0.1),
                0 0 20px rgba(37,99,235,0.3)
              `,
              transform: "rotateX(23.5deg)",
            }}
          >
            {/* 大陆轮廓 - 使用SVG路径模拟 */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
              {/* 北美洲 */}
              <path
                d="M15 25 Q20 20 28 22 Q35 25 32 35 Q28 42 22 40 Q18 38 15 30 Z"
                fill="rgba(46,139,87,0.6)"
                opacity="0.6"
              />
              {/* 南美洲 */}
              <path
                d="M25 50 Q30 52 32 58 Q35 65 30 75 Q28 80 24 78 Q22 72 23 60 Z"
                fill="rgba(46,139,87,0.5)"
                opacity="0.5"
              />
              {/* 欧洲 */}
              <path
                d="M48 22 Q52 20 58 22 Q62 25 60 30 Q56 33 52 32 Q48 30 48 25 Z"
                fill="rgba(34,139,34,0.6)"
                opacity="0.6"
              />
              {/* 非洲 */}
              <path
                d="M50 38 Q55 35 62 38 Q65 45 64 55 Q60 65 55 62 Q52 58 48 52 Q48 45 50 40 Z"
                fill="rgba(34,139,34,0.5)"
                opacity="0.5"
              />
              {/* 亚洲 */}
              <path
                d="M60 20 Q75 18 85 25 Q90 35 88 45 Q82 55 70 52 Q62 45 60 35 Q58 28 60 22 Z"
                fill="rgba(46,139,87,0.6)"
                opacity="0.6"
              />
              {/* 澳大利亚 */}
              <path
                d="M82 58 Q88 55 92 58 Q94 64 90 68 Q85 72 80 68 Q78 62 82 58 Z"
                fill="rgba(34,139,34,0.5)"
                opacity="0.5"
              />
            </svg>
            
            {/* 日夜分界线 - 动态阴影 */}
            <div 
              className="absolute inset-0 rounded-full"
              style={{
                background: `linear-gradient(
                  to right,
                  transparent ${((longitude - 90 + 360) % 360) / 360 * 100}%,
                  rgba(0,0,0,0.5) ${((longitude - 90 + 360) % 360) / 360 * 100}%,
                  rgba(0,0,0,0.7) ${((longitude + 90 + 360) % 360) / 360 * 100}%,
                  transparent ${((longitude + 90 + 360) % 360) / 360 * 100}%
                )`,
                transform: "rotateX(23.5deg)",
              }}
            />
            
            {/* 大气层光晕 */}
            <div 
              className="absolute -inset-2 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(37,99,235,0.2) 0%, transparent 70%)",
                transform: "translateZ(10px)",
                opacity: 0.5,
              }}
            />
          </div>
          
          {/* 星星背景 */}
          <div 
            className="absolute -inset-8 rounded-full"
            style={{
              background: `
                radial-gradient(circle at 20% 30%, rgba(255,255,255,0.8) 1px, transparent 1px),
                radial-gradient(circle at 40% 60%, rgba(255,255,255,0.6) 1px, transparent 1px),
                radial-gradient(circle at 60% 20%, rgba(255,255,255,0.7) 1px, transparent 1px),
                radial-gradient(circle at 80% 50%, rgba(255,255,255,0.5) 1px, transparent 1px),
                radial-gradient(circle at 30% 80%, rgba(255,255,255,0.6) 1px, transparent 1px),
                radial-gradient(circle at 70% 70%, rgba(255,255,255,0.4) 1px, transparent 1px),
                radial-gradient(circle at 10% 10%, rgba(255,255,255,0.5) 1px, transparent 1px),
                radial-gradient(circle at 90% 90%, rgba(255,255,255,0.6) 1px, transparent 1px),
                radial-gradient(circle at 50% 90%, rgba(255,255,255,0.4) 1px, transparent 1px),
                radial-gradient(circle at 10% 50%, rgba(255,255,255,0.5) 1px, transparent 1px)
              `,
              transform: "translateZ(-20px)",
              opacity: 0.6,
            }}
          />
        </div>
        
        {/* 太阳指示 */}
        <div 
          className="absolute -top-4 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-yellow-400 shadow-lg"
          style={{
            boxShadow: "0 0 10px rgba(250,204,21,0.8)",
          }}
        />
        <p className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] text-[var(--muted-ink)]">☀️</p>
        
        {/* 月亮指示 */}
        <div 
          className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gray-300 shadow"
        />
        <p className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] text-[var(--muted-ink)]">🌙</p>
      </div>
      
      {/* 时间显示 */}
      <div className="mt-4 text-center">
        <p className="text-xs text-[var(--muted-ink)]">
          {time.toLocaleDateString("zh-CN", { weekday: "long" })}
        </p>
        <p className="text-sm font-medium">
          {time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}
