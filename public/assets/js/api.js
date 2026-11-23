const LOCAL_USER_KEY = "fittrack_demo_user_v1";
const LOCAL_STATE_KEY = "fittrack_demo_state_v1";

export const api = {
  backendAvailable: false,
  demoMode: false,

  async checkHealth() {
    if (window.location.protocol === "file:") {
      this.backendAvailable = false;
      return { ok: false, offline: true };
    }
    try {
      const res = await fetch("/api/health", { credentials: "include" });
      if (!res.ok) throw new Error("Health failed");
      const data = await res.json();
      this.backendAvailable = Boolean(data.ok && data.dbConnected);
      return data;
    } catch {
      this.backendAvailable = false;
      return { ok: false, offline: true };
    }
  },

  async sendOtp(mobile) {
    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ mobile }),
    });
    const data = await res.json().catch(() => ({ ok: false, error: "خطای سرور" }));
    if (!res.ok) throw new Error(data.error || "خطا در ارسال کد پیامکی");
    return data;
  },

  async verifyOtp(mobile, code) {
    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ mobile, code }),
    });
    const data = await res.json().catch(() => ({ ok: false, error: "خطای سرور" }));
    if (!res.ok) throw new Error(data.error || "کد تأیید نامعتبر است");
    this.demoMode = false;
    return data;
  },

  async getMe() {
    if (this.demoMode || !this.backendAvailable) {
      const raw = localStorage.getItem(LOCAL_USER_KEY);
      if (raw) {
        this.demoMode = true;
        return { authenticated: true, user: JSON.parse(raw) };
      }
      return { authenticated: false };
    }
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) return { authenticated: false };
      return await res.json();
    } catch {
      return { authenticated: false };
    }
  },

  loginDemo(mobile = "09120000000", name = "کاربر دمو") {
    this.demoMode = true;
    const existing = localStorage.getItem(LOCAL_USER_KEY);
    let user;
    if (existing) {
      user = JSON.parse(existing);
    } else {
      user = {
        id: "demo-local-user",
        mobile,
        full_name: name,
        age: 24,
        height_cm: 180,
        start_weight_kg: 81.5,
        goal: "recomp",
        target_kcal: 2200,
        target_protein: 150,
        selected_template: "hybrid_calisthenics",
      };
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
    }
    return { ok: true, isNewUser: !existing, user };
  },

  async updateProfile(profile) {
    if (this.demoMode || !this.backendAvailable) {
      const cur = JSON.parse(localStorage.getItem(LOCAL_USER_KEY) || "{}");
      const merged = { ...cur, ...profile };
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(merged));
      return { ok: true, user: merged };
    }
    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(profile),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "خطا در ذخیره پروفایل");
    return data;
  },

  async logout() {
    if (this.demoMode) {
      this.demoMode = false;
      localStorage.removeItem(LOCAL_USER_KEY);
      return { ok: true };
    }
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    return { ok: true };
  },

  async loadState() {
    if (this.demoMode || !this.backendAvailable) {
      try {
        const raw = localStorage.getItem(LOCAL_STATE_KEY);
        if (raw) return JSON.parse(raw);
      } catch {}
      return { ok: true, customProgram: null, days: {} };
    }
    const res = await fetch("/api/sync/state", { credentials: "include" });
    if (!res.ok) throw new Error("خطا در دریافت اطلاعات از سرور");
    return await res.json();
  },

  async saveFullState(payload) {
    if (this.demoMode || !this.backendAvailable) {
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify({
        ok: true,
        customProgram: payload.customProgram || null,
        days: payload.days || {},
        updatedAt: new Date().toISOString()
      }));
      return { ok: true, savedAt: new Date().toISOString(), local: true };
    }
    const res = await fetch("/api/sync/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("خطا در همگام‌سازی با کلودفلر");
    return await res.json();
  }
};
