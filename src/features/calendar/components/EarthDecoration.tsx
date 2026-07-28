export function EarthDecoration() {
  return (
    <div className="relative w-full h-full min-h-[180px] max-h-[220px] flex items-center justify-center">
      <svg 
        viewBox="0 0 200 200" 
        className="w-full h-full"
        style={{ maxWidth: '100%', maxHeight: '100%' }}
      >
        <defs>
          {/* 地球渐变背景 */}
          <radialGradient id="earthGradient" cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor="rgba(254, 243, 200, 0.6)" />
            <stop offset="60%" stopColor="rgba(251, 191, 36, 0.15)" />
            <stop offset="100%" stopColor="rgba(244, 114, 182, 0.1)" />
          </radialGradient>
          
          {/* 大陆渐变 */}
          <linearGradient id="landGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(167, 139, 250, 0.4)" />
            <stop offset="100%" stopColor="rgba(196, 181, 253, 0.25)" />
          </linearGradient>
          
          {/* 高光 */}
          <radialGradient id="highlight" cx="30%" cy="30%" r="30%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.4)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
          </radialGradient>
        </defs>
        
        {/* 地球主体 */}
        <circle 
          cx="100" 
          cy="100" 
          r="90" 
          fill="url(#earthGradient)"
        />
        
        {/* 简化大陆轮廓 */}
        {/* 北美洲 */}
        <path
          d="M35 55 Q45 50 60 55 Q70 60 72 75 Q68 90 62 100 Q50 115 40 108 Q35 98 35 82 Q30 72 35 55"
          fill="url(#landGradient)"
        />
        
        {/* 南美洲 */}
        <path
          d="M60 108 Q70 102 75 112 Q80 125 75 145 Q65 150 62 135 Q58 120 60 108"
          fill="url(#landGradient)"
        />
        
        {/* 欧洲 */}
        <path
          d="M90 50 Q105 45 115 52 Q120 58 118 70 Q112 78 100 76 Q92 72 88 62 Q85 55 90 50"
          fill="url(#landGradient)"
        />
        
        {/* 非洲 */}
        <path
          d="M92 75 Q100 70 110 75 Q125 78 130 92 Q135 110 130 130 Q120 145 110 140 Q100 135 95 120 Q92 100 92 75"
          fill="url(#landGradient)"
        />
        
        {/* 亚洲 */}
        <path
          d="M115 45 Q140 40 165 50 Q175 60 178 78 Q175 95 165 102 Q145 110 130 105 Q118 98 115 88 Q112 75 115 60 Q113 50 115 45"
          fill="url(#landGradient)"
        />
        
        {/* 东南亚 */}
        <path
          d="M145 95 L155 98 L152 112 L142 102 Z"
          fill="url(#landGradient)"
        />
        
        {/* 澳大利亚 */}
        <path
          d="M160 120 Q175 115 182 122 Q185 132 178 142 Q170 148 162 142 Q158 132 160 120"
          fill="url(#landGradient)"
        />
        
        {/* 格陵兰 */}
        <path
          d="M50 42 Q60 35 65 45 Q68 52 60 55 Q50 55 45 48 Q45 42 50 42"
          fill="url(#landGradient)"
        />
        
        {/* 高光效果 */}
        <ellipse
          cx="70"
          cy="70"
          rx="25"
          ry="15"
          fill="url(#highlight)"
          transform="rotate(-30 70 70)"
        />
      </svg>
    </div>
  );
}
