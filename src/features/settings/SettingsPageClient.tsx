"use client";

import { useState, useRef, useActionState, startTransition, useEffect } from "react";
import { updateProfileAction } from "@/features/profile/actions";
import type { ActionResult, SettingRequest } from "@/lib/settings";
import {
  createSettingRequestAction,
  approveSettingRequestAction,
  rejectSettingRequestAction,
  cancelSettingRequestAction,
  updatePartnerNicknameAction,
} from "@/lib/settings-actions";
import { getSettingsFeedback } from "@/features/settings/feedback";
import { calculateRelationshipDays } from "@/lib/date/relationship-days";

export function SettingsPageClient({
  profile: initialProfile,
  email,
  spaceName: initialSpaceName,
  partner,
  settings,
}: {
  profile: {
    id: string;
    login_name: string;
    display_name: string;
    avatar_url: string | null;
    partner_nickname: string | null;
    relationship_started_on: string;
  };
  email: string;
  spaceName: string;
  partner: {
    id: string;
    display_name: string;
    avatar_url?: string | null;
  } | undefined;
  settings: {
    spaceName: string;
    relationshipStartedOn: string;
    pendingRequests: SettingRequest[];
  };
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [spaceName] = useState(initialSpaceName);
  const [message, setMessage] = useState("");
  
  // Partner nickname feedback state
  const [partnerNicknameFeedback, setPartnerNicknameFeedback] = useState<{
    status: "idle" | "saving" | "success" | "error";
    message: string;
  }>({ status: "idle", message: "" });
  
  // Modal states
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showChangeEmailModal, setShowChangeEmailModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  
  // Edit states
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameValue, setNicknameValue] = useState(profile.display_name);
  const [partnerNicknameValue, setPartnerNicknameValue] = useState(profile.partner_nickname || "");
  const [spaceNameValue, setSpaceNameValue] = useState(spaceName);
  const [dateValue, setDateValue] = useState(settings.relationshipStartedOn);
  
  // Form refs
  const avatarInputRef = useRef<HTMLInputElement>(null);
  
  // Server actions with useActionState
  const [createRequestState, createRequestAction] = useActionState<ActionResult, FormData>(
    createSettingRequestAction,
    { ok: true, message: "" }
  );
  
  const [approveState, approveAction] = useActionState<ActionResult, FormData>(
    approveSettingRequestAction,
    { ok: true, message: "" }
  );
  
  const [rejectState, rejectAction] = useActionState<ActionResult, FormData>(
    rejectSettingRequestAction,
    { ok: true, message: "" }
  );
  
  const [cancelState, cancelAction] = useActionState<ActionResult, FormData>(
    cancelSettingRequestAction,
    { ok: true, message: "" }
  );
  
  const [partnerNicknameState, partnerNicknameAction] = useActionState<ActionResult, FormData>(
    updatePartnerNicknameAction,
    { ok: true, message: "" }
  );
  
  const handleSaveNickname = async () => {
    if (!nicknameValue.trim() || nicknameValue.length > 24) {
      return;
    }
    
    const formData = new FormData();
    formData.append("displayName", nicknameValue);
    formData.append("relationshipStartedOn", profile.relationship_started_on);
    formData.append("spaceName", spaceName);
    
    const result = await updateProfileAction(formData);
    if (result.ok) {
      setProfile(prev => ({ ...prev, display_name: nicknameValue }));
      setEditingNickname(false);
    } else {
      setMessage(result.message);
      setTimeout(() => setMessage(""), 3000);
    }
  };
  
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append("avatar", file);
    formData.append("displayName", profile.display_name);
    formData.append("relationshipStartedOn", profile.relationship_started_on);
    formData.append("spaceName", spaceName);
    
    const result = await updateProfileAction(formData);
    if (result.ok) {
      window.location.reload();
    } else {
      setMessage(result.message);
      setTimeout(() => setMessage(""), 3000);
    }
  };
  
  const handleSavePartnerNickname = () => {
    if (!partnerNicknameValue.trim()) return;
    
    // Show saving state
    setPartnerNicknameFeedback({ status: "saving", message: "正在保存…" });
    
    const formData = new FormData();
    formData.append("nickname", partnerNicknameValue);
    
    startTransition(() => {
      partnerNicknameAction(formData);
    });
  };
  
  // Watch for partner nickname action result
  useEffect(() => {
    if (partnerNicknameFeedback.status === "saving") {
      // Wait a bit for state to update
      const timer = setTimeout(() => {
        if (partnerNicknameState.ok) {
          // Update profile immediately
          setProfile(prev => ({ ...prev, partner_nickname: partnerNicknameValue }));
          // Show success feedback
          setPartnerNicknameFeedback({ status: "success", message: "✓ 已保存" });
          // Auto hide after 2.5 seconds
          setTimeout(() => {
            setPartnerNicknameFeedback({ status: "idle", message: "" });
          }, 2500);
        } else if (partnerNicknameState.message) {
          // Show error feedback
          setPartnerNicknameFeedback({ status: "error", message: "暂时没有保存好，请再试一次" });
          setTimeout(() => {
            setPartnerNicknameFeedback({ status: "idle", message: "" });
          }, 3000);
        }
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [partnerNicknameState, partnerNicknameFeedback.status, partnerNicknameValue]);
  
  const handleCreateSpaceNameRequest = () => {
    if (!spaceNameValue.trim() || spaceNameValue.length > 40) return;
    if (spaceNameValue === spaceName) return;
    
    const formData = new FormData();
    formData.append("type", "space_name");
    formData.append("currentValue", spaceName);
    formData.append("proposedValue", spaceNameValue);
    startTransition(() => {
      createRequestAction(formData);
    });
  };
  
  const handleCreateDateRequest = () => {
    if (dateValue > new Date().toISOString().split("T")[0]) return;
    if (dateValue === settings.relationshipStartedOn) return;
    
    const formData = new FormData();
    formData.append("type", "relationship_started_on");
    formData.append("currentValue", settings.relationshipStartedOn);
    formData.append("proposedValue", dateValue);
    startTransition(() => {
      createRequestAction(formData);
    });
  };
  
  const handleApproveRequest = (requestId: string) => {
    const formData = new FormData();
    formData.append("requestId", requestId);
    startTransition(() => {
      approveAction(formData);
    });
  };
  
  const handleRejectRequest = (requestId: string) => {
    const formData = new FormData();
    formData.append("requestId", requestId);
    startTransition(() => {
      rejectAction(formData);
    });
  };
  
  const handleCancelRequest = (requestId: string) => {
    const formData = new FormData();
    formData.append("requestId", requestId);
    startTransition(() => {
      cancelAction(formData);
    });
  };
  
  const calculateDays = (startDate: string): number => calculateRelationshipDays(startDate);
  
  const spaceNameRequest = settings.pendingRequests.find(r => r.setting_type === "space_name");
  const dateRequest = settings.pendingRequests.find(r => r.setting_type === "relationship_started_on");
  const feedbackMessage = getSettingsFeedback(message, [
    createRequestState,
    approveState,
    rejectState,
    cancelState,
  ]);

  return (
    <div className="max-w-[860px] mx-auto pb-24">
      {/* Header */}
      <header className="text-center mb-8">
        <p className="text-sm font-semibold tracking-[0.22em] text-[var(--rose)]">SETTINGS</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">我们的小世界</h1>
        <p className="mt-2 text-sm text-[var(--muted-ink)]">
          把彼此的称呼、故事起点和这个空间，轻轻整理在这里。
        </p>
      </header>

      {feedbackMessage ? (
        <p className="mb-6 rounded-2xl bg-white/70 px-4 py-3 text-sm text-[var(--muted-ink)]" role="status">
          {feedbackMessage}
        </p>
      ) : null}

      {/* 关于我 */}
      <section className="bg-gradient-to-br from-[var(--rose)]/10 to-[var(--gold)]/10 rounded-3xl p-6 mb-6">
        <h2 className="font-serif text-xl font-semibold mb-4">关于我</h2>
        
        <div className="flex items-center gap-4">
          <div className="relative cursor-pointer" onClick={() => setShowAvatarModal(true)}>
            <div className="w-16 h-16 rounded-full bg-white overflow-hidden shadow-sm">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl">♡</div>
              )}
            </div>
            <button className="absolute -bottom-1 -right-1 w-6 h-6 bg-[var(--rose)] rounded-full flex items-center justify-center text-white text-xs shadow-md hover:bg-[var(--rose)]/90 transition">
              ✏️
            </button>
          </div>
          <div className="flex-1">
            {editingNickname ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nicknameValue}
                  onChange={(e) => setNicknameValue(e.target.value)}
                  onBlur={handleSaveNickname}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveNickname()}
                  className="flex-1 px-3 py-2 text-sm border border-[var(--muted-ink)]/20 rounded-lg focus:outline-none focus:border-[var(--rose)]/50"
                  autoFocus
                />
                <button onClick={handleSaveNickname} className="px-3 py-2 text-sm bg-[var(--rose)]/10 text-[var(--rose)] rounded-lg hover:bg-[var(--rose)]/20 transition">
                  保存
                </button>
              </div>
            ) : (
              <>
                <p className="font-medium">{profile.display_name}</p>
                <button onClick={() => setEditingNickname(true)} className="text-xs text-[var(--muted-ink)] hover:text-[var(--rose)] transition">
                  修改昵称
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 关于 ta */}
      <section className="bg-white/70 backdrop-blur-sm rounded-3xl p-6 mb-6">
        <h2 className="font-serif text-xl font-semibold mb-4">关于 ta</h2>
        
        {partner ? (
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-white overflow-hidden shadow-sm">
              {partner.avatar_url ? (
                <img src={partner.avatar_url} alt={partner.display_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl">♡</div>
              )}
            </div>
            <div>
              <p className="font-medium">{partner.display_name}</p>
              {partnerNicknameValue && (
                <p className="text-sm text-[var(--rose)]">我称呼 TA：{partnerNicknameValue}</p>
              )}
            </div>
          </div>
        ) : null}
        
        <div>
          <label className="block text-sm text-[var(--muted-ink)] mb-2">我对 ta 的爱称</label>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={partnerNicknameValue}
              onChange={(e) => setPartnerNicknameValue(e.target.value.slice(0, 12))}
              placeholder="给对方起个温柔的称呼"
              maxLength={12}
              className="flex-1 px-4 py-3 bg-white border border-[var(--muted-ink)]/10 rounded-xl text-sm focus:outline-none focus:border-[var(--rose)]/30 transition"
            />
            <button
              onClick={handleSavePartnerNickname}
              disabled={!partnerNicknameValue.trim()}
              className="px-4 py-3 bg-[var(--rose)]/10 text-[var(--rose)] rounded-xl text-sm hover:bg-[var(--rose)]/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              保存
            </button>
            {(partnerNicknameFeedback.status !== "idle") && (
              <span 
                className={`text-sm transition-opacity duration-300 ${
                  partnerNicknameFeedback.status === "success" 
                    ? "text-green-600" 
                    : partnerNicknameFeedback.status === "error" 
                      ? "text-red-500" 
                      : "text-[var(--muted-ink)]"
                }`}
              >
                {partnerNicknameFeedback.message}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--muted-ink)]">写信时会使用这个称呼，最多 12 个字符</p>
        </div>
      </section>

      {/* 关于我们 */}
      <section className="bg-white/70 backdrop-blur-sm rounded-3xl p-6 mb-6">
        <h2 className="font-serif text-xl font-semibold mb-4">关于我们</h2>
        
        <div className="space-y-6">
          {/* 空间名称 */}
          <div>
            <label className="block text-sm text-[var(--muted-ink)] mb-2">空间名称</label>
            
            {spaceNameRequest ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">{spaceName}</span>
                  <span className="text-xs px-2 py-1 rounded-full bg-[var(--gold)]/20 text-[var(--gold)]">
                    等待对方确认
                  </span>
                </div>
                <div className="p-3 bg-[var(--muted-ink)]/5 rounded-xl">
                  <p className="text-sm">申请修改为：<strong>{spaceNameRequest.proposed_value}</strong></p>
                  <button
                    onClick={() => handleCancelRequest(spaceNameRequest.id)}
                    className="mt-2 text-xs text-[var(--rose)] hover:text-[var(--rose)]/80"
                  >
                    取消申请
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={spaceNameValue}
                  onChange={(e) => setSpaceNameValue(e.target.value.slice(0, 40))}
                  maxLength={40}
                  className="flex-1 px-4 py-3 bg-white border border-[var(--muted-ink)]/10 rounded-xl text-sm focus:outline-none focus:border-[var(--rose)]/30 transition"
                />
                <button
                  onClick={handleCreateSpaceNameRequest}
                  disabled={!spaceNameValue.trim() || spaceNameValue === spaceName}
                  className="px-4 py-3 bg-[var(--rose)]/10 text-[var(--rose)] rounded-xl text-sm hover:bg-[var(--rose)]/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  邀请确认
                </button>
              </div>
            )}
          </div>
          
          {/* 开始日期 */}
          <div>
            <label className="block text-sm text-[var(--muted-ink)] mb-2">
              我们开始的日子
            </label>
            
            {dateRequest ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">{settings.relationshipStartedOn}</span>
                  <span className="text-xs px-2 py-1 rounded-full bg-[var(--gold)]/20 text-[var(--gold)]">
                    等待对方确认
                  </span>
                </div>
                <div className="p-3 bg-[var(--muted-ink)]/5 rounded-xl">
                  <p className="text-sm">申请修改为：<strong>{dateRequest.proposed_value}</strong></p>
                  <button
                    onClick={() => handleCancelRequest(dateRequest.id)}
                    className="mt-2 text-xs text-[var(--rose)] hover:text-[var(--rose)]/80"
                  >
                    取消申请
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateValue}
                  onChange={(e) => setDateValue(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                  className="flex-1 px-4 py-3 bg-white border border-[var(--muted-ink)]/10 rounded-xl text-sm focus:outline-none focus:border-[var(--rose)]/30 transition"
                />
                <button
                  onClick={handleCreateDateRequest}
                  disabled={dateValue > new Date().toISOString().split("T")[0] || dateValue === settings.relationshipStartedOn}
                  className="px-4 py-3 bg-[var(--rose)]/10 text-[var(--rose)] rounded-xl text-sm hover:bg-[var(--rose)]/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  邀请确认
                </button>
              </div>
            )}
            <p className="mt-2 text-lg font-medium">已经一起 {calculateDays(settings.relationshipStartedOn)} 天</p>
          </div>
          
          {/* 待确认的申请 */}
          {(spaceNameRequest || dateRequest) && (
            <div className="pt-4 border-t border-[var(--muted-ink)]/10">
              <p className="text-xs text-[var(--muted-ink)] mb-3">待确认的修改</p>
              <div className="space-y-2">
                {spaceNameRequest && (
                  <div className="flex items-center justify-between p-3 bg-[var(--gold)]/10 rounded-xl">
                    <span className="text-sm">空间名称修改申请</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRejectRequest(spaceNameRequest.id)}
                        className="px-3 py-1 text-xs bg-white rounded-lg hover:bg-[var(--muted-ink)]/5 transition"
                      >
                        先保持现在
                      </button>
                      <button
                        onClick={() => handleApproveRequest(spaceNameRequest.id)}
                        className="px-3 py-1 text-xs bg-[var(--rose)]/10 text-[var(--rose)] rounded-lg hover:bg-[var(--rose)]/20 transition"
                      >
                        同意修改
                      </button>
                    </div>
                  </div>
                )}
                {dateRequest && (
                  <div className="flex items-center justify-between p-3 bg-[var(--gold)]/10 rounded-xl">
                    <span className="text-sm">开始日期修改申请</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRejectRequest(dateRequest.id)}
                        className="px-3 py-1 text-xs bg-white rounded-lg hover:bg-[var(--muted-ink)]/5 transition"
                      >
                        先保持现在
                      </button>
                      <button
                        onClick={() => handleApproveRequest(dateRequest.id)}
                        className="px-3 py-1 text-xs bg-[var(--rose)]/10 text-[var(--rose)] rounded-lg hover:bg-[var(--rose)]/20 transition"
                      >
                        同意修改
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 账号与安全 */}
      <section className="bg-white/50 rounded-3xl p-6">
        <h2 className="font-serif text-xl font-semibold mb-4">账号与安全</h2>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-white/50 rounded-xl">
            <span className="text-sm">当前登录邮箱</span>
            <span className="text-sm font-medium">{email}</span>
          </div>
          <button
            onClick={() => setShowChangeEmailModal(true)}
            className="w-full flex items-center justify-between p-3 hover:bg-white/50 rounded-xl transition"
          >
            <span className="text-sm">更换邮箱</span>
            <span className="text-[var(--muted-ink)]">›</span>
          </button>
          <button
            onClick={() => setShowChangePasswordModal(true)}
            className="w-full flex items-center justify-between p-3 hover:bg-white/50 rounded-xl transition"
          >
            <span className="text-sm">修改密码</span>
            <span className="text-[var(--muted-ink)]">›</span>
          </button>
          <button className="w-full flex items-center justify-between p-3 hover:bg-white/50 rounded-xl transition text-[var(--rose)]">
            <span className="text-sm">退出登录</span>
            <span>›</span>
          </button>
        </div>
      </section>

      {/* Avatar Modal */}
      {showAvatarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">更换头像</h3>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarUpload}
              className="hidden"
              id="avatar-upload"
            />
            <div
              onClick={() => avatarInputRef.current?.click()}
              className="w-full aspect-square bg-[var(--muted-ink)]/5 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-[var(--muted-ink)]/10 transition"
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-32 h-32 rounded-full object-cover" />
              ) : (
                <span className="text-4xl">📷</span>
              )}
              <p className="mt-2 text-sm text-[var(--muted-ink)]">点击上传新头像</p>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowAvatarModal(false)}
                className="px-4 py-2 text-sm bg-[var(--muted-ink)]/10 rounded-lg hover:bg-[var(--muted-ink)]/20 transition"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Email Modal */}
      {showChangeEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">更换邮箱</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--muted-ink)] mb-1">当前邮箱</label>
                <p className="text-sm font-medium">{email}</p>
              </div>
              <div>
                <label className="block text-sm text-[var(--muted-ink)] mb-1">新邮箱</label>
                <input
                  type="email"
                  placeholder="输入新邮箱地址"
                  className="w-full px-4 py-3 bg-[var(--muted-ink)]/5 border border-[var(--muted-ink)]/10 rounded-xl text-sm focus:outline-none focus:border-[var(--rose)]/30"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--muted-ink)] mb-1">验证码</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="输入验证码"
                    className="flex-1 px-4 py-3 bg-[var(--muted-ink)]/5 border border-[var(--muted-ink)]/10 rounded-xl text-sm focus:outline-none focus:border-[var(--rose)]/30"
                  />
                  <button className="px-4 py-3 bg-[var(--rose)]/10 text-[var(--rose)] rounded-xl text-sm hover:bg-[var(--rose)]/20 transition">
                    获取
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowChangeEmailModal(false)}
                className="px-4 py-2 text-sm bg-[var(--muted-ink)]/10 rounded-lg hover:bg-[var(--muted-ink)]/20 transition"
              >
                取消
              </button>
              <button className="px-4 py-2 text-sm bg-[var(--rose)] text-white rounded-lg hover:bg-[var(--rose)]/90 transition">
                确认更换
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">修改密码</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--muted-ink)] mb-1">当前密码</label>
                <input
                  type="password"
                  placeholder="输入当前密码"
                  className="w-full px-4 py-3 bg-[var(--muted-ink)]/5 border border-[var(--muted-ink)]/10 rounded-xl text-sm focus:outline-none focus:border-[var(--rose)]/30"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--muted-ink)] mb-1">新密码</label>
                <input
                  type="password"
                  placeholder="输入新密码"
                  className="w-full px-4 py-3 bg-[var(--muted-ink)]/5 border border-[var(--muted-ink)]/10 rounded-xl text-sm focus:outline-none focus:border-[var(--rose)]/30"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--muted-ink)] mb-1">确认新密码</label>
                <input
                  type="password"
                  placeholder="再次输入新密码"
                  className="w-full px-4 py-3 bg-[var(--muted-ink)]/5 border border-[var(--muted-ink)]/10 rounded-xl text-sm focus:outline-none focus:border-[var(--rose)]/30"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowChangePasswordModal(false)}
                className="px-4 py-2 text-sm bg-[var(--muted-ink)]/10 rounded-lg hover:bg-[var(--muted-ink)]/20 transition"
              >
                取消
              </button>
              <button className="px-4 py-2 text-sm bg-[var(--rose)] text-white rounded-lg hover:bg-[var(--rose)]/90 transition">
                确认修改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
