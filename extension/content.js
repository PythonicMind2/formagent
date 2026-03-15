// FormAgent — Content Script
(function () {
  "use strict";

  var logEl        = null;
  var fillStarted  = false;
  var allAnswers   = [];
  var allQuestions = [];
  var answerIndex  = 0;
  var pageNum      = 1;

  var STORAGE_KEY = "fa_state";

  console.log("[FormAgent] content script loaded");

  // Try to restore state from sessionStorage (survives Next page navigation)
  function loadState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        allAnswers   = s.answers   || [];
        allQuestions = s.questions || [];
        answerIndex  = s.answerIndex || 0;
        pageNum      = s.pageNum   || 1;
        return true;
      }
    } catch(e) {}
    return false;
  }

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        answers: allAnswers, questions: allQuestions,
        answerIndex: answerIndex, pageNum: pageNum
      }));
    } catch(e) {}
  }

  function clearState() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch(e) {}
  }

  window.addEventListener("formagent:start", function () {
    if (window.__FA_READY__ && !fillStarted) {
      fillStarted = true;
      init(window.__FA_ANSWERS__, window.__FA_QUESTIONS__ || []);
    }
  });

  var pollCount = 0;
  var poller = setInterval(function() {
    pollCount++;
    if (window.__FA_READY__ && !fillStarted) {
      clearInterval(poller);
      fillStarted = true;
      init(window.__FA_ANSWERS__, window.__FA_QUESTIONS__ || []);
    }
    // Check if we have saved state from a previous page (user clicked Next)
    if (!fillStarted && loadState() && allAnswers.length > 0) {
      clearInterval(poller);
      fillStarted = true;
      resumeFromState();
    }
    if (pollCount > 30) clearInterval(poller);
  }, 500);

  // ── Init (fresh start) ─────────────────────────────────────────────────────
  async function init(answers, questions) {
    allAnswers   = answers;
    allQuestions = questions;
    answerIndex  = 0;
    pageNum      = 1;
    saveState();
    showOverlay();
    log("🤖 FormAgent ready", "info");
    log("📋 " + answers.length + " answers loaded", "info");
    await sleep(1500);
    await fillCurrentPage();
  }

  // ── Resume after Next page navigation ─────────────────────────────────────
  async function resumeFromState() {
    showOverlay();
    var remaining = allAnswers.length - answerIndex;
    log("🤖 FormAgent resumed", "info");
    log("📋 " + remaining + " answers remaining", "info");
    await sleep(800);
    // Show the Fill button immediately — user is on a new page
    if (remaining > 0) {
      log("👆 Press Fill This Page", "info");
      setFillBtnState("ready");
    } else {
      log("✅ All answers used!", "done");
      setFillBtnState("done");
      clearState();
    }
  }

  // ── Fill current visible page ──────────────────────────────────────────────
  async function fillCurrentPage() {
    var containers = getFillableContainers();
    if (!containers.length) {
      log("⚠️ No fillable fields found", "warn");
      return;
    }

    log("📄 Page " + pageNum + " — " + containers.length + " fields", "info");
    setFillBtnState("filling");

    var filled = 0;
    for (var ci = 0; ci < containers.length; ci++) {
      var ai = answerIndex + ci;
      if (ai >= allAnswers.length) break;
      var ans       = allAnswers[ai];
      var q         = (allQuestions || []).find(function(x){ return x.index === ai; }) || {};
      var container = containers[ci];
      var type      = detectFieldType(container);

      try {
        await fillField(container, type, ans.answer || "", ans.selected || []);
        var label = (q.questionText || "Field "+(ai+1)).slice(0, 30);
        var val   = type === "checkbox" ? (ans.selected||[]).join(", ") : (ans.answer||"");
        log("✓ " + label + " → " + val.slice(0, 25), "ok");
        filled++;
        await sleep(300);
      } catch(e) {
        log("⚠️ Q"+(ai+1)+": "+e.message.slice(0,40), "warn");
      }
    }

    answerIndex += containers.length;
    pageNum++;
    saveState();

    if (answerIndex >= allAnswers.length) {
      log("🎉 All done! Click Submit", "done");
      setFillBtnState("done");
      sendProgress("done", answerIndex);
      clearState();
    } else {
      log("👆 Click Next, then press Fill Page", "info");
      setFillBtnState("ready");
    }
  }

  // ── Overlay with Fill Page button ──────────────────────────────────────────
  function showOverlay() {
    if (document.getElementById("_fa_wrap")) return;
    var style = document.createElement("style");
    style.textContent =
      "#_fa_wrap{position:fixed;bottom:20px;right:20px;z-index:2147483647;font-family:monospace}" +
      "#_fa_panel{background:#0d1520;border:1px solid #253550;border-radius:14px;width:300px;box-shadow:0 20px 60px rgba(0,0,0,.8)}" +
      "#_fa_head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#111b2b;border-bottom:1px solid #1e3050;border-radius:14px 14px 0 0}" +
      "#_fa_name{font-size:13px;font-weight:800;background:linear-gradient(135deg,#6ee7b7,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent}" +
      "#_fa_x{background:none;border:none;color:#3a5070;cursor:pointer;font-size:15px;padding:0 2px}" +
      "#_fa_x:hover{color:#e2e8f0}" +
      "#_fa_body{padding:8px 12px;max-height:220px;overflow-y:auto;font-size:11px;line-height:1.85}" +
      "#_fa_footer{padding:10px 12px;border-top:1px solid #1e3050}" +
      "#_fa_btn{width:100%;padding:9px;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s;letter-spacing:.02em}" +
      "#_fa_btn.ready{background:linear-gradient(135deg,#6ee7b7,#818cf8);color:#0d1520}" +
      "#_fa_btn.ready:hover{opacity:.9;transform:translateY(-1px)}" +
      "#_fa_btn.filling{background:#1e3050;color:#60a5fa;cursor:default}" +
      "#_fa_btn.done{background:rgba(110,231,183,.15);color:#6ee7b7;border:1px solid rgba(110,231,183,.3);cursor:default}" +
      "._fl{display:flex;gap:6px;animation:_fla .15s ease}" +
      "@keyframes _fla{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}}" +
      "._ft{color:#2a4060;flex-shrink:0;font-size:9px;margin-top:3px}" +
      "._fi{color:#60a5fa}._fo{color:#34d399}._fw{color:#fbbf24}._fe{color:#f87171}._fd{color:#c084fc}";
    document.head.appendChild(style);

    var w = document.createElement("div");
    w.id = "_fa_wrap";
    w.innerHTML =
      "<div id='_fa_panel'>" +
        "<div id='_fa_head'><span id='_fa_name'>FormAgent</span><button id='_fa_x'>✕</button></div>" +
        "<div id='_fa_body'></div>" +
        "<div id='_fa_footer'>" +
          "<button id='_fa_btn' class='filling'>⏳ Filling page 1...</button>" +
        "</div>" +
      "</div>";
    document.body.appendChild(w);

    logEl = document.getElementById("_fa_body");
    document.getElementById("_fa_x").onclick = function(){ w.remove(); };
    document.getElementById("_fa_btn").onclick = function() {
      var btn = document.getElementById("_fa_btn");
      if (btn.classList.contains("ready")) fillCurrentPage();
    };
  }

  function setFillBtnState(state) {
    var btn = document.getElementById("_fa_btn");
    if (!btn) return;
    btn.className = "_fa_btn " + state;
    if (state === "ready")   { btn.className = "ready";   btn.textContent = "⚡ Fill This Page"; }
    if (state === "filling") { btn.className = "filling"; btn.textContent = "⏳ Filling..."; }
    if (state === "done")    { btn.className = "done";    btn.textContent = "✅ All Done!"; }
    // re-attach id
    btn.id = "_fa_btn";
  }

  // ── Field helpers (same as before) ────────────────────────────────────────
  function getFillableContainers() {
    var selectors = [
      ".freebirdFormviewerViewItemsItemItem",
      "[data-params]", ".Qr7Oae", "[role='listitem']"
    ];
    for (var s = 0; s < selectors.length; s++) {
      var found = Array.from(document.querySelectorAll(selectors[s])).filter(function(c) {
        return c.querySelector("input,textarea,[role='radio'],[role='checkbox'],[role='listbox'],select");
      });
      if (found.length > 0) return found;
    }
    return [];
  }

  function detectFieldType(container) {
    if (container.querySelector("[role='radio']"))     return "radio";
    if (container.querySelector("[role='checkbox']"))  return "checkbox";
    if (container.querySelector("[role='listbox']"))   return "dropdown";
    if (container.querySelector("textarea"))           return "paragraph";
    if (container.querySelector("input[type='date']")) return "date";
    if (container.querySelector("input[type='time']")) return "time";
    if (container.querySelector("input[type='text'],input[type='email'],input[type='number'],input[type='tel']")) return "text";
    return "text";
  }

  function getOptionTexts(el) {
    var texts = new Set();
    var dv = el.getAttribute("data-value"); if (dv) texts.add(dv.trim());
    var al = el.getAttribute("aria-label"); if (al) texts.add(al.trim());
    [".Od2TWd",".docssharedWizToggleLabeledLabelText",".nWQGrd span",".ulDsOb","span[dir='auto']"].forEach(function(sel){
      try {
        var p = el.closest("label,li,.docssharedWizToggleLabeledContainer,[data-value]");
        if (p) { var sp = p.querySelector(sel); if (sp && sp.textContent.trim()) texts.add(sp.textContent.trim()); }
      } catch(e){}
    });
    var parent = el.closest("label,li,.docssharedWizToggleLabeledContainer");
    if (parent && parent.textContent.trim()) texts.add(parent.textContent.trim());
    if (el.innerText && el.innerText.trim()) texts.add(el.innerText.trim());
    return Array.from(texts).filter(function(t){ return t.length > 0; });
  }

  function normalize(s){ return String(s).toLowerCase().replace(/\s+/g," ").trim(); }

  function matchesAnswer(optionTexts, answer, selected) {
    var na = normalize(answer), ns = (selected||[]).map(normalize);
    for (var i = 0; i < optionTexts.length; i++) {
      var no = normalize(optionTexts[i]);
      if (no === na) return true;
      for (var j = 0; j < ns.length; j++) if (no === ns[j]) return true;
      if (no.includes(na) || na.includes(no)) return true;
    }
    return false;
  }

  function fuzzyMatch(els, answer, selected) {
    var na = normalize(answer);
    var aw = na.split(/\s+/).filter(function(w){ return w.length >= 2; });
    var bestScore = -1, bestEl = null;
    els.forEach(function(el) {
      var texts = getOptionTexts(el), score = 0;
      texts.forEach(function(t) {
        var nt = normalize(t), tw = nt.split(/\s+/).filter(function(w){ return w.length >= 2; });
        if (na.includes(nt)) score += 20;
        if (nt.includes(na)) score += 20;
        tw.forEach(function(tw2){ aw.forEach(function(aw2){
          if (tw2===aw2) score+=10;
          else if (aw2.startsWith(tw2)||tw2.startsWith(aw2)) score+=6;
          else if (aw2.includes(tw2)||tw2.includes(aw2)) score+=3;
        });});
        if (nt.length<=6 && nt.length>=2) {
          var letters=nt.split(""), used=[], matched=0;
          letters.forEach(function(l){
            var wi=aw.findIndex(function(w,i){ return used.indexOf(i)===-1&&w[0]===l; });
            if(wi!==-1){used.push(wi);matched++;}
          });
          if(matched===letters.length) score+=matched*8;
        }
      });
      if (score > bestScore) { bestScore = score; bestEl = el; }
    });
    return bestScore > 0 ? bestEl : null;
  }

  async function fillField(container, type, answer, selected) {
    if (type === "text" || type === "paragraph") {
      var inp = container.querySelector("textarea,input[type='text'],input[type='email'],input[type='number'],input[type='tel']");
      if (!inp) throw new Error("text input not found");
      inp.focus(); await sleep(80); setVal(inp, answer); inp.blur();

    } else if (type === "radio") {
      var radios = Array.from(container.querySelectorAll("[role='radio']"));
      if (!radios.length) throw new Error("no radio buttons");
      var hit = radios.find(function(r){ return matchesAnswer(getOptionTexts(r), answer, selected); });
      if (!hit) hit = fuzzyMatch(radios, answer, selected);
      var toClick = hit || radios[0];
      toClick.click(); await sleep(200);
      if (toClick.getAttribute("aria-checked") !== "true") {
        var lbl = toClick.closest("label,.docssharedWizToggleLabeledContainer");
        if (lbl) lbl.click();
      }

    } else if (type === "checkbox") {
      var boxes = Array.from(container.querySelectorAll("[role='checkbox']"));
      if (!boxes.length) throw new Error("no checkboxes");
      for (var b = 0; b < boxes.length; b++) {
        if (matchesAnswer(getOptionTexts(boxes[b]), answer, selected) && boxes[b].getAttribute("aria-checked") !== "true") {
          boxes[b].click(); await sleep(150);
        }
      }

    } else if (type === "dropdown") {
      var select = container.querySelector("select");
      if (select) {
        var opts = Array.from(select.options);
        var hit2 = opts.find(function(o){ return matchesAnswer([o.text, o.value], answer, selected); });
        if (hit2) { select.value = hit2.value; setVal(select, hit2.value); }
      } else {
        var lb = container.querySelector("[role='listbox']");
        if (lb) {
          lb.click(); await sleep(700);
          var opts2 = Array.from(document.querySelectorAll("[role='option']"));
          var hit3 = opts2.find(function(o){ return matchesAnswer([o.textContent.trim(), o.getAttribute("data-value")||""], answer, selected); });
          if (hit3) hit3.click(); else if (opts2.length > 1) opts2[1].click();
        }
      }

    } else if (type === "date") {
      var di = container.querySelector("input[type='date']"); if (di) setVal(di, answer);
    } else if (type === "time") {
      var ti = container.querySelector("input[type='time']"); if (ti) setVal(ti, answer);
    }
  }

  function setVal(el, value) {
    var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var desc  = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup",   { bubbles: true }));
  }

  function sendProgress(event, data) {
    try { chrome.runtime.sendMessage({ action: "FILL_PROGRESS", event: event, data: data }); } catch(e) {}
  }

  function log(msg, type) {
    if (!logEl) { console.log("[FormAgent]", msg); return; }
    var cls = {info:"_fi",ok:"_fo",warn:"_fw",error:"_fe",done:"_fd"}[type]||"_fi";
    var now = new Date(); var ts = pad(now.getHours())+":"+pad(now.getMinutes())+":"+pad(now.getSeconds());
    var row = document.createElement("div");
    row.className = "_fl";
    row.innerHTML = "<span class='_ft'>"+ts+"</span><span class='"+cls+"'>"+esc(msg)+"</span>";
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function pad(n){ return String(n).padStart(2,"0"); }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
})();
