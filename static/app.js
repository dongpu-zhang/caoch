(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const LS_H = "coachg.history.v1", LS_P = "coachg.profile.v1";

  /* ---------------- Mermaid ---------------- */
  mermaid.initialize({
    startOnLoad: false, securityLevel: "strict", theme: "base", suppressErrorRendering: true,
    fontFamily: '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif',
    themeVariables: {
      darkMode: true, background: "#0e1116", fontSize: "14px",
      primaryColor: "#1b2410", primaryBorderColor: "#C6FF3D", primaryTextColor: "#eef3e6",
      secondaryColor: "#2a1a0e", secondaryBorderColor: "#FF7A1A", secondaryTextColor: "#f6e6da",
      tertiaryColor: "#14202b", tertiaryBorderColor: "#3DB8FF", tertiaryTextColor: "#e6f1fa",
      lineColor: "#7f8a99", textColor: "#e8ecf2", mainBkg: "#1b2410", nodeBorder: "#C6FF3D",
      clusterBkg: "#12161c", clusterBorder: "#2d3542", titleColor: "#C6FF3D", edgeLabelBackground: "#14181f",
      pie1: "#C6FF3D", pie2: "#FF7A1A", pie3: "#3DB8FF", pie4: "#B07CFF", pie5: "#FF4D8D", pie6: "#22E0A1", pie7: "#FFD23D",
      pieOpacity: "1", pieStrokeColor: "#0e1116", pieStrokeWidth: "2px", pieOuterStrokeColor: "#0e1116", pieTitleTextColor: "#e8ecf2",
      pieSectionTextColor: "#0b0d10", pieLegendTextColor: "#e8ecf2", pieSectionTextSize: "14px", pieTitleTextSize: "16px",
      sectionBkgColor: "#1b2410", altSectionBkgColor: "#14181f", taskBkgColor: "#C6FF3D", taskTextColor: "#0b0d10",
      taskBorderColor: "#9fd61f", activeTaskBkgColor: "#FF7A1A", activeTaskBorderColor: "#FF7A1A", gridColor: "#2d3542",
      taskTextDarkColor: "#0b0d10", taskTextOutsideColor: "#e8ecf2", todayLineColor: "#FF7A1A",
      cScale0: "#C6FF3D", cScale1: "#FF7A1A", cScale2: "#3DB8FF", cScale3: "#B07CFF", cScale4: "#22E0A1", cScale5: "#FF4D8D",
      cScaleLabel0: "#0b0d10", cScaleLabel1: "#0b0d10", cScaleLabel2: "#0b0d10", cScaleLabel3: "#0b0d10", cScaleLabel4: "#0b0d10", cScaleLabel5: "#0b0d10",
    },
    flowchart: { curve: "basis", padding: 14, htmlLabels: false, useMaxWidth: true },
    pie: { useMaxWidth: true, textPosition: 0.72 },
    gantt: { useMaxWidth: true, barHeight: 24, fontSize: 13 },
  });

  /* ---------------- Markdown ---------------- */
  const b64 = s => btoa(unescape(encodeURIComponent(s)));
  const unb64 = s => decodeURIComponent(escape(atob(s)));
  const escapeHtml = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const renderer = new marked.Renderer();
  const baseCode = renderer.code.bind(renderer);
  renderer.code = function (code, info, escaped) {
    const lang = (info || "").trim().split(/\s+/)[0].toLowerCase();
    const looksSvg = /^\s*<svg[\s>]/i.test(code);
    if (lang === "mermaid" || lang === "svg" || (lang === "xml" || lang === "html") && looksSvg) {
      const kind = lang === "mermaid" ? "mermaid" : "svg";
      return `<div class="diagram pending" data-kind="${kind}" data-src="${b64(code)}"><div class="diagram-head"><span>${kind === "mermaid" ? "教练图示" : "部位示意"}</span></div><div class="diagram-body">图示生成中…</div></div>`;
    }
    return baseCode(code, info, escaped);
  };
  renderer.table = function (header, body) {
    return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
  };
  marked.setOptions({ renderer, gfm: true, breaks: true });

  function mdToHtml(text) {
    return DOMPurify.sanitize(marked.parse(text), { ADD_ATTR: ["data-kind", "data-src", "target"] });
  }

  const svgCache = new Map();
  let mermaidSeq = 0;
  function cleanMermaid(src) {
    return src.replace(/%%\{[\s\S]*?\}%%/g, "").replace(/^\s*(classDef|style|linkStyle|class)\s.*$/gm, "").trim();
  }
  async function renderDiagrams(root) {
    for (const el of $$(".diagram.pending", root)) {
      const kind = el.dataset.kind, src = unb64(el.dataset.src || "");
      const body = $(".diagram-body", el);
      el.classList.remove("pending");
      try {
        let svg;
        const key = kind + ":" + src;
        if (svgCache.has(key)) svg = svgCache.get(key);
        else if (kind === "mermaid") {
          const r = await mermaid.render("mmd-" + (++mermaidSeq) + "-" + Date.now(), cleanMermaid(src));
          svg = r.svg;
        } else {
          svg = DOMPurify.sanitize(src, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ["foreignObject", "image", "script", "a"] });
          if (!/<svg/i.test(svg)) throw new Error("SVG 内容无效");
        }
        svgCache.set(key, svg);
        body.innerHTML = svg;
        const s = $("svg", body);
        if (s && kind === "mermaid" && /^\s*pie\b/.test(cleanMermaid(src))) s.style.maxWidth = "520px";
        if (s && kind === "svg") { s.removeAttribute("width"); s.removeAttribute("height"); s.style.maxWidth = "560px"; s.style.width = "100%"; }
        addDiagramTools(el, kind, src);
      } catch (e) {
        el.classList.add("err");
        body.innerHTML = `<div class="muted small">图示渲染失败，显示原始代码：</div><pre><code>${escapeHtml(src)}</code></pre>`;
        $$('[id^="dmmd-"]').forEach(n => n.remove());
      }
    }
  }
  function addDiagramTools(el, kind, src) {
    const head = $(".diagram-head", el);
    const btn = document.createElement("button");
    btn.textContent = "下载 SVG";
    btn.onclick = () => {
      const svg = $(".diagram-body svg", el);
      if (!svg) return;
      let xml = new XMLSerializer().serializeToString(svg);
      if (!/xmlns=/.test(xml)) xml = xml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      const bg = xml.replace(/(<svg[^>]*>)/, '$1<rect width="100%" height="100%" fill="#0e1116"/>');
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bg], { type: "image/svg+xml" }));
      a.download = "coach-g-diagram.svg"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    head.appendChild(btn);
  }

  /* ---------------- Profile ---------------- */
  const form = $("#profileForm");
  function loadProfile() { try { return JSON.parse(localStorage.getItem(LS_P)) || {}; } catch { return {}; } }
  function readProfile() {
    const p = {};
    new FormData(form).forEach((v, k) => { p[k] = String(v).trim(); });
    const sexBtn = $('.seg[data-name="sex"] button.on'); p.sex = sexBtn ? sexBtn.dataset.v : "";
    p.equipment = $$('.chips-select[data-name="equipment"] button.on').map(b => b.textContent);
    return p;
  }
  function applyProfile(p) {
    for (const [k, v] of Object.entries(p)) {
      const el = form.elements[k];
      if (el && typeof v === "string") el.value = v;
    }
    $$('.seg[data-name="sex"] button').forEach(b => b.classList.toggle("on", b.dataset.v === p.sex));
    const eq = new Set(p.equipment || []);
    $$('.chips-select[data-name="equipment"] button').forEach(b => b.classList.toggle("on", eq.has(b.textContent)));
  }
  const ACT = { "1.2": "久坐办公", "1.375": "轻度活动", "1.55": "中度活动", "1.725": "高度活动", "1.9": "体力劳动/运动员" };
  function calc(p) {
    const w = +p.weight, h = +p.height, a = +p.age, act = +p.activity || 1.375;
    const out = {};
    if (w && h) { const bmi = w / (h / 100) ** 2; out.bmi = bmi.toFixed(1); out.bmiTag = bmi < 18.5 ? "偏瘦" : bmi < 24 ? "正常" : bmi < 28 ? "超重" : "肥胖"; }
    if (w && h && a && p.sex) {
      const bmr = 10 * w + 6.25 * h - 5 * a + (p.sex === "男" ? 5 : -161);
      const tdee = bmr * act, cut = Math.max(tdee * 0.8, p.sex === "男" ? 1500 : 1200);
      const pro = Math.round(w * 2.0), fat = Math.round(w * 0.8), carb = Math.max(0, Math.round((cut - pro * 4 - fat * 9) / 4));
      Object.assign(out, { bmr: Math.round(bmr), tdee: Math.round(tdee), cut: Math.round(cut), pro, fat, carb });
    }
    return out;
  }
  function updateCalc() {
    const p = readProfile(), c = calc(p);
    $("#bmr").textContent = c.bmr ?? "—"; $("#tdee").textContent = c.tdee ?? "—"; $("#cut").textContent = c.cut ?? "—";
    $("#bmi").textContent = c.bmi ?? "—"; $("#bmiTag").textContent = c.bmiTag ?? "\u00a0";
    const m = $("#macro");
    if (c.cut) {
      m.hidden = false;
      const kp = c.pro * 4, kf = c.fat * 9, kc = c.carb * 4, t = kp + kf + kc;
      $(".macro-bar .p").style.width = (kp / t * 100) + "%"; $(".macro-bar .f").style.width = (kf / t * 100) + "%"; $(".macro-bar .c").style.width = (kc / t * 100) + "%";
      $("#mp").textContent = c.pro; $("#mf").textContent = c.fat; $("#mc").textContent = c.carb;
    } else m.hidden = true;
    return { p, c };
  }
  function saveProfile() { localStorage.setItem(LS_P, JSON.stringify(readProfile())); updateCalc(); const s = $("#profileSaved"); s.textContent = "已保存 ✓"; clearTimeout(saveProfile.t); saveProfile.t = setTimeout(() => s.textContent = "自动保存", 1200); }
  form.addEventListener("input", saveProfile);
  form.addEventListener("change", saveProfile);
  $$('.seg[data-name="sex"] button').forEach(b => b.onclick = () => { $$('.seg[data-name="sex"] button').forEach(x => x.classList.toggle("on", x === b)); saveProfile(); });
  $$('.chips-select button').forEach(b => b.onclick = () => { b.classList.toggle("on"); saveProfile(); });
  function profilePayload() {
    const { p, c } = updateCalc();
    const out = { ...p, activity: ACT[p.activity] || p.activity };
    if (c.bmr) out._calc = { bmr: c.bmr, tdee: c.tdee };
    return out;
  }

  /* ---------------- Chat ---------------- */
  const box = $("#messages"), input = $("#input"), sendBtn = $("#sendBtn");
  let history = []; try { history = JSON.parse(localStorage.getItem(LS_H)) || []; } catch { history = []; }
  let busy = false;
  const saveHistory = () => localStorage.setItem(LS_H, JSON.stringify(history.slice(-60)));
  const nearBottom = () => box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  const toBottom = (force) => { if (force || nearBottom()) box.scrollTop = box.scrollHeight; };

  function addMsg(role, content) {
    $("#welcome")?.remove();
    const el = document.createElement("div");
    el.className = "msg " + (role === "user" ? "user" : "bot");
    el.innerHTML = `<div class="av">${role === "user" ? "我" : "G"}</div><div class="bubble"><div class="md"></div></div>`;
    const md = $(".md", el);
    if (role === "user") md.textContent = content; else if (content) { md.innerHTML = mdToHtml(content); renderDiagrams(md); addMeta(el, content); }
    box.appendChild(el);
    return el;
  }
  function addMeta(el, text, secs) {
    const meta = document.createElement("div"); meta.className = "meta";
    meta.innerHTML = `<span>Coach G · Grok 4.7${secs ? " · " + secs + "s" : ""}</span><button type="button">复制</button>`;
    $("button", meta).onclick = (e) => { navigator.clipboard?.writeText(text); e.target.textContent = "已复制"; setTimeout(() => e.target.textContent = "复制", 1200); };
    $(".bubble", el).appendChild(meta);
  }

  async function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true;
    history.push({ role: "user", content: text }); saveHistory();
    addMsg("user", text);
    input.value = ""; autoGrow();
    const el = addMsg("bot", ""), md = $(".md", el);
    md.innerHTML = `<span class="thinking"><span class="bars"><i></i><i></i><i></i><i></i></span><span class="tstat">Coach G 正在分析你的情况…</span></span>`;
    toBottom(true);
    const t0 = performance.now();
    let reply = "", thinkingChars = 0, raf = 0, errMsg = "";
    const paint = () => { raf = 0; const stick = nearBottom(); md.innerHTML = mdToHtml(reply); md.classList.add("cursor"); if (stick) box.scrollTop = box.scrollHeight; };
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-30), profile: profilePayload() }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || ("HTTP " + res.status));
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          let ev = "message", data = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) ev = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          const d = data ? JSON.parse(data) : {};
          if (ev === "delta") { reply += d.t; if (!raf) raf = requestAnimationFrame(paint); }
          else if (ev === "thinking" && !reply) {
            thinkingChars += (d.t || "").length;
            const ts = $(".tstat", md); if (ts) ts.textContent = `Coach G 正在深度思考… ${Math.round((performance.now() - t0) / 1000)}s`;
          } else if (ev === "error") errMsg = d.t;
        }
      }
    } catch (e) { errMsg = String(e.message || e); }
    if (raf) cancelAnimationFrame(raf);
    md.classList.remove("cursor");
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    if (reply) {
      md.innerHTML = mdToHtml(reply);
      history.push({ role: "assistant", content: reply }); saveHistory();
      await renderDiagrams(md);
      addMeta(el, reply, secs);
    }
    if (errMsg) {
      const eb = document.createElement("div"); eb.className = "error-box"; eb.textContent = "出错了：" + errMsg;
      if (!reply) { md.innerHTML = ""; history.pop(); saveHistory(); }
      md.appendChild(eb);
    }
    toBottom();
    busy = false; sendBtn.disabled = false;
    if (window.matchMedia("(min-width: 821px)").matches) input.focus();
  }

  /* ---------------- UI wiring ---------------- */
  function autoGrow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 180) + "px"; }
  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } });
  $("#composer").addEventListener("submit", e => { e.preventDefault(); send(input.value); });
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-q]"); if (b) { closeSidebar(); send(b.dataset.q); }
  });
  $("#clearChat").onclick = () => { if (!confirm("清空全部对话记录？")) return; history = []; saveHistory(); location.reload(); };
  const sb = $("#sidebar"), scrim = $("#scrim");
  function closeSidebar() { sb.classList.remove("open"); scrim.classList.remove("show"); }
  $("#openSidebar").onclick = () => { sb.classList.add("open"); scrim.classList.add("show"); };
  $("#closeSidebar").onclick = closeSidebar; scrim.onclick = closeSidebar;

  fetch("/api/health").then(r => r.json()).then(h => { $("#modelInfo").textContent = `OCI ${h.region} · ${h.model}`; }).catch(() => {});

  if (window.matchMedia("(max-width: 820px)").matches) input.placeholder = "问 Coach G：怎么吃、怎么练…";
  applyProfile(loadProfile()); updateCalc();
  history.forEach(m => addMsg(m.role, m.content));
  toBottom(true);
  window.CoachG = { send };
})();
