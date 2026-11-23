export function toFa(num) {
  return String(num).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

export function renderWeightChart(container, daysData, daysState, startWeight) {
  const points = [];
  daysData.forEach(d => {
    const ds = daysState[d.day];
    if (ds && ds.weight && !isNaN(Number(ds.weight))) {
      points.push({ day: d.day, val: Number(ds.weight) });
    }
  });

  if (points.length === 0) {
    container.innerHTML = `<div class="empty-chart">هنوز وزنی ثبت نشده است. با ثبت وزن ناشتا در هر روز، نمودار روند تغییرات وزن اینجا رسم می‌شود.</div>`;
    return;
  }

  const W = 540, H = 200, padL = 44, padR = 20, padT = 22, padB = 30;
  const vals = points.map(p => p.val);
  const minV = Math.floor(Math.min(...vals, startWeight) - 1);
  const maxV = Math.ceil(Math.max(...vals, startWeight) + 1);
  const rangeV = Math.max(1, maxV - minV);

  const xPos = idx => points.length === 1
    ? padL + (W - padL - padR) / 2
    : padL + (idx / (points.length - 1)) * (W - padL - padR);
  const yPos = v => padT + ((maxV - v) / rangeV) * (H - padT - padB);

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xPos(i).toFixed(1)} ${yPos(p.val).toFixed(1)}`).join(" ");
  const areaD = points.length > 1
    ? `${pathD} L ${xPos(points.length - 1).toFixed(1)} ${H - padB} L ${xPos(0).toFixed(1)} ${H - padB} Z`
    : "";

  const yTicks = [minV, (minV + maxV) / 2, maxV];
  const gridHtml = yTicks.map(t => {
    const y = yPos(t).toFixed(1);
    return `
      <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(148,163,184,0.14)" stroke-dasharray="4 4"/>
      <text x="${padL - 8}" y="${Number(y) + 4}" text-anchor="end" fill="#9898a6" font-size="11">${toFa(t.toFixed(1))}</text>
    `;
  }).join("");

  const dotsHtml = points.map((p, i) => {
    const cx = xPos(i).toFixed(1);
    const cy = yPos(p.val).toFixed(1);
    return `
      <g>
        <circle cx="${cx}" cy="${cy}" r="5" fill="#30d158" stroke="#08080a" stroke-width="2"/>
        <text x="${cx}" y="${Number(cy) - 10}" text-anchor="middle" fill="#f5f5f7" font-size="10.5" font-weight="700">${toFa(p.val)}</text>
        <text x="${cx}" y="${H - 8}" text-anchor="middle" fill="#9898a6" font-size="10">ر${toFa(p.day)}</text>
      </g>
    `;
  }).join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="svg-chart">
      <defs>
        <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#30d158" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="#30d158" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      ${gridHtml}
      ${areaD ? `<path d="${areaD}" fill="url(#weightGrad)"/>` : ""}
      ${points.length > 1 ? `<path d="${pathD}" fill="none" stroke="#30d158" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
      ${dotsHtml}
    </svg>
  `;
}

export function renderProteinSleepChart(container, daysData, daysState, mealPlans, targetProtein) {
  const active = [];
  daysData.forEach(d => {
    const ds = daysState[d.day];
    if (!ds) return;
    const plan = mealPlans[d.mealPlanKey] || mealPlans.A;
    let prot = 0;
    if (ds.meals) {
      plan.meals.forEach(m => { if (ds.meals[m.id]) prot += m.protein; });
    }
    if (ds.customMeals) {
      ds.customMeals.forEach(cm => { prot += Number(cm.protein || 0); });
    }
    const hasActivity = prot > 0 || (ds.exercises && Object.values(ds.exercises).some(Boolean));
    if (hasActivity) {
      active.push({ day: d.day, prot, sleep: Number(ds.sleep || 0), doms: Number(ds.doms || 0) });
    }
  });

  if (active.length === 0) {
    container.innerHTML = `<div class="empty-chart">پس از تیک زدن وعده‌های غذایی و ثبت خواب روزانه، نمودار پایبندی پروتئین و ریکاوری اینجا نمایش داده می‌شود.</div>`;
    return;
  }

  const slice = active.slice(-14);
  const W = 540, H = 200, padL = 36, padR = 16, padT = 22, padB = 30;
  const maxP = Math.max(targetProtein + 20, ...slice.map(s => s.prot), 160);
  const barW = Math.min(26, Math.floor((W - padL - padR) / slice.length) - 8);
  const step = (W - padL - padR) / slice.length;
  const targetY = padT + ((maxP - targetProtein) / maxP) * (H - padT - padB);

  const bars = slice.map((item, i) => {
    const x = padL + i * step + (step - barW) / 2;
    const barH = Math.max(4, (item.prot / maxP) * (H - padT - padB));
    const y = (H - padB) - barH;
    const hit = item.prot >= targetProtein;
    const color = hit ? "#30d158" : "#ff9f0a";
    return `
      <g>
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${barH.toFixed(1)}" rx="5" fill="${color}" opacity="0.88"/>
        <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" fill="#f5f5f7" font-size="9.5">${toFa(item.prot)}</text>
        <text x="${(x + barW / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="#9898a6" font-size="10">ر${toFa(item.day)}</text>
      </g>
    `;
  }).join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="svg-chart">
      <line x1="${padL}" y1="${targetY.toFixed(1)}" x2="${W - padR}" y2="${targetY.toFixed(1)}" stroke="#64d2ff" stroke-dasharray="5 4" stroke-width="1.3"/>
      <text x="${padL - 4}" y="${(targetY + 4).toFixed(1)}" text-anchor="end" fill="#64d2ff" font-size="10">${toFa(targetProtein)}</text>
      ${bars}
    </svg>
  `;
}

export function computeKeyPRs(daysData, daysState) {
  const map = {};
  daysData.forEach(d => {
    const ds = daysState[d.day];
    if (!ds || !ds.logs) return;
    const exList = (d.hasLightMode && ds.lightMode && d.lightExercises) ? d.lightExercises : d.exercises;
    exList.forEach(ex => {
      const l = ds.logs[ex.id];
      if (!l || (!l.val && !l.rep)) return;
      if (!map[ex.id]) {
        map[ex.id] = { id: ex.id, name: ex.name, unit: ex.unit || "", history: [] };
      }
      map[ex.id].history.push({ day: d.day, val: l.val || "-", rep: l.rep || "" });
    });
  });
  return Object.values(map);
}
