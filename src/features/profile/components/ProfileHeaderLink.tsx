"use client";

import Link from "next/link";
import { useState } from "react";

export function ProfileHeaderLink({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const [burst, setBurst] = useState(0);
  return (
    <Link href="/settings" className="profile-header-link" onMouseEnter={() => setBurst((value) => value + 1)}>
      <span className="profile-header-avatar">
        {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{name.slice(0, 1)}</span>}
        <span className="profile-heart-burst" key={burst} aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => <i key={index}>♥</i>)}
        </span>
      </span>
      <span className="max-[480px]:hidden">{name}</span>
      <span className="profile-love-copy">你值得被爱，勇敢去爱</span>
    </Link>
  );
}
