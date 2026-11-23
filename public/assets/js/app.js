import { WEEKS_META, MEAL_PLANS, DAILY_HABITS, PROGRAM_TEMPLATES, cloneTemplateDays } from "./default-plan.js";
import { api } from "./api.js";
import { toFa, renderWeightChart, renderProteinSleepChart, computeKeyPRs } from "./charts.js";
import { buildStructuredDataset, buildAiPromptMarkdown, buildCsvExport, downloadTextFile } from "./ai-export.js";

let currentUser = null;
let daysData = cloneTemplateDays("hybrid_calisthenics");
let daysState = {};
let currentView = "calendar";
let currentWeekFilter = 0;
let activeDayNum = null;
let saveDebounceTimer = null;
let otpCooldownTimer = null;
let restTimer = null;
let restSeconds = 0;

// ---------- INIT ----------
async function init() {
  initTheme();
  registerSW();

  const health = await api.checkHealth();
  updateBackendStatusBadge(health);

  const me = await api.getMe();
  if (me && me.authenticated && me.user) {
    await enterApp(me.user);
  } else {
    showAuthScreen();
  }
}

function registerSW() {
  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

function updateBackendStatusBadge(health) {
  const el = document.getElementById("backendStatusText");
  const dot = document.getElementById("backendStatusDot");
  if (!el) return;
  if (health.ok && health.dbConnected) {
    dot.className = "status-dot dot-online";
    el.textContent = health.smsConfigured
      ? "متصل به کلودفلر D1 + سرویس پیامک SMS.ir"
      : "متصل به کلودفلر D1 (کلید SMS.ir تنظیم نشده)";
  } else {
    dot.className = "status-dot dot-offline";
    el.textContent = "حالت پیش‌نمایش آفلاین (برای تست سریع از دمو استفاده کن)";
  }
}

function showAuthScreen() {
  document.getElementById("authScreen").classList.remove("hidden");
  document.getElementById("appShell").classList.add("hidden");
}

async function enterApp(user) {
  currentUser = user;
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");

  updateSyncBadge(api.demoMode ? "local" : "synced");
  updateHeaderUser();

  try {
    const saved = await api.loadState();
    daysState = saved.days || {};
    if (saved.customProgram && Array.isArray(saved.customProgram) && saved.customProgram.length === 30) {
      daysData = saved.customProgram;
    } else {
      daysData = cloneTemplateDays(user.selected_template || "hybrid_calisthenics");
    }
  } catch (err) {
    showToast("خطا در بارگذاری اطلاعات: " + err.message);
  }

  renderAllViews();

  if (!user.full_name) {
    openProfileModal(true);
  }
}

function updateHeaderUser() {
  const name = currentUser.full_name || currentUser.mobile;
  document.getElementById("headerWelcome").textContent = `خوش اومدی ${name} • هدف روزانه: ${toFa(currentUser.target_kcal || 2200)} کالری و ${toFa(currentUser.target_protein || 150)} گرم پروتئین`;
}

function updateSyncBadge(status) {
  const badge = document.getElementById("syncBadge");
  if (status === "saving") {
    badge.className = "sync-badge saving";
    badge.textContent = "در حال ذخیره...";
  } else if (status === "local") {
    badge.className = "sync-badge local";
    badge.textContent = "حالت دمو (ذخیره محلی)";
  } else {
    badge.className = "sync-badge";
    badge.textContent = "همگام با کلودفلر ✓";
  }
}

function scheduleCloudSave() {
  updateSyncBadge("saving");
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(async () => {
    try {
      await api.saveFullState({ customProgram: daysData, days: daysState });
      updateSyncBadge(api.demoMode ? "local" : "synced");
    } catch {
      updateSyncBadge("local");
      showToast("خطا در همگام‌سازی ابری؛ اتصال اینترنت را چک کنید.");
    }
  }, 550);
}

// ---------- AUTH FLOW (SMS.ir OTP + DEMO) ----------
window.handleSendOtp = async function () {
  const mobileInput = document.getElementById("authMobile");
  const btn = document.getElementById("sendOtpBtn");
  const mobile = mobileInput.value.trim();
  if (!mobile) return showToast("شماره موبایل را وارد کن.");

  if (!api.backendAvailable) {
    return showToast("سرور کلودفلر متصل نیست؛ برای تست مستقیم دکمه «ورود سریع تستی» را بزن.");
  }

  btn.disabled = true;
  btn.textContent = "در حال ارسال پیامک...";
  try {
    const res = await api.sendOtp(mobile);
    document.getElementById("otpStep1").classList.add("hidden");
    document.getElementById("otpStep2").classList.remove("hidden");
    document.getElementById("otpSentMobile").textContent = toFa(res.mobile);
    document.getElementById("authOtpCode").focus();
    startOtpCooldown(res.cooldown || 60);
    if (res.devCode) {
      showToast(`حالت تست فعال است — کد تأیید: ${res.devCode}`);
    } else {
      showToast("کد تأیید ۶ رقمی از طریق SMS.ir ارسال شد.");
    }
  } catch (err) {
    showToast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "دریافت کد تأیید پیامکی";
  }
};

window.handleVerifyOtp = async function () {
  const mobile = document.getElementById("authMobile").value.trim();
  const code = document.getElementById("authOtpCode").value.trim();
  const btn = document.getElementById("verifyOtpBtn");
  if (code.length < 6) return showToast("کد ۶ رقمی را کامل وارد کن.");

  btn.disabled = true;
  btn.textContent = "در حال بررسی...";
  try {
    const res = await api.verifyOtp(mobile, code);
    showToast("ورود با موفقیت انجام شد!");
    await enterApp(res.user);
  } catch (err) {
    showToast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "ورود به حساب کاربری";
  }
};

window.backToMobileStep = function () {
  document.getElementById("otpStep2").classList.add("hidden");
  document.getElementById("otpStep1").classList.remove("hidden");
};

window.handleDemoLogin = async function () {
  const res = api.loginDemo();
  showToast("وارد حساب آزمایشی شدی (داده‌ها روی همین مرورگر ذخیره می‌شوند).");
  await enterApp(res.user);
};

window.handleLogout = async function () {
  if (!confirm("از حساب کاربری خارج می‌شوی؟")) return;
  await api.logout();
  currentUser = null;
  showAuthScreen();
  showToast("با موفقیت خارج شدی.");
};

function startOtpCooldown(sec) {
  let rem = sec;
  const el = document.getElementById("otpResendTimer");
  if (otpCooldownTimer) clearInterval(otpCooldownTimer);
  el.textContent = `ارسال مجدد تا ${toFa(rem)} ثانیه`;
  otpCooldownTimer = setInterval(() => {
    rem--;
    if (rem <= 0) {
      clearInterval(otpCooldownTimer);
      el.innerHTML = `<button class="btn" style="padding:4px 10px;font-size:0.75rem;" onclick="handleSendOtp()">ارسال مجدد کد</button>`;
    } else {
      el.textContent = `ارسال مجدد تا ${toFa(rem)} ثانیه`;
    }
  }, 1000);
}

// ---------- STATE HELPERS ----------
function getDayState(dayNum) {
  if (!daysState[dayNum]) {
    daysState[dayNum] = {
      exercises: {},
      logs: {},
      meals: {},
      customMeals: [],
      habits: {},
      weight: "",
      waist: "",
      chest: "",
      note: "",
      doms: 0,
      sleep: 7.5,
      energy: 7,
      lightMode: false
    };
  }
  const ds = daysState[dayNum];
  if (!ds.exercises) ds.exercises = {};
  if (!ds.logs) ds.logs = {};
  if (!ds.meals) ds.meals = {};
  if (!ds.customMeals) ds.customMeals = [];
  if (!ds.habits) ds.habits = {};
  if (ds.sleep === undefined) ds.sleep = 7.5;
  if (ds.energy === undefined) ds.energy = 7;
  return ds;
}

function getActiveExercises(dayObj, ds) {
  if (dayObj.hasLightMode && ds.lightMode && dayObj.lightExercises) {
    return dayObj.lightExercises;
  }
  return dayObj.exercises;
}

function getMealStats(dayObj, ds) {
  const plan = MEAL_PLANS[dayObj.mealPlanKey] || MEAL_PLANS.A;
  let kcal = 0, protein = 0, totalKcal = 0, totalProt = 0, doneMeals = 0;
  plan.meals.forEach(m => {
    totalKcal += m.kcal;
    totalProt += m.protein;
    if (ds.meals[m.id]) {
      kcal += m.kcal;
      protein += m.protein;
      doneMeals++;
    }
  });
  (ds.customMeals || []).forEach(cm => {
    kcal += Number(cm.kcal || 0);
    protein += Number(cm.protein || 0);
  });
  return {
    kcal,
    protein,
    targetKcal: currentUser?.target_kcal || totalKcal || 2200,
    targetProt: currentUser?.target_protein || totalProt || 150,
    doneMeals,
    totalMeals: plan.meals.length
  };
}

function getDayProgress(dayObj) {
  const ds = getDayState(dayObj.day);
  const exList = getActiveExercises(dayObj, ds);
  const totalEx = exList.length;
  const doneEx = exList.filter(ex => ds.exercises[ex.id]).length;
  const mStats = getMealStats(dayObj, ds);
  const total = totalEx + mStats.totalMeals;
  const done = doneEx + mStats.doneMeals;
  const isCompleted = doneEx === totalEx && totalEx > 0;
  return { totalEx, doneEx, total, done, isCompleted, mStats };
}

function findPreviousLog(dayNum, exId) {
  for (let d = dayNum - 1; d >= 1; d--) {
    const prev = daysState[d];
    if (prev && prev.logs && prev.logs[exId]) {
      const l = prev.logs[exId];
      if ((l.val && l.val.trim()) || (l.rep && l.rep.trim())) {
        return { day: d, val: l.val || "", rep: l.rep || "" };
      }
    }
  }
  return null;
}

// ---------- VIEW SWITCHING ----------
window.switchMainView = function (view) {
  currentView = view;
  ["calendar", "analytics", "ai"].forEach(v => {
    document.getElementById("view_" + v).classList.toggle("hidden", v !== view);
    document.getElementById("nav_" + v).classList.toggle("active", v === view);
  });
  if (view === "analytics") renderAnalytics();
  if (view === "ai") refreshAiPreview();
};

function renderAllViews() {
  renderCalendar();
  if (currentView === "analytics") renderAnalytics();
  if (currentView === "ai") refreshAiPreview();
}

// ---------- CALENDAR VIEW ----------
window.setWeekFilter = function (w, btn) {
  currentWeekFilter = w;
  document.querySelectorAll("#weekTabs .tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderCalendar();
};

function renderCalendar() {
  const root = document.getElementById("calendarRoot");
  root.innerHTML = "";
  const weeks = currentWeekFilter === 0 ? WEEKS_META : WEEKS_META.filter(w => w.week === currentWeekFilter);

  weeks.forEach(wMeta => {
    const sec = document.createElement("section");
    sec.className = "week-section";
    sec.innerHTML = `<div class="week-header"><h2>${wMeta.title}</h2><span>${wMeta.focus}</span></div>`;

    const grid = document.createElement("div");
    grid.className = "calendar-grid";

    daysData.filter(d => d.week === wMeta.week).forEach(dayObj => {
      const ds = getDayState(dayObj.day);
      const prog = getDayProgress(dayObj);
      const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
      const targetP = currentUser?.target_protein || 140;

      const card = document.createElement("div");
      card.className = `day-card ${prog.isCompleted ? "completed" : ""}`;
      card.onclick = () => openDayModal(dayObj.day);

      const protPill = prog.mStats.protein >= targetP
        ? `<span class="mini-pill prot-ok">پروتئین ${toFa(prog.mStats.protein)}گ</span>`
        : `<span class="mini-pill">غذا ${toFa(prog.mStats.doneMeals)}/${toFa(prog.mStats.totalMeals)}</span>`;

      const domsPill = Number(ds.doms) >= 7 ? `<span class="mini-pill doms-high">درد ${toFa(ds.doms)}</span>` : "";
      const notePill = (ds.note && ds.note.trim()) ? `<span class="mini-pill note-has">یادداشت ✓</span>` : "";

      card.innerHTML = `
        <div>
          <div class="day-top">
            <div>
              <span class="day-num">روز ${toFa(dayObj.day)}</span>
              <span class="day-weekday">${dayObj.weekday}</span>
            </div>
            <div class="quick-check" title="تکمیل سریع تمرین امروز" onclick="quickToggleDay(event, ${dayObj.day})">✓</div>
          </div>
          <span class="badge type-${dayObj.type}">${dayObj.badge}</span>
          <div class="day-title">${dayObj.title}</div>
          <div class="card-pills">
            <span class="mini-pill">${dayObj.chestTag}</span>
            ${protPill}
            ${domsPill}
            ${notePill}
          </div>
        </div>
        <div class="day-footer">
          <span>تمرین ${toFa(prog.doneEx)}/${toFa(prog.totalEx)}</span>
          <div class="mini-bar"><div class="mini-bar-fill" style="width:${pct}%"></div></div>
        </div>
      `;
      grid.appendChild(card);
    });

    sec.appendChild(grid);
    root.appendChild(sec);
  });

  updateDashboardStats();
}

function updateDashboardStats() {
  let completedDays = 0, totalExAll = 0, doneExAll = 0;
  let latestWeight = currentUser?.start_weight_kg || 81.5;
  let streak = 0, run = 0, proteinDays = 0, sleepSum = 0, sleepCnt = 0;
  const targetP = currentUser?.target_protein || 140;

  daysData.forEach(d => {
    const ds = getDayState(d.day);
    const prog = getDayProgress(d);
    totalExAll += prog.totalEx;
    doneExAll += prog.doneEx;
    if (prog.isCompleted) {
      completedDays++;
      run++;
      if (run > streak) streak = run;
    } else {
      run = 0;
    }
    if (prog.mStats.protein >= targetP) proteinDays++;
    if (ds.weight && String(ds.weight).trim() !== "") latestWeight = ds.weight;
    if (prog.done > 0 && ds.sleep) {
      sleepSum += Number(ds.sleep);
      sleepCnt++;
    }
  });

  const pct = Math.round((completedDays / 30) * 100);
  const circ = 169.65;
  document.getElementById("progressRing").style.strokeDashoffset = circ - (pct / 100) * circ;
  document.getElementById("statPercent").textContent = `${toFa(pct)}٪`;
  document.getElementById("statDays").textContent = `${toFa(completedDays)} / ۳۰`;
  document.getElementById("statTasks").textContent = `${toFa(doneExAll)} از ${toFa(totalExAll)} حرکت`;
  document.getElementById("statStreak").textContent = `${toFa(streak)} روز`;
  document.getElementById("statAvgSleep").textContent = sleepCnt ? toFa((sleepSum / sleepCnt).toFixed(1)) : "--";
  document.getElementById("statProteinDays").textContent = `${toFa(proteinDays)} روز`;
  document.getElementById("statWeight").textContent = `${toFa(latestWeight)} ک‌گ`;
}

window.quickToggleDay = function (e, dayNum) {
  e.stopPropagation();
  const dayObj = daysData.find(d => d.day === dayNum);
  const ds = getDayState(dayNum);
  const prog = getDayProgress(dayObj);
  const nextVal = !prog.isCompleted;
  getActiveExercises(dayObj, ds).forEach(ex => { ds.exercises[ex.id] = nextVal; });
  scheduleCloudSave();
  renderCalendar();
  showToast(nextVal ? `تمرین روز ${toFa(dayNum)} تکمیل شد!` : `تیک روز ${toFa(dayNum)} برداشته شد.`);
};

// ---------- DAY MODAL ----------
function openDayModal(dayNum) {
  activeDayNum = dayNum;
  const dayObj = daysData.find(d => d.day === dayNum);
  const ds = getDayState(dayNum);

  const badge = document.getElementById("mBadge");
  badge.className = `badge type-${dayObj.type}`;
  badge.textContent = dayObj.badge;

  document.getElementById("mTitle").textContent = `روز ${toFa(dayObj.day)} (${dayObj.weekday}) — ${dayObj.title}`;
  document.getElementById("mMeta").textContent = `زمان تقریبی: ${dayObj.duration} • ${dayObj.chestTag}`;
  document.getElementById("mCoachNote").textContent = dayObj.coachNote;

  const guard = document.getElementById("mChestGuard");
  guard.className = `chest-guardrail guard-${dayObj.chestLevel || "medium"}`;
  guard.textContent = dayObj.chestRule || "اجرا با فرم استاندارد و کنترل تنفس";

  const lightBox = document.getElementById("mLightModeBox");
  if (dayObj.hasLightMode) {
    lightBox.classList.remove("hidden");
    updateLightModeButtons(ds.lightMode);
  } else {
    lightBox.classList.add("hidden");
  }

  document.getElementById("mSleep").value = ds.sleep ?? 7.5;
  document.getElementById("mDoms").value = ds.doms ?? 0;
  document.getElementById("mEnergy").value = ds.energy ?? 7;
  document.getElementById("mWeight").value = ds.weight || "";
  document.getElementById("mWaist").value = ds.waist || "";
  document.getElementById("mChest").value = ds.chest || "";
  document.getElementById("mNote").value = ds.note || "";

  renderReadinessBanner(ds.sleep, ds.doms, ds.energy, dayObj.hasLightMode);
  renderExercises(dayObj, ds);
  renderMeals(dayObj, ds);
  renderHabits(ds);

  document.getElementById("prevBtn").disabled = dayNum <= 1;
  document.getElementById("nextBtn").disabled = dayNum >= 30;

  switchModalTab("workout");
  document.getElementById("dayModal").classList.add("open");
  document.body.style.overflow = "hidden";
}

window.switchModalTab = function (tab) {
  ["workout", "meals", "recovery"].forEach(t => {
    const cap = t.charAt(0).toUpperCase() + t.slice(1);
    document.getElementById("pane" + cap).classList.toggle("active", t === tab);
    document.getElementById("tabBtn" + cap).classList.toggle("active", t === tab);
  });
};

function updateLightModeButtons(isLight) {
  document.getElementById("btnModeFull").className = `mode-pill ${!isLight ? "active-full" : ""}`;
  document.getElementById("btnModeLight").className = `mode-pill ${isLight ? "active-light" : ""}`;
}

window.setDayLightMode = function (isLight) {
  if (!activeDayNum) return;
  const dayObj = daysData.find(d => d.day === activeDayNum);
  const ds = getDayState(activeDayNum);
  ds.lightMode = isLight;
  scheduleCloudSave();
  updateLightModeButtons(isLight);
  renderExercises(dayObj, ds);
  renderCalendar();
  showToast(isLight ? "حالت سبک ریکاوری فعال شد." : "حالت کامل پنج‌شنبه فعال شد.");
};

function renderReadinessBanner(sleepVal, domsVal, energyVal, hasLightMode) {
  const s = Number(sleepVal), d = Number(domsVal), en = Number(energyVal);
  document.getElementById("mSleepLabel").textContent = `${toFa(s)} ساعت`;
  document.getElementById("mDomsLabel").textContent = `${toFa(d)} از ۱۰`;
  document.getElementById("mEnergyLabel").textContent = `${toFa(en)} از ۱۰`;

  const banner = document.getElementById("mReadinessBanner");
  if (d >= 7 || s < 6) {
    banner.className = "readiness-banner r-red";
    banner.textContent = d >= 7
      ? "قانون نمره ۷ فعال شد: بدن‌درد بالاست! شنای سبک امروز خودکار به «کشش ملایم سینه» تبدیل شد."
      : "هشدار کم‌خوابی: خواب زیر ۶ ساعت ریکاوری را کند می‌کند. امروز وزنه‌ها را ۱۵٪ سبک‌تر بگیر" + (hasLightMode ? " و پنج‌شنبه را سبک بزن." : ".");
  } else if (d >= 4 || s < 7 || en <= 4) {
    banner.className = "readiness-banner r-amber";
    banner.textContent = "آمادگی متوسط: گرم‌کردن را ۱۰ دقیقه کن، آب بیشتر بخور و ۲ تکرار ذخیره نگه دار.";
  } else {
    banner.className = "readiness-banner r-green";
    banner.textContent = "آمادگی عالی (سبز): شرایط خواب و ریکاوری استاندارد است؛ برو برای رکورد تمیز!";
  }
}

window.updateReadinessUI = function () {
  if (!activeDayNum) return;
  const dayObj = daysData.find(d => d.day === activeDayNum);
  const ds = getDayState(activeDayNum);
  ds.sleep = Number(document.getElementById("mSleep").value);
  ds.doms = Number(document.getElementById("mDoms").value);
  ds.energy = Number(document.getElementById("mEnergy").value);
  scheduleCloudSave();
  renderReadinessBanner(ds.sleep, ds.doms, ds.energy, dayObj.hasLightMode);
  renderExercises(dayObj, ds);
  renderCalendar();
};

function renderExercises(dayObj, ds) {
  const container = document.getElementById("mExercises");
  container.innerHTML = "";
  const exList = getActiveExercises(dayObj, ds);
  let doneEx = 0;
  const highDoms = Number(ds.doms) >= 7;

  exList.forEach((ex, idx) => {
    const checked = !!ds.exercises[ex.id];
    if (checked) doneEx++;
    const lockedByDoms = highDoms && ex.isLightChest;

    const card = document.createElement("div");
    card.className = `ex-card ${checked ? "checked" : ""} ${lockedByDoms ? "doms-locked" : ""}`;

    const titleText = lockedByDoms ? `جایگزین خودکار (قانون نمره ۷): فقط کشش بازکننده سینه` : ex.name;
    const detailText = lockedByDoms
      ? `چون بدن‌دردت ${toFa(ds.doms)}/۱۰ است، شنای سبک خط خورد؛ ۲×۳۰ ثانیه کشش ملایم انجام بده.`
      : ex.detail;

    let logHtml = "";
    if (ex.track && !lockedByDoms) {
      const curLog = ds.logs[ex.id] || { val: "", rep: "" };
      const prev = findPreviousLog(dayObj.day, ex.id);
      const prevHtml = prev
        ? `<span class="prev-record">رکورد روز ${toFa(prev.day)}: ${toFa(prev.val || "-")} ${ex.unit || ""} ${prev.rep ? `× ${toFa(prev.rep)}` : ""}</span>`
        : `<span class="prev-record" style="opacity:0.68;">اولین ثبت</span>`;

      logHtml = `
        <div class="ex-log-row" onclick="event.stopPropagation()">
          <input type="text" class="mini-input" placeholder="${ex.unit || "وزنه"}" value="${curLog.val || ""}" oninput="saveExLog('${ex.id}','val',this.value)"/>
          <input type="text" class="mini-input" placeholder="تکرار / یادداشت" value="${curLog.rep || ""}" oninput="saveExLog('${ex.id}','rep',this.value)"/>
          ${prevHtml}
          ${ex.rest > 0 ? `<button class="rest-chip" onclick="startTimer(${ex.rest})">تایمر ${toFa(ex.rest)}ث</button>` : ""}
          <button class="icon-del-btn" title="حذف این حرکت از روز" onclick="deleteExercise(${idx})">حذف</button>
        </div>
      `;
    } else {
      logHtml = `
        <div class="ex-log-row" onclick="event.stopPropagation()">
          ${ex.rest > 0 ? `<button class="rest-chip" onclick="startTimer(${ex.rest})">تایمر ${toFa(ex.rest)}ث</button>` : ""}
          <button class="icon-del-btn" title="حذف این حرکت از روز" onclick="deleteExercise(${idx})">حذف</button>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="ex-main-row" onclick="toggleExercise('${ex.id}')">
        <div class="check-box">✓</div>
        <div>
          <span class="item-name">${titleText}</span>
          <span class="item-detail">${detailText}</span>
        </div>
      </div>
      ${logHtml}
    `;
    container.appendChild(card);
  });

  document.getElementById("mExCount").textContent = `${toFa(doneEx)} از ${toFa(exList.length)} انجام شده`;
}

window.toggleExercise = function (exId) {
  if (!activeDayNum) return;
  const dayObj = daysData.find(d => d.day === activeDayNum);
  const ds = getDayState(activeDayNum);
  ds.exercises[exId] = !ds.exercises[exId];
  scheduleCloudSave();
  renderExercises(dayObj, ds);
  renderCalendar();
};

window.saveExLog = function (exId, field, value) {
  if (!activeDayNum) return;
  const ds = getDayState(activeDayNum);
  if (!ds.logs[exId]) ds.logs[exId] = { val: "", rep: "" };
  ds.logs[exId][field] = value;
  scheduleCloudSave();
};

window.addCustomExercise = function () {
  if (!activeDayNum) return;
  const nameEl = document.getElementById("newExName");
  const detailEl = document.getElementById("newExDetail");
  const unitEl = document.getElementById("newExUnit");
  const name = nameEl.value.trim();
  if (!name) return showToast("نام حرکت را وارد کن.");

  const dayObj = daysData.find(d => d.day === activeDayNum);
  const ds = getDayState(activeDayNum);
  const list = getActiveExercises(dayObj, ds);
  list.push({
    id: "custom_" + Date.now(),
    name,
    detail: detailEl.value.trim() || "۳ ست × ۱۰ تا ۱۲ تکرار",
    track: true,
    unit: unitEl.value.trim() || "ک‌گ",
    rest: 75,
    isLightChest: false
  });

  nameEl.value = "";
  detailEl.value = "";
  scheduleCloudSave();
  renderExercises(dayObj, ds);
  renderCalendar();
  showToast("حرکت جدید به برنامه شخصی تو اضافه شد.");
};

window.deleteExercise = function (idx) {
  if (!activeDayNum) return;
  const dayObj = daysData.find(d => d.day === activeDayNum);
  const ds = getDayState(activeDayNum);
  const list = getActiveExercises(dayObj, ds);
  list.splice(idx, 1);
  scheduleCloudSave();
  renderExercises(dayObj, ds);
  renderCalendar();
  showToast("حرکت حذف شد.");
};

// ---------- MEALS TAB ----------
function renderMeals(dayObj, ds) {
  const plan = MEAL_PLANS[dayObj.mealPlanKey] || MEAL_PLANS.A;
  const stats = getMealStats(dayObj, ds);
  document.getElementById("mealPlanTitle").textContent = plan.label;
  document.getElementById("mealKcalText").textContent = `${toFa(stats.kcal)} / ${toFa(stats.targetKcal)} کالری`;
  document.getElementById("mealProtText").textContent = `${toFa(stats.protein)} / ${toFa(stats.targetProt)} گرم`;
  document.getElementById("mealKcalBar").style.width = `${Math.min(100, Math.round((stats.kcal / stats.targetKcal) * 100))}%`;
  document.getElementById("mealProtBar").style.width = `${Math.min(100, Math.round((stats.protein / stats.targetProt) * 100))}%`;

  const list = document.getElementById("mMealsList");
  list.innerHTML = "";
  plan.meals.forEach(m => {
    const checked = !!ds.meals[m.id];
    const el = document.createElement("div");
    el.className = `check-item ${checked ? "checked" : ""}`;
    el.onclick = () => {
      ds.meals[m.id] = !ds.meals[m.id];
      scheduleCloudSave();
      renderMeals(dayObj, ds);
      renderCalendar();
    };
    el.innerHTML = `
      <div class="check-box">✓</div>
      <div style="width:100%">
        <span class="item-name">${m.slot}: ${m.name}</span>
        <div class="meal-meta-row">
          <span class="meal-tag">~${toFa(m.kcal)} کالری</span>
          <span class="meal-tag" style="color:var(--green)">${toFa(m.protein)} گرم پروتئین</span>
          <span class="meal-tag">زمان: ${m.prep}</span>
        </div>
      </div>
    `;
    list.appendChild(el);
  });

  (ds.customMeals || []).forEach((cm, idx) => {
    const el = document.createElement("div");
    el.className = "check-item checked";
    el.innerHTML = `
      <div class="check-box">✓</div>
      <div style="width:100%; display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <div>
          <span class="item-name" style="text-decoration:none; color:var(--text);">وعده اضافه: ${cm.name}</span>
          <div class="meal-meta-row">
            <span class="meal-tag">${toFa(cm.kcal)} کالری</span>
            <span class="meal-tag" style="color:var(--green)">${toFa(cm.protein)} گرم پروتئین</span>
          </div>
        </div>
        <button class="icon-del-btn" onclick="event.stopPropagation(); deleteCustomMeal(${idx})">حذف</button>
      </div>
    `;
    list.appendChild(el);
  });
}

window.addCustomMeal = function () {
  if (!activeDayNum) return;
  const name = document.getElementById("customMealName").value.trim();
  const kcal = Number(document.getElementById("customMealKcal").value || 0);
  const protein = Number(document.getElementById("customMealProt").value || 0);
  if (!name) return showToast("نام خوراکی یا میان‌وعده را بنویس.");

  const dayObj = daysData.find(d => d.day === activeDayNum);
  const ds = getDayState(activeDayNum);
  ds.customMeals.push({ name, kcal, protein });
  document.getElementById("customMealName").value = "";
  document.getElementById("customMealKcal").value = "";
  document.getElementById("customMealProt").value = "";
  scheduleCloudSave();
  renderMeals(dayObj, ds);
  renderCalendar();
  showToast("وعده شخصی ثبت شد.");
};

window.deleteCustomMeal = function (idx) {
  if (!activeDayNum) return;
  const dayObj = daysData.find(d => d.day === activeDayNum);
  const ds = getDayState(activeDayNum);
  ds.customMeals.splice(idx, 1);
  scheduleCloudSave();
  renderMeals(dayObj, ds);
  renderCalendar();
};

// ---------- HABITS & PERSONAL LOG ----------
function renderHabits(ds) {
  const c = document.getElementById("mHabits");
  c.innerHTML = "";
  DAILY_HABITS.forEach(h => {
    const checked = !!ds.habits[h.id];
    const el = document.createElement("div");
    el.className = `check-item ${checked ? "checked" : ""}`;
    el.onclick = () => {
      ds.habits[h.id] = !ds.habits[h.id];
      scheduleCloudSave();
      renderHabits(ds);
    };
    el.innerHTML = `<div class="check-box">✓</div><div><span class="item-name" style="font-size:0.8rem;">${h.label}</span></div>`;
    c.appendChild(el);
  });
}

window.saveDayLog = function () {
  if (!activeDayNum) return;
  const ds = getDayState(activeDayNum);
  ds.weight = document.getElementById("mWeight").value;
  ds.waist = document.getElementById("mWaist").value;
  ds.chest = document.getElementById("mChest").value;
  ds.note = document.getElementById("mNote").value;
  scheduleCloudSave();
  updateDashboardStats();
  renderCalendar();
};

window.completeAllToday = function () {
  if (!activeDayNum) return;
  const dayObj = daysData.find(d => d.day === activeDayNum);
  const ds = getDayState(activeDayNum);
  getActiveExercises(dayObj, ds).forEach(ex => { ds.exercises[ex.id] = true; });
  (MEAL_PLANS[dayObj.mealPlanKey] || MEAL_PLANS.A).meals.forEach(m => { ds.meals[m.id] = true; });
  DAILY_HABITS.forEach(h => { ds.habits[h.id] = true; });
  scheduleCloudSave();
  renderExercises(dayObj, ds);
  renderMeals(dayObj, ds);
  renderHabits(ds);
  renderCalendar();
  showToast(`تمام تیک‌های تمرین و تغذیه روز ${toFa(activeDayNum)} ثبت شد!`);
};

window.navigateDay = function (delta) {
  if (!activeDayNum) return;
  const next = activeDayNum + delta;
  if (next >= 1 && next <= 30) {
    stopTimer();
    openDayModal(next);
  }
};

window.closeDayModal = function () {
  stopTimer();
  document.getElementById("dayModal").classList.remove("open");
  document.body.style.overflow = "";
  activeDayNum = null;
};

// ---------- TIMER ----------
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

function updateTimerDisplay() {
  const m = String(Math.floor(restSeconds / 60)).padStart(2, "0");
  const s = String(restSeconds % 60).padStart(2, "0");
  document.getElementById("timerDisplay").textContent = `${toFa(m)}:${toFa(s)}`;
}

window.startTimer = function (sec) {
  stopTimer();
  restSeconds = sec;
  updateTimerDisplay();
  document.getElementById("timerStopBtn").classList.add("running");
  restTimer = setInterval(() => {
    restSeconds--;
    updateTimerDisplay();
    if (restSeconds <= 0) {
      stopTimer();
      playBeep();
      showToast("زمان استراحت / پلانک تمام شد!");
    }
  }, 1000);
};

window.stopTimer = function () {
  if (restTimer) clearInterval(restTimer);
  restTimer = null;
  restSeconds = 0;
  updateTimerDisplay();
  const stopBtn = document.getElementById("timerStopBtn");
  if (stopBtn) stopBtn.classList.remove("running");
};

// ---------- ANALYTICS VIEW ----------
function renderAnalytics() {
  renderWeightChart(
    document.getElementById("weightChartBox"),
    daysData,
    daysState,
    Number(currentUser?.start_weight_kg || 81.5)
  );
  renderProteinSleepChart(
    document.getElementById("proteinChartBox"),
    daysData,
    daysState,
    MEAL_PLANS,
    Number(currentUser?.target_protein || 150)
  );

  const prs = computeKeyPRs(daysData, daysState);
  const prBox = document.getElementById("prListBox");
  if (prs.length === 0) {
    prBox.innerHTML = `<div class="empty-chart" style="grid-column:1/-1;">هنوز رکورد وزنه یا تکراری ثبت نکرده‌ای. داخل هر روز جلوی حرکات عدد ثبت کن تا روند رشد قدرتت اینجا ساخته شود.</div>`;
  } else {
    prBox.innerHTML = prs.map(pr => `
      <div class="pr-card">
        <strong>${pr.name}</strong>
        <div class="pr-hist">
          ${pr.history.slice(-4).map(h => `<span>روز ${toFa(h.day)}: <b>${toFa(h.val)} ${pr.unit}</b> ${h.rep ? `(${toFa(h.rep)})` : ""}</span>`).join("")}
        </div>
      </div>
    `).join("");
  }
}

// ---------- AI EXPORT STUDIO ----------
function getCurrentDataset() {
  const range = document.getElementById("aiRangeSelect").value;
  return buildStructuredDataset({
    user: currentUser,
    daysData,
    daysState,
    mealPlans: MEAL_PLANS,
    range
  });
}

window.refreshAiPreview = function () {
  if (!currentUser) return;
  const promptType = document.getElementById("aiPromptTypeSelect").value;
  const dataset = getCurrentDataset();
  const md = buildAiPromptMarkdown({ dataset, promptType });
  document.getElementById("aiPromptPreview").value = md;
};

window.copyAiPrompt = function () {
  const text = document.getElementById("aiPromptPreview").value;
  navigator.clipboard.writeText(text).then(() => {
    showToast("پرامپت آماده تحلیل کپی شد! حالا مستقیم در Gemini یا ChatGPT پیست کن.");
  }).catch(() => {
    document.getElementById("aiPromptPreview").select();
    document.execCommand("copy");
    showToast("کپی شد!");
  });
};

window.downloadAiMarkdown = function () {
  const text = document.getElementById("aiPromptPreview").value;
  downloadTextFile(`fittrack-ai-report-${new Date().toISOString().slice(0,10)}.md`, text, "text/markdown;charset=utf-8");
  showToast("فایل Markdown دانلود شد.");
};

window.downloadAiJson = function () {
  const dataset = getCurrentDataset();
  downloadTextFile(`fittrack-ai-data-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(dataset, null, 2), "application/json;charset=utf-8");
  showToast("فایل JSON ساختاریافته دانلود شد.");
};

window.downloadAiCsv = function () {
  const dataset = getCurrentDataset();
  downloadTextFile(`fittrack-log-${new Date().toISOString().slice(0,10)}.csv`, buildCsvExport(dataset), "text/csv;charset=utf-8");
  showToast("فایل CSV اکسل دانلود شد.");
};

// ---------- PROFILE & TEMPLATE SETTINGS MODAL ----------
window.openProfileModal = function (isOnboarding = false) {
  document.getElementById("pModalTitle").textContent = isOnboarding ? "تکمیل پروفایل و انتخاب برنامه شروع" : "تنظیمات پروفایل و قالب برنامه";
  document.getElementById("pName").value = currentUser.full_name || "";
  document.getElementById("pAge").value = currentUser.age || 24;
  document.getElementById("pHeight").value = currentUser.height_cm || 180;
  document.getElementById("pWeight").value = currentUser.start_weight_kg || 81.5;
  document.getElementById("pGoal").value = currentUser.goal || "recomp";
  document.getElementById("pKcal").value = currentUser.target_kcal || 2200;
  document.getElementById("pProtein").value = currentUser.target_protein || 150;
  document.getElementById("pTemplate").value = currentUser.selected_template || "hybrid_calisthenics";
  document.getElementById("profileModal").classList.add("open");
};

window.closeProfileModal = function () {
  document.getElementById("profileModal").classList.remove("open");
};

window.autoCalcNutrition = function () {
  const age = Number(document.getElementById("pAge").value || 24);
  const h = Number(document.getElementById("pHeight").value || 180);
  const w = Number(document.getElementById("pWeight").value || 81.5);
  const goal = document.getElementById("pGoal").value;

  // Mifflin-St Jeor RMR & moderate activity TDEE
  const rmr = Math.round(10 * w + 6.25 * h - 5 * age + 5);
  const tdee = Math.round(rmr * 1.5);
  let targetKcal = tdee;
  if (goal === "recomp") targetKcal = Math.max(rmr, tdee - 450);
  else if (goal === "cut") targetKcal = Math.max(rmr, tdee - 550);
  else if (goal === "bulk") targetKcal = tdee + 250;

  const targetProtein = Math.round(w * 1.85);
  document.getElementById("pKcal").value = targetKcal;
  document.getElementById("pProtein").value = targetProtein;
  showToast(`محاسبه هوشمند انجام شد (RMR: ${toFa(rmr)} | هدف: ${toFa(targetKcal)} کالری)`);
};

window.saveProfileSettings = async function () {
  const newTemplate = document.getElementById("pTemplate").value;
  const resetTemplate = document.getElementById("pResetTemplate").checked;

  const payload = {
    full_name: document.getElementById("pName").value.trim(),
    age: Number(document.getElementById("pAge").value || 24),
    height_cm: Number(document.getElementById("pHeight").value || 180),
    start_weight_kg: Number(document.getElementById("pWeight").value || 81.5),
    goal: document.getElementById("pGoal").value,
    target_kcal: Number(document.getElementById("pKcal").value || 2200),
    target_protein: Number(document.getElementById("pProtein").value || 150),
    selected_template: newTemplate
  };

  try {
    const res = await api.updateProfile(payload);
    currentUser = res.user;
    if (resetTemplate) {
      daysData = cloneTemplateDays(newTemplate);
      scheduleCloudSave();
    }
    updateHeaderUser();
    renderAllViews();
    closeProfileModal();
    showToast("پروفایل و اهداف با موفقیت ذخیره شد.");
  } catch (err) {
    showToast(err.message);
  }
};

// ---------- THEME & TOAST ----------
window.toggleTheme = function () {
  const html = document.documentElement;
  const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
  document.getElementById("themeBtn").textContent = next === "dark" ? "حالت روشن" : "حالت تیره";
  localStorage.setItem("fittrack_theme", next);
};

function initTheme() {
  if (localStorage.getItem("fittrack_theme") === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    const btn = document.getElementById("themeBtn");
    if (btn) btn.textContent = "حالت تیره";
  }
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window._toastT);
  window._toastT = setTimeout(() => t.classList.remove("show"), 2800);
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (activeDayNum) closeDayModal();
    closeProfileModal();
  }
});

init();
