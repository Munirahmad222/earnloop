import { useState, useEffect, useRef, useCallback } from "react";
import { Coins, Users, PlayCircle, Wallet, Home, UserPlus, Copy, Check, LogOut, Video, MessageCircle, FileText, Upload, Volume2, VolumeX } from "lucide-react";

const SUPABASE_URL = "https://jzynfiopgqmpjnbglrjz.supabase.co";
const SUPABASE_KEY = "sb_publishable_AFTcbb2N7gIFo-eJMb0Zhg_8Cfg7hPI";
const FAKE_DOMAIN = "@earnloop.local";

const COLORS = {
  bg: "#0F241C",
  surface: "#153226",
  card: "#1D3C2E",
  gold: "#D4A94A",
  parchment: "#F6F1E4",
  sage: "#7FA383",
  rust: "#B5482F",
};

function toEmail(username) {
  return username.trim().toLowerCase() + FAKE_DOMAIN;
}
const genCode = (username) =>
  "LOOP-" + username.slice(0, 3).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

async function authRequest(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.error_description || data.error || "Auth error");
  return data;
}

async function restRequest(path, { method = "GET", token, body, extraHeaders = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token || SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || "Request failed");
  return data;
}

async function uploadFile(bucket, path, file, token) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("Upload failed: " + t);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

const RULES_TEXT = [
  "Har user sirf apna asli data (username, video, posts) submit kare.",
  "Ek se zyada fake accounts bana kar referral bonus lena mana hai.",
  "Video content saaf-suthra aur qanooni hona chahiye — koi bhi ghair-qanooni, pur-tashaddud, ya nafrat-angaiz mواد allowed nahi.",
  "Ad-watch aur video-watch earning sirf ek dafa har item par milegi.",
  "Cash-out minimum balance $10 hai.",
  "Rules todne par account suspend kiya ja sakta hai.",
];

const POLICY_TEXT = [
  "Hum aapka username, activity, aur wallet balance store karte hain taake app kaam kar sake.",
  "Aapki video sabko dikhengi (public feed) — kripya sirf wo content upload karein jo aap sabke saath share karna chahte hain.",
  "Hum aapka data kisi teesri party ko nahi bechte.",
  "Real payment/cash-out feature abhi setup ho raha hai — jab live hoga to alag policy update ki jayegi.",
  "Aap kabhi bhi apna account delete karne ki request kar sakte hain.",
];

export default function EarnLoopApp() {
  const [screen, setScreen] = useState("login");
  const [tab, setTab] = useState("feed");
  const [formUser, setFormUser] = useState("");
  const [formPass, setFormPass] = useState("");
  const [refInput, setRefInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [working, setWorking] = useState(false);

  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [postText, setPostText] = useState("");
  const [activity, setActivity] = useState([]);
  const [watchedIds, setWatchedIds] = useState(new Set());
  const [copied, setCopied] = useState(false);
  const [referralCount, setReferralCount] = useState(0);

  const [videos, setVideos] = useState([]);
  const [videoWatchedIds, setVideoWatchedIds] = useState(new Set());
  const [uploading, setUploading] = useState(false);
  const [muted, setMuted] = useState(true);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [wMethod, setWMethod] = useState("jazzcash");
  const [wName, setWName] = useState("");
  const [wAccount, setWAccount] = useState("");
  const [wError, setWError] = useState("");
  const [wSuccess, setWSuccess] = useState("");
  const [wWorking, setWWorking] = useState(false);
  const [withdrawals, setWithdrawals] = useState([]);

  async function loadEverything(token, userId) {
    const profRows = await restRequest(`profiles?id=eq.${userId}`, { token });
    const prof = profRows[0];
    setProfile(prof);

    const feed = await restRequest(`posts?select=*,profiles(username)&order=created_at.desc&limit=30`, { token });
    setPosts(feed);

    const act = await restRequest(`activity?user_id=eq.${userId}&order=created_at.desc&limit=20`, { token });
    setActivity(act);

    const watched = await restRequest(`ad_watches?user_id=eq.${userId}&select=post_id`, { token });
    setWatchedIds(new Set(watched.map((w) => w.post_id)));

    const vids = await restRequest(`videos?select=*,profiles(username)&order=created_at.desc&limit=30`, { token });
    setVideos(vids);

    const vwatched = await restRequest(`video_watches?user_id=eq.${userId}&select=video_id`, { token });
    setVideoWatchedIds(new Set(vwatched.map((w) => w.video_id)));

    const chat = await restRequest(`chat_messages?select=*,profiles(username)&order=created_at.desc&limit=50`, { token });
    setChatMessages(chat.reverse());

    const wds = await restRequest(`withdrawal_requests?user_id=eq.${userId}&order=created_at.desc&limit=20`, { token });
    setWithdrawals(wds);

    if (prof) {
      const refs = await restRequest(`profiles?referred_by=eq.${userId}&select=id`, { token });
      setReferralCount(refs.length);
    }
  }

  async function handleSignup() {
    setAuthError("");
    const uname = formUser.trim().toLowerCase();
    if (!uname || formPass.length < 6) {
      setAuthError("Username chahiye aur password kam se kam 6 characters ka ho.");
      return;
    }
    setWorking(true);
    try {
      const data = await authRequest("signup", { email: toEmail(uname), password: formPass });
      const token = data.access_token;
      const userId = data.user?.id;
      if (!token || !userId) {
        setAuthError("Signup hua, lekin auto-login nahi hua. Supabase me 'Confirm email' OFF check karein.");
        setWorking(false);
        return;
      }
      const code = genCode(uname);
      await restRequest("profiles", { method: "POST", token, body: { id: userId, username: uname, referral_code: code, balance: 0 } });
      const ref = refInput.trim().toUpperCase();
      if (ref) await restRequest("rpc/apply_referral", { method: "POST", token, body: { new_user_id: userId, ref_code: ref } });

      setSession({ token, userId });
      await loadEverything(token, userId);
      setScreen("app");
    } catch (e) {
      setAuthError("Signup fail: " + e.message);
    }
    setWorking(false);
  }

  async function handleLogin() {
    setAuthError("");
    const uname = formUser.trim().toLowerCase();
    setWorking(true);
    try {
      const data = await authRequest("token?grant_type=password", { email: toEmail(uname), password: formPass });
      const token = data.access_token;
      const userId = data.user?.id;
      setSession({ token, userId });
      await loadEverything(token, userId);
      setScreen("app");
    } catch (e) {
      setAuthError("Login fail: username ya password ghalat hai.");
    }
    setWorking(false);
  }

  function handleLogout() {
    setSession(null);
    setProfile(null);
    setScreen("login");
    setFormUser("");
    setFormPass("");
  }

  async function watchAd(postId) {
    if (!session || watchedIds.has(postId)) return;
    try {
      await restRequest("rpc/credit_ad_watch", { method: "POST", token: session.token, body: { p_user_id: session.userId, p_post_id: postId } });
      setWatchedIds((prev) => new Set(prev).add(postId));
      setProfile((p) => ({ ...p, balance: +(p.balance + 0.15).toFixed(2) }));
      setActivity((prev) => [{ label: "Ad watched", amount: 0.15, created_at: new Date().toISOString() }, ...prev]);
    } catch {}
  }

  async function creditVideoWatch(videoId) {
    if (!session || videoWatchedIds.has(videoId)) return;
    try {
      await restRequest("rpc/credit_video_watch", { method: "POST", token: session.token, body: { p_user_id: session.userId, p_video_id: videoId } });
      setVideoWatchedIds((prev) => new Set(prev).add(videoId));
      setProfile((p) => ({ ...p, balance: +(p.balance + 0.2).toFixed(2) }));
      setActivity((prev) => [{ label: "Video watched", amount: 0.2, created_at: new Date().toISOString() }, ...prev]);
    } catch {}
  }

  async function submitPost() {
    if (!postText.trim() || !session) return;
    try {
      await restRequest("posts", { method: "POST", token: session.token, body: { user_id: session.userId, text: postText.trim() } });
      setPostText("");
      const feed = await restRequest(`posts?select=*,profiles(username)&order=created_at.desc&limit=30`, { token: session.token });
      setPosts(feed);
    } catch (e) {
      setAuthError("Post fail: " + e.message);
    }
  }

  async function handleVideoUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    setUploading(true);
    try {
      const path = `${session.userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const url = await uploadFile("videos", path, file, session.token);
      await restRequest("videos", { method: "POST", token: session.token, body: { user_id: session.userId, video_url: url, caption: "" } });
      const vids = await restRequest(`videos?select=*,profiles(username)&order=created_at.desc&limit=30`, { token: session.token });
      setVideos(vids);
    } catch (err) {
      setAuthError("Video upload fail: " + err.message);
    }
    setUploading(false);
  }

  async function sendChat() {
    if (!chatInput.trim() || !session) return;
    try {
      await restRequest("chat_messages", { method: "POST", token: session.token, body: { user_id: session.userId, text: chatInput.trim() } });
      setChatInput("");
      const chat = await restRequest(`chat_messages?select=*,profiles(username)&order=created_at.desc&limit=50`, { token: session.token });
      setChatMessages(chat.reverse());
    } catch {}
  }

  async function submitWithdrawal() {
    setWError("");
    setWSuccess("");
    const amount = profile?.balance || 0;
    if (!wName.trim() || !wAccount.trim()) {
      setWError("Account name aur account number/JazzCash number dono chahiye.");
      return;
    }
    if (amount < 10) {
      setWError("Minimum withdrawal $10 hai.");
      return;
    }
    setWWorking(true);
    try {
      await restRequest("rpc/request_withdrawal", {
        method: "POST",
        token: session.token,
        body: { p_user_id: session.userId, p_amount: amount, p_method: wMethod, p_account_name: wName.trim(), p_account_number: wAccount.trim() },
      });
      setProfile((p) => ({ ...p, balance: 0 }));
      setActivity((prev) => [{ label: "Withdrawal requested", amount: -amount, created_at: new Date().toISOString() }, ...prev]);
      setWithdrawals((prev) => [{ amount, method: wMethod, status: "pending", created_at: new Date().toISOString() }, ...prev]);
      setWSuccess("Request submit ho gayi! Aapko 1-3 din me payment mil jayegi.");
      setWName("");
      setWAccount("");
      setTimeout(() => setShowWithdraw(false), 2000);
    } catch (e) {
      setWError(e.message);
    }
    setWWorking(false);
  }

  function copyCode() {
    if (!profile) return;
    navigator.clipboard?.writeText(profile.referral_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.card}`,
    background: COLORS.surface, color: COLORS.parchment, fontSize: 15,
    fontFamily: "'Helvetica Neue', sans-serif", marginBottom: 12, boxSizing: "border-box",
  };

  const wrap = (children) => (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.parchment, fontFamily: "'Georgia', serif", display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto" }}>
      {children}
    </div>
  );

  if (screen === "login" || screen === "signup") {
    return wrap(
      <div style={{ padding: 24, display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 28, fontWeight: 700 }}>EarnLoop</div>
          <div style={{ fontSize: 13, color: COLORS.sage, fontFamily: "'Helvetica Neue', sans-serif" }}>earn together, cash out together</div>
        </div>
        <input style={inputStyle} placeholder="Username" value={formUser} onChange={(e) => setFormUser(e.target.value)} />
        <input style={inputStyle} placeholder="Password (6+ characters)" type="password" value={formPass} onChange={(e) => setFormPass(e.target.value)} />
        {screen === "signup" && <input style={inputStyle} placeholder="Referral code (optional)" value={refInput} onChange={(e) => setRefInput(e.target.value)} />}
        {authError && <div style={{ color: COLORS.rust, fontSize: 13, marginBottom: 12, fontFamily: "'Helvetica Neue', sans-serif" }}>{authError}</div>}
        <button onClick={screen === "login" ? handleLogin : handleSignup} disabled={working}
          style={{ background: COLORS.gold, color: COLORS.bg, border: "none", borderRadius: 10, padding: "12px", fontWeight: 700, fontSize: 15, fontFamily: "'Helvetica Neue', sans-serif", cursor: "pointer", marginBottom: 14 }}>
          {working ? "..." : screen === "login" ? "Log in" : "Sign up"}
        </button>
        <button onClick={() => { setScreen(screen === "login" ? "signup" : "login"); setAuthError(""); }}
          style={{ background: "none", border: "none", color: COLORS.sage, fontFamily: "'Helvetica Neue', sans-serif", fontSize: 13, cursor: "pointer" }}>
          {screen === "login" ? "Naya account banayein" : "Pehle se account hai? Log in"}
        </button>
      </div>
    );
  }

  return wrap(
    <>
      <header style={{ padding: "14px 20px 12px", borderBottom: `1px solid ${COLORS.card}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>EarnLoop</div>
          <div style={{ fontSize: 11, color: COLORS.sage, fontFamily: "'Helvetica Neue', sans-serif" }}>@{profile?.username}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.card, padding: "6px 12px", borderRadius: 20, border: `1px solid ${COLORS.gold}44` }}>
            <Coins size={16} color={COLORS.gold} />
            <span style={{ fontFamily: "'Helvetica Neue', sans-serif", fontWeight: 600 }}>${profile?.balance?.toFixed(2)}</span>
          </div>
          <button onClick={handleLogout} style={{ background: "none", border: "none", color: COLORS.sage, cursor: "pointer" }}><LogOut size={18} /></button>
        </div>
      </header>

      <main style={{ flex: 1, overflowY: tab === "videos" ? "hidden" : "auto", padding: tab === "videos" ? 0 : 16, paddingBottom: tab === "videos" ? 0 : 90 }}>
        {tab === "feed" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} placeholder="Share something..." value={postText} onChange={(e) => setPostText(e.target.value)} />
              <button onClick={submitPost} style={{ background: COLORS.gold, color: COLORS.bg, border: "none", borderRadius: 10, padding: "0 16px", fontWeight: 700, cursor: "pointer", fontFamily: "'Helvetica Neue', sans-serif" }}>Post</button>
            </div>
            {posts.map((p) => {
              const watched = watchedIds.has(p.id);
              return (
                <div key={p.id} style={{ background: COLORS.surface, borderRadius: 14, padding: 16, border: `1px solid ${COLORS.card}` }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>@{p.profiles?.username || "unknown"}</div>
                  <p style={{ fontSize: 15, lineHeight: 1.5, margin: "0 0 12px", fontFamily: "'Helvetica Neue', sans-serif" }}>{p.text}</p>
                  <button onClick={() => watchAd(p.id)} disabled={watched}
                    style={{ display: "flex", alignItems: "center", gap: 8, background: watched ? "transparent" : COLORS.gold, color: watched ? COLORS.sage : COLORS.bg, border: watched ? `1px solid ${COLORS.sage}` : "none", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, fontFamily: "'Helvetica Neue', sans-serif", cursor: watched ? "default" : "pointer" }}>
                    <PlayCircle size={16} />
                    {watched ? "Credited +$0.15" : "Watch to earn $0.15"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === "videos" && (
          <VideoFeed
            videos={videos}
            watchedIds={videoWatchedIds}
            onEarn={creditVideoWatch}
            muted={muted}
            setMuted={setMuted}
            colors={COLORS}
          />
        )}

        {tab === "invite" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: COLORS.card, borderRadius: 16, padding: 22, textAlign: "center", border: `1px solid ${COLORS.gold}44` }}>
              <Users size={28} color={COLORS.gold} style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 15, fontFamily: "'Helvetica Neue', sans-serif", marginBottom: 4 }}>Earn $1.00 for every friend who joins</div>
              <div style={{ fontSize: 12, color: COLORS.sage, fontFamily: "'Helvetica Neue', sans-serif" }}>They get $0.50 credit too, once they sign up with your code.</div>
            </div>
            <div style={{ background: COLORS.surface, borderRadius: 12, padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px dashed ${COLORS.sage}66` }}>
              <span style={{ fontFamily: "monospace", fontSize: 16, letterSpacing: 1 }}>{profile?.referral_code}</span>
              <button onClick={copyCode} style={{ background: "none", border: "none", color: COLORS.gold, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "'Helvetica Neue', sans-serif", fontSize: 13 }}>
                {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div style={{ fontSize: 13, color: COLORS.sage, fontFamily: "'Helvetica Neue', sans-serif" }}>{referralCount} friend{referralCount === 1 ? "" : "s"} joined so far.</div>
          </div>
        )}

        {tab === "wallet" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: `linear-gradient(135deg, ${COLORS.card}, ${COLORS.surface})`, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.gold}55` }}>
              <div style={{ fontSize: 12, color: COLORS.sage, fontFamily: "'Helvetica Neue', sans-serif" }}>Available balance</div>
              <div style={{ fontSize: 34, fontWeight: 700, color: COLORS.gold, margin: "6px 0" }}>${profile?.balance?.toFixed(2)}</div>
              <button onClick={() => setShowWithdraw(true)} disabled={!profile || profile.balance < 10}
                style={{ marginTop: 10, background: profile && profile.balance >= 10 ? COLORS.gold : COLORS.card, color: profile && profile.balance >= 10 ? COLORS.bg : COLORS.sage, border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontFamily: "'Helvetica Neue', sans-serif", cursor: profile && profile.balance >= 10 ? "pointer" : "default" }}>
                Cash out (min. $10)
              </button>
            </div>

            {showWithdraw && (
              <div style={{ background: COLORS.surface, borderRadius: 14, padding: 18, border: `1px solid ${COLORS.gold}44`, fontFamily: "'Helvetica Neue', sans-serif" }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Withdrawal request — ${profile?.balance?.toFixed(2)}</div>
                <select value={wMethod} onChange={(e) => setWMethod(e.target.value)} style={{ ...inputStyle }}>
                  <option value="jazzcash">JazzCash</option>
                  <option value="easypaisa">Easypaisa</option>
                  <option value="bank">Bank Transfer</option>
                </select>
                <input style={inputStyle} placeholder="Account holder ka naam" value={wName} onChange={(e) => setWName(e.target.value)} />
                <input style={inputStyle} placeholder={wMethod === "bank" ? "Account number" : "Mobile number"} value={wAccount} onChange={(e) => setWAccount(e.target.value)} />
                {wError && <div style={{ color: COLORS.rust, fontSize: 13, marginBottom: 10 }}>{wError}</div>}
                {wSuccess && <div style={{ color: COLORS.sage, fontSize: 13, marginBottom: 10 }}>{wSuccess}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={submitWithdrawal} disabled={wWorking} style={{ flex: 1, background: COLORS.gold, color: COLORS.bg, border: "none", borderRadius: 10, padding: "10px", fontWeight: 700, cursor: "pointer" }}>
                    {wWorking ? "..." : "Request bhejo"}
                  </button>
                  <button onClick={() => setShowWithdraw(false)} style={{ flex: 1, background: "none", border: `1px solid ${COLORS.card}`, color: COLORS.sage, borderRadius: 10, padding: "10px", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div style={{ fontFamily: "'Helvetica Neue', sans-serif" }}>
              <div style={{ fontSize: 13, color: COLORS.sage, marginBottom: 10 }}>Recent activity</div>
              {activity.length === 0 && <div style={{ fontSize: 13, color: COLORS.sage }}>Koi activity nahi hai abhi.</div>}
              {activity.map((row, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${COLORS.card}`, fontSize: 14 }}>
                  <span>{row.label}</span><span style={{ color: row.amount < 0 ? COLORS.rust : COLORS.sage }}>{row.amount < 0 ? "-" : "+"}${Math.abs(row.amount)}</span>
                </div>
              ))}
            </div>

            {withdrawals.length > 0 && (
              <div style={{ fontFamily: "'Helvetica Neue', sans-serif" }}>
                <div style={{ fontSize: 13, color: COLORS.sage, marginBottom: 10 }}>Withdrawal history</div>
                {withdrawals.map((w, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${COLORS.card}`, fontSize: 14 }}>
                    <span>{w.method} — ${w.amount}</span>
                    <span style={{ color: w.status === "paid" ? COLORS.sage : w.status === "rejected" ? COLORS.rust : COLORS.gold }}>{w.status}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button onClick={() => setTab("policy")} style={{ flex: 1, background: "none", border: `1px solid ${COLORS.card}`, color: COLORS.sage, borderRadius: 10, padding: "10px", fontSize: 13, fontFamily: "'Helvetica Neue', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <FileText size={14} /> Policy
              </button>
              <button onClick={() => setTab("rules")} style={{ flex: 1, background: "none", border: `1px solid ${COLORS.card}`, color: COLORS.sage, borderRadius: 10, padding: "10px", fontSize: 13, fontFamily: "'Helvetica Neue', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <FileText size={14} /> Rules
              </button>
            </div>
          </div>
        )}

        {tab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 200px)" }}>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
              {chatMessages.map((m) => (
                <div key={m.id} style={{ background: COLORS.surface, borderRadius: 10, padding: "8px 12px", fontFamily: "'Helvetica Neue', sans-serif", fontSize: 14 }}>
                  <span style={{ color: COLORS.gold, fontWeight: 700 }}>@{m.profiles?.username}: </span>
                  <span>{m.text}</span>
                </div>
              ))}
              {chatMessages.length === 0 && <div style={{ fontSize: 13, color: COLORS.sage, textAlign: "center" }}>Koi message nahi hai abhi.</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} placeholder="Message likhein..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} />
              <button onClick={sendChat} style={{ background: COLORS.gold, color: COLORS.bg, border: "none", borderRadius: 10, padding: "0 16px", fontWeight: 700, cursor: "pointer", fontFamily: "'Helvetica Neue', sans-serif" }}>Send</button>
            </div>
          </div>
        )}

        {tab === "policy" && <TextPage title="Privacy Policy" items={POLICY_TEXT} colors={COLORS} onBack={() => setTab("wallet")} />}
        {tab === "rules" && <TextPage title="Rules" items={RULES_TEXT} colors={COLORS} onBack={() => setTab("wallet")} />}
      </main>

      {tab === "videos" && (
        <label style={{ position: "absolute", bottom: 90, right: 16, background: COLORS.gold, color: COLORS.bg, borderRadius: "50%", width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}>
          {uploading ? "..." : <Upload size={22} />}
          <input type="file" accept="video/*" onChange={handleVideoUpload} style={{ display: "none" }} disabled={uploading} />
        </label>
      )}

      <nav style={{ position: "sticky", bottom: 0, background: COLORS.surface, borderTop: `1px solid ${COLORS.card}`, display: "flex", justifyContent: "space-around", padding: "10px 0", fontFamily: "'Helvetica Neue', sans-serif" }}>
        {[
          { key: "feed", icon: Home, label: "Feed" },
          { key: "videos", icon: Video, label: "Videos" },
          { key: "invite", icon: UserPlus, label: "Invite" },
          { key: "chat", icon: MessageCircle, label: "Chat" },
          { key: "wallet", icon: Wallet, label: "Wallet" },
        ].map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setTab(key)} style={{ background: "none", border: "none", color: tab === key ? COLORS.gold : COLORS.sage, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 10, cursor: "pointer" }}>
            <Icon size={18} />{label}
          </button>
        ))}
      </nav>
    </>
  );
}

function TextPage({ title, items, colors, onBack }) {
  return (
    <div style={{ fontFamily: "'Helvetica Neue', sans-serif" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: colors.gold, marginBottom: 14, cursor: "pointer", fontSize: 13 }}>← Wapas</button>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>{title}</div>
      <ul style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((t, i) => (
          <li key={i} style={{ fontSize: 14, lineHeight: 1.6, color: colors.parchment }}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

function VideoFeed({ videos, watchedIds, onEarn, muted, setMuted, colors }) {
  const containerRef = useRef(null);
  const videoRefs = useRef({});
  const timersRef = useRef({});

  const handleIntersect = useCallback(
    (entries) => {
      entries.forEach((entry) => {
        const vid = entry.target;
        const videoId = vid.dataset.id;
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          vid.play().catch(() => {});
          if (!timersRef.current[videoId] && !watchedIds.has(videoId)) {
            timersRef.current[videoId] = setTimeout(() => {
              onEarn(videoId);
            }, 3000);
          }
        } else {
          vid.pause();
          if (timersRef.current[videoId]) {
            clearTimeout(timersRef.current[videoId]);
            delete timersRef.current[videoId];
          }
        }
      });
    },
    [onEarn, watchedIds]
  );

  useEffect(() => {
    const observer = new IntersectionObserver(handleIntersect, { threshold: [0, 0.6, 1] });
    Object.values(videoRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [videos, handleIntersect]);

  if (videos.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: colors.sage, fontFamily: "'Helvetica Neue', sans-serif", fontSize: 14, padding: 20, textAlign: "center" }}>
        Koi video nahi hai abhi. Neeche upload button se pehli video daalein.
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ height: "100%", overflowY: "scroll", scrollSnapType: "y mandatory" }}>
      {videos.map((v) => {
        const watched = watchedIds.has(v.id);
        return (
          <div key={v.id} style={{ height: "calc(100vh - 200px)", scrollSnapAlign: "start", position: "relative", background: "#000" }}>
            <video
              ref={(el) => (videoRefs.current[v.id] = el)}
              data-id={v.id}
              src={v.video_url}
              loop
              muted={muted}
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
            <div style={{ position: "absolute", bottom: 16, left: 16, right: 60, color: "#fff", fontFamily: "'Helvetica Neue', sans-serif" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>@{v.profiles?.username}</div>
              {v.caption && <div style={{ fontSize: 13, opacity: 0.9 }}>{v.caption}</div>}
              <div style={{ marginTop: 8, fontSize: 12, color: watched ? colors.sage : colors.gold, fontWeight: 700 }}>
                {watched ? "✓ Credited +$0.20" : "Watching 3s to earn $0.20..."}
              </div>
            </div>
            <button onClick={() => setMuted((m) => !m)} style={{ position: "absolute", top: 16, right: 16, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
