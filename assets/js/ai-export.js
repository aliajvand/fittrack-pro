import { computeKeyPRs } from "./charts.js";

const GOAL_LABELS = {
  recomp: "چربی‌سوزی و فیت شدن (Recomposition)",
  cut: "کاهش وزن و چربی‌سوزی",
  bulk: "عضله‌سازی و افزایش حجم",
  calisthenics: "مهارت و قدرت کلیستنیکس",
  maintain: "حفظ فرم و سلامت عمومی"
};

export function filterDaysByRange(daysData, range) {
  if (range === "all") return daysData;
  if (range === "w1") return daysData.filter(d => d.day >= 1 && d.day <= 7);
  if (range === "w2") return daysData.filter(d => d.day >= 8 && d.day <= 14);
  if (range === "w3") return daysData.filter(d => d.day >= 15 && d.day <= 21);
  if (range === "w4") return daysData.filter(d => d.day >= 22 && d.day <= 28);
  if (range === "last7") {
    return daysData.slice(-7);
  }
  return daysData;
}

export function buildStructuredDataset({ user, daysData, daysState, mealPlans, range = "all" }) {
  const selectedDays = filterDaysByRange(daysData, range);
  const dailyLogs = [];
  let completedWorkouts = 0, proteinHitDays = 0, sleepSum = 0, sleepCount = 0, domsSum = 0, domsCount = 0;

  selectedDays.forEach(d => {
    const ds = daysState[d.day] || {};
    const exList = (d.hasLightMode && ds.lightMode && d.lightExercises) ? d.lightExercises : d.exercises;
    const doneEx = exList.filter(ex => ds.exercises && ds.exercises[ex.id]);
    const isCompleted = exList.length > 0 && doneEx.length === exList.length;
    if (isCompleted) completedWorkouts++;

    const plan = mealPlans[d.mealPlanKey] || mealPlans.A;
    let kcal = 0, protein = 0;
    const eatenMeals = [];
    plan.meals.forEach(m => {
      if (ds.meals && ds.meals[m.id]) {
        kcal += m.kcal;
        protein += m.protein;
        eatenMeals.push(m.slot);
      }
    });
    if (ds.customMeals) {
      ds.customMeals.forEach(cm => {
        kcal += Number(cm.kcal || 0);
        protein += Number(cm.protein || 0);
        eatenMeals.push(cm.name);
      });
    }
    if (protein >= (user.target_protein || 140)) proteinHitDays++;
    if (doneEx.length > 0 || kcal > 0 || ds.weight || ds.note) {
      if (ds.sleep) { sleepSum += Number(ds.sleep); sleepCount++; }
      if (ds.doms !== undefined && ds.doms !== null) { domsSum += Number(ds.doms); domsCount++; }
    }

    const exerciseRecords = [];
    exList.forEach(ex => {
      const done = Boolean(ds.exercises && ds.exercises[ex.id]);
      const l = ds.logs && ds.logs[ex.id];
      if (done || (l && (l.val || l.rep))) {
        exerciseRecords.push({
          name: ex.name,
          done,
          value: l?.val || null,
          unit: ex.unit || null,
          reps_or_note: l?.rep || null
        });
      }
    });

    dailyLogs.push({
      day: d.day,
      weekday: d.weekday,
      sessionTitle: d.title,
      lightMode: Boolean(ds.lightMode),
      completedExercises: doneEx.length,
      totalExercises: exList.length,
      isCompleted,
      weightKg: ds.weight ? Number(ds.weight) : null,
      waistCm: ds.waist ? Number(ds.waist) : null,
      chestCm: ds.chest ? Number(ds.chest) : null,
      sleepHours: ds.sleep ? Number(ds.sleep) : null,
      domsScore: ds.doms !== undefined ? Number(ds.doms) : null,
      energyScore: ds.energy ? Number(ds.energy) : null,
      kcalConsumed: kcal,
      proteinGrams: protein,
      eatenMeals,
      exerciseRecords,
      personalNote: (ds.note || "").trim() || null
    });
  });

  const weights = dailyLogs.filter(x => x.weightKg !== null).map(x => ({ day: x.day, kg: x.weightKg }));
  const prs = computeKeyPRs(selectedDays, daysState);

  return {
    exportedAt: new Date().toISOString(),
    range,
    profile: {
      name: user.full_name || "ورزشکار",
      age: user.age,
      heightCm: user.height_cm,
      startWeightKg: user.start_weight_kg,
      goal: GOAL_LABELS[user.goal] || user.goal,
      targetKcal: user.target_kcal,
      targetProteinGrams: user.target_protein
    },
    summary: {
      daysInRange: selectedDays.length,
      completedWorkouts,
      adherencePercent: selectedDays.length ? Math.round((completedWorkouts / selectedDays.length) * 100) : 0,
      proteinHitDays,
      avgSleepHours: sleepCount ? Number((sleepSum / sleepCount).toFixed(1)) : null,
      avgDomsScore: domsCount ? Number((domsSum / domsCount).toFixed(1)) : null,
      weightTrend: weights
    },
    exerciseProgressPRs: prs,
    dailyLogs
  };
}

export function buildAiPromptMarkdown({ dataset, promptType = "coach_full" }) {
  const p = dataset.profile;
  const s = dataset.summary;

  const taskPrompts = {
    coach_full: `لطفاً مثل یک مربی حرفه‌ای بدنسازی، کلیستنیکس و تغذیه، داده‌های زیر را دقیق تحلیل کن و این ۵ خروجی را بده:
1. نمره عملکرد کل من از ۱۰ به همراه دلایل دقیق (نقاط قوت و نقاط ضعف).
2. تحلیل روند وزن، خواب و میزان بدن‌درد (آیا سرعت پیشرفت و ریکاوری استاندارد است؟).
3. تحلیل پیشرفت رکوردها (اضافه بار در سینه، پا، پلانک و پایه کلیستنیکس).
4. اصلاحات دقیق برای هفته یا ماه آینده (چه حرکاتی سنگین‌تر یا جایگزین شوند؟).
5. بررسی یادداشت‌های شخصی من و پاسخ به دغدغه‌هایی که نوشته‌ام.`,
    nutrition_audit: `لطفاً مثل یک متخصص تغذیه ورزشی، گزارش زیر را تحلیل کن و این ۴ مورد را مشخص کن:
1. آیا دریافت کالری و پروتئین روزانه‌ام با هدف «${p.goal}» هم‌خوانی دارد؟
2. ارتباط بین روزهایی که پروتئین یا خوابم کم بوده با بدن‌درد و انرژی‌ام چیست؟
3. آیا نیاز به تغییر هدف کالری (${p.targetKcal} کالری) یا پروتئین (${p.targetProteinGrams} گرم) دارم؟
4. ۳ اصلاح عملی و ساده برای راحت‌تر شدن پایبندی غذایی هفته بعد.`,
    strength_overload: `لطفاً مثل یک مربی تخصصی کلیستنیکس و قدرت، رکوردهای زیر را بررسی کن:
1. در کدام حرکات اضافه بار (Progressive Overload) خوبی داشته‌ام و در کدام حرکات درجا زده‌ام؟
2. چقدر به اجرای شنا سوئدی تمیز روی زمین و بارفیکس بدون کمک نزدیک شده‌ام؟
3. عدد وزنه/تکرار پیشنهادی دقیق برای هفته آینده در حرکات اصلی چیست؟`
  };

  const lines = [
    `# درخواست تحلیل هوشمند عملکرد ورزشی و تغذیه`,
    ``,
    taskPrompts[promptType] || taskPrompts.coach_full,
    ``,
    `---`,
    `## ۱. مشخصات فردی و اهداف`,
    `- **نام:** ${p.name} | **سن:** ${p.age} سال | **قد:** ${p.heightCm} سانتی‌متر | **وزن شروع:** ${p.startWeightKg} کیلوگرم`,
    `- **هدف اصلی:** ${p.goal}`,
    `- **هدف روزانه تغذیه:** ${p.targetKcal} کالری | ${p.targetProteinGrams} گرم پروتئین`,
    ``,
    `## ۲. خلاصه آمار بازه انتخابی (${s.daysInRange} روز)`,
    `- **جلسات تکمیل‌شده:** ${s.completedWorkouts} از ${s.daysInRange} روز (${s.adherencePercent}%)`,
    `- **روزهای پایبند به پروتئین هدف:** ${s.proteinHitDays} روز`,
    `- **میانگین خواب ثبت‌شده:** ${s.avgSleepHours !== null ? s.avgSleepHours + " ساعت" : "ثبت نشده"}`,
    `- **میانگین بدن‌درد (DOMS):** ${s.avgDomsScore !== null ? s.avgDomsScore + " از ۱۰" : "ثبت نشده"}`,
    `- **روند وزن ناشتا:** ${s.weightTrend.length ? s.weightTrend.map(w => `روز ${w.day}: ${w.kg} ک‌گ`).join(" ← ") : "ثبت نشده"}`,
    ``,
    `## ۳. روند پیشرفت رکوردها در حرکات شاخص`
  ];

  if (dataset.exerciseProgressPRs.length === 0) {
    lines.push(`- هنوز رکورد وزنه یا تکراری ثبت نشده است.`);
  } else {
    dataset.exerciseProgressPRs.forEach(pr => {
      const hist = pr.history.map(h => `روز ${h.day}: ${h.val} ${pr.unit} ${h.rep ? `(${h.rep})` : ""}`).join(" | ");
      lines.push(`- **${pr.name}:** ${hist}`);
    });
  }

  lines.push(``, `## ۴. جزئیات روزبه‌روز (فقط روزهای دارای فعالیت یا یادداشت)`);

  const activeLogs = dataset.dailyLogs.filter(
    l => l.completedExercises > 0 || l.kcalConsumed > 0 || l.weightKg !== null || l.personalNote
  );

  if (activeLogs.length === 0) {
    lines.push(`- هنوز داده‌ای در این بازه ثبت نشده است.`);
  } else {
    activeLogs.forEach(l => {
      lines.push(`### روز ${l.day} (${l.weekday}) — ${l.sessionTitle}${l.lightMode ? " [حالت سبک ریکاوری]" : ""}`);
      lines.push(`- تمرین: ${l.completedExercises}/${l.totalExercises} حرکت | تغذیه: ${l.kcalConsumed} کالری، ${l.proteinGrams} گرم پروتئین`);
      lines.push(`- وضعیت بدن: وزن ${l.weightKg ?? "-"} ک‌گ | خواب ${l.sleepHours ?? "-"} ساعت | بدن‌درد ${l.domsScore ?? "-"}/10 | انرژی ${l.energyScore ?? "-"}/10`);
      if (l.waistCm || l.chestCm) {
        lines.push(`- سایزگیری: دور کمر ${l.waistCm ?? "-"} سانتی‌متر | دور سینه ${l.chestCm ?? "-"} سانتی‌متر`);
      }
      const tracked = l.exerciseRecords.filter(r => r.value || r.reps_or_note);
      if (tracked.length) {
        lines.push(`- رکوردها: ` + tracked.map(r => `${r.name} [${r.value || "-"} ${r.unit || ""} ${r.reps_or_note || ""}]`).join(" ، "));
      }
      if (l.personalNote) {
        lines.push(`- **توضیحات شخصی کاربر:** ${l.personalNote}`);
      }
    });
  }

  return lines.join("\n");
}

export function buildCsvExport(dataset) {
  const header = ["Day","Weekday","Session","Completed_Exercises","Total_Exercises","Light_Mode","Weight_KG","Waist_CM","Chest_CM","Sleep_Hours","DOMS_0_10","Energy_1_10","Calories","Protein_G","Personal_Note"];
  const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [header.join(",")];
  dataset.dailyLogs.forEach(l => {
    rows.push([
      l.day, l.weekday, l.sessionTitle, l.completedExercises, l.totalExercises,
      l.lightMode ? "Yes" : "No", l.weightKg ?? "", l.waistCm ?? "", l.chestCm ?? "",
      l.sleepHours ?? "", l.domsScore ?? "", l.energyScore ?? "",
      l.kcalConsumed, l.proteinGrams, l.personalNote ?? ""
    ].map(esc).join(","));
  });
  return "\uFEFF" + rows.join("\n"); // BOM for Persian Excel compatibility
}

export function downloadTextFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
