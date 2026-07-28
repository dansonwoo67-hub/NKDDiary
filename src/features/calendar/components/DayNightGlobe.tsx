"use client";

import { useEffect, useState } from "react";

export function DayNightGlobe() {
  const [time] = useState(new Date());
  const [cloudOffset, setCloudOffset] = useState(0);

  useEffect(() => {
    // 云层缓慢飘动
    const timer = setInterval(() => {
      setCloudOffset(prev => (prev + 0.2) % 100);
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // 根据小时判断昼夜状态
  const hour = time.getHours();
  const isDay = hour >= 6 && hour < 18;
  const showSun = isDay;
  const showMoon = !isDay;
  // 根据时间调整星星透明度（夜晚更亮）
  const starOpacity = (hour >= 19 || hour < 6) ? 1 : 0.3;

  return (
    <div className="relative w-full flex items-center justify-center">
      {/* 背景光晕 */}
      <div 
        className="absolute w-40 h-40 sm:w-48 sm:h-48 rounded-full blur-3xl transition-opacity duration-1000"
        style={{
          background: isDay 
            ? "radial-gradient(circle, rgba(253,224,71,0.4) 0%, rgba(251,146,60,0.2) 50%, transparent 70%)"
            : "radial-gradient(circle, rgba(192,132,252,0.3) 0%, rgba(99,102,241,0.2) 50%, transparent 70%)",
        }}
      />

      {/* 星球主体 */}
      <div className="relative w-28 h-28 sm:w-36 sm:h-36">
        {/* 星球容器 */}
        <div 
          className="absolute inset-0 rounded-full"
          style={{
            background: `
              radial-gradient(circle at 35% 30%, rgba(255,255,255,0.2) 0%, transparent 30%),
              radial-gradient(circle at 60% 70%, rgba(0,0,0,0.1) 0%, transparent 40%),
              linear-gradient(135deg, 
                ${isDay ? "#fef3c7" : "#1e1b4b"} 0%, 
                ${isDay ? "#fed7aa" : "#312e81"} 50%, 
                ${isDay ? "#fecaca" : "#1e1b4b"} 100%
              )
            `,
            boxShadow: `
              inset -6px -6px 16px rgba(0,0,0,0.15),
              inset 6px 6px 16px rgba(255,255,255,0.1),
              0 8px 32px rgba(0,0,0,0.1),
              ${isDay ? "0 0 40px rgba(251,146,60,0.2)" : "0 0 40px rgba(192,132,252,0.2)"}
            `,
          }}
        >
          {/* 抽象大陆纹理 */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="landGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={isDay ? "#a78bfa" : "#4c1d95"} stopOpacity="0.3" />
                <stop offset="100%" stopColor={isDay ? "#c4b5fd" : "#312e81"} stopOpacity="0.2" />
              </linearGradient>
            </defs>
            
            {/* 柔和的抽象大陆形状 */}
            <path
              d="M15 20 Q22 15 30 18 Q38 22 35 32 Q32 42 25 38 Q18 35 15 25 Z"
              fill="url(#landGradient)"
            />
            <path
              d="M22 48 Q28 50 32 58 Q36 68 30 75 Q26 80 22 76 Q20 70 21 58 Z"
              fill="url(#landGradient)"
              opacity="0.8"
            />
            <path
              d="M48 20 Q55 18 62 20 Q66 25 64 32 Q60 38 54 35 Q48 32 48 25 Z"
              fill="url(#landGradient)"
            />
            <path
              d="M50 38 Q56 35 64 40 Q68 50 65 60 Q60 68 54 64 Q50 58 48 50 Q48 42 50 38 Z"
              fill="url(#landGradient)"
              opacity="0.7"
            />
            <path
              d="M62 18 Q78 15 88 22 Q92 32 90 42 Q84 52 72 48 Q64 42 62 32 Q60 25 62 20 Z"
              fill="url(#landGradient)"
            />
            <path
              d="M82 55 Q88 52 92 58 Q94 64 90 70 Q85 74 80 70 Q78 64 82 58 Z"
              fill="url(#landGradient)"
              opacity="0.8"
            />
          </svg>

          {/* 昼夜分界线 - 柔和渐变 */}
          <div 
            className="absolute inset-0 rounded-full"
            style={{
              background: `linear-gradient(
                to right,
                transparent 0%,
                transparent 45%,
                rgba(0,0,0,${isDay ? 0.3 : 0.1}) 50%,
                rgba(0,0,0,${isDay ? 0.5 : 0.3}) 55%,
                rgba(0,0,0,${isDay ? 0.4 : 0.2}) 60%,
                transparent 65%,
                transparent 100%
              )`,
            }}
          />

          {/* 柔和云层 */}
          <svg 
            className="absolute inset-0 w-full h-full" 
            viewBox="0 0 100 100"
            style={{ transform: `translateX(${cloudOffset}%)` }}
          >
            <path
              d="M0 45 Q15 40 30 45 Q45 50 60 45 Q75 40 90 45 Q100 48 110 45"
              fill="none"
              stroke={isDay ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)"}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M-20 60 Q5 55 20 60 Q35 65 50 60 Q65 55 80 60 Q95 63 110 60"
              fill="none"
              stroke={isDay ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)"}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>

          {/* 高光 */}
          <div 
            className="absolute top-4 left-6 w-8 h-8 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(255,255,255,0.4) 0%, transparent 70%)",
              filter: "blur(4px)",
            }}
          />
        </div>

        {/* 星星层 */}
        <div 
          className="absolute inset-0 rounded-full transition-opacity duration-1000"
          style={{ opacity: starOpacity }}
        >
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
            {/* 闪烁的星星 */}
            {[
              { x: 15, y: 25, size: 1.5, delay: 0 },
              { x: 25, y: 15, size: 1, delay: 0.5 },
              { x: 75, y: 20, size: 1.2, delay: 1 },
              { x: 85, y: 35, size: 0.8, delay: 1.5 },
              { x: 10, y: 70, size: 1, delay: 0.3 },
              { x: 90, y: 80, size: 1.3, delay: 0.8 },
              { x: 50, y: 10, size: 0.8, delay: 1.2 },
              { x: 80, y: 10, size: 1, delay: 0.6 },
            ].map((star, i) => (
              <circle
                key={i}
                cx={star.x}
                cy={star.y}
                r={star.size}
                fill="white"
                style={{
                  animation: `twinkle 3s ease-in-out ${star.delay}s infinite`,
                  filter: "blur(0.5px)",
                }}
              />
            ))}
          </svg>
        </div>
      </div>

      {/* 太阳/月亮 */}
      <div className="absolute -right-4 top-1/2 -translate-y-1/2 flex flex-col items-center">
        {showSun && (
          <div className="relative">
            {/* 太阳本体 */}
            <div 
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full"
              style={{
                background: "radial-gradient(circle, #fde047 0%, #fbbf24 50%, #f59e0b 100%)",
                boxShadow: "0 0 20px rgba(251,191,36,0.6), 0 0 40px rgba(251,191,36,0.4)",
                animation: "sunPulse 4s ease-in-out infinite",
              }}
            />
            {/* 太阳光晕 */}
            <div 
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(251,191,36,0.4) 0%, transparent 70%)",
                animation: "sunGlow 4s ease-in-out infinite",
              }}
            />
          </div>
        )}
        {showMoon && (
          <div className="relative">
            {/* 月亮本体 */}
            <div 
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full"
              style={{
                background: "radial-gradient(circle, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)",
                boxShadow: "0 0 15px rgba(226,232,240,0.5), 0 0 30px rgba(226,232,240,0.3)",
              }}
            />
            {/* 月亮环形山 */}
            <div 
              className="absolute top-2 left-3 w-2 h-2 rounded-full bg-gray-400/30"
            />
            <div 
              className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-gray-400/20"
            />
          </div>
        )}
        <span className="mt-2 text-xs text-[var(--muted-ink)]">
          {showSun ? "☀️ 白天" : "🌙 夜晚"}
        </span>
      </div>

      {/* 时间轨道装饰 */}
      <div 
        className="absolute inset-0 rounded-full border border-dashed border-[var(--muted-ink)]/10"
        style={{
          width: "160px",
          height: "160px",
          animation: "orbit 60s linear infinite",
        }}
      />

      {/* 呼吸光环 */}
      <div 
        className="absolute inset-0 rounded-full"
        style={{
          width: "120px",
          height: "120px",
          background: "radial-gradient(circle, rgba(251,146,60,0.1) 0%, transparent 70%)",
          animation: "breath 4s ease-in-out infinite",
        }}
      />

      {/* 时间指示点 */}
      <div 
        className="absolute w-2 h-2 rounded-full bg-[var(--rose)] shadow-md"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%) rotate(" + (hour * 15) + "deg) translateY(-45px)",
          animation: "timeTick 1s ease-in-out infinite",
        }}
      />

      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes sunPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes sunGlow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.2); }
        }
        @keyframes orbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes breath {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.05); }
        }
        @keyframes timeTick {
          0%, 100% { opacity: 0.8; transform: translate(-50%, -50%) rotate(${hour * 15}deg) translateY(-45px); }
          50% { opacity: 1; transform: translate(-50%, -50%) rotate(${hour * 15}deg) translateY(-43px); }
        }
        
        @media (prefers-reduced-motion: reduce) {
          @keyframes twinkle {
            0% { opacity: 0.6; }
            100% { opacity: 0.6; }
          }
          @keyframes sunPulse {
            0% { transform: scale(1); }
            100% { transform: scale(1); }
          }
          @keyframes sunGlow {
            0% { opacity: 0.6; transform: scale(1); }
            100% { opacity: 0.6; transform: scale(1); }
          }
          @keyframes orbit {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(0deg); }
          }
          @keyframes breath {
            0% { opacity: 0.4; transform: scale(1); }
            100% { opacity: 0.4; transform: scale(1); }
          }
          @keyframes timeTick {
            0% { opacity: 0.8; transform: translate(-50%, -50%) rotate(${hour * 15}deg) translateY(-45px); }
            100% { opacity: 0.8; transform: translate(-50%, -50%) rotate(${hour * 15}deg) translateY(-45px); }
          }
        }
      `}</style>
    </div>
  );
}
