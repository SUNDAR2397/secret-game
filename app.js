// app.js — unlocks (decrypts) the payload and renders the letter.

const $ = (id) => document.getElementById(id);
const subtle = window.crypto.subtle;

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function decrypt(password, payload) {
  const enc = new TextEncoder();
  const salt = b64ToBytes(payload.salt);
  const iv = b64ToBytes(payload.iv);
  const data = b64ToBytes(payload.data);

  const baseKey = await subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: payload.iterations, hash: "SHA-256" },
    baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
  const plain = await subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return JSON.parse(new TextDecoder().decode(plain));
}

function daysBetween(startISO) {
  const start = new Date(startISO + "T00:00:00");
  const now = new Date();
  return Math.max(0, Math.round((now - start) / 86400000));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

function render(c) {
  document.title = c.title || "Our Story";
  $("story-title").textContent = c.title || "";
  $("story-subtitle").textContent = c.subtitle || "";
  document.querySelector(".hero-kicker").textContent =
    [c.you, c.her].filter(Boolean).join("  &  ");

  if (c.start) {
    $("counter").innerHTML = `<b>${daysBetween(c.start)}</b> days since the first hello`;
  } else {
    $("counter").hidden = true;
  }

  const paras = Array.isArray(c.letter) ? c.letter.filter(Boolean) : [];
  $("letter").innerHTML =
    paras.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");

  renderFaves(c.faves);
}

function renderFaves(f) {
  const el = $("faves");
  const items = f && Array.isArray(f.items) ? f.items.filter((it) => it && it.t) : [];
  if (!items.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML =
    (f.title ? `<h2 class="faves-title">${escapeHtml(f.title)}</h2>` : "") +
    (f.note ? `<p class="faves-note">${escapeHtml(f.note)}</p>` : "") +
    `<div class="faves-grid">` +
    items.map((it) =>
      `<div class="fave"><span class="fave-e">${escapeHtml(it.e || "✨")}</span>` +
      `<span class="fave-t">${escapeHtml(it.t)}</span></div>`).join("") +
    `</div>`;

  // Gentle floating emoji in the side margins (wide screens only).
  const emojis = items.map((it) => it.e).filter(Boolean);
  const half = Math.ceil(emojis.length / 2);
  const fill = (id, list) => {
    const box = $(id);
    if (box) box.innerHTML = list.map((e) => `<span>${escapeHtml(e)}</span>`).join("");
  };
  fill("sidewall-left", emojis.filter((_, i) => i % 2 === 0).slice(0, 9));
  fill("sidewall-right", emojis.filter((_, i) => i % 2 === 1).slice(0, 9));
}

let LETTER = null;
const QUIZ_SIMPLE = ["you", "u", "nuvvu", "nuvve", "neevu", "meeru", "nee"];
function normAns(s) { return String(s || "").toLowerCase().replace(/[^a-zఀ-౿]/g, ""); }

function revealStory() {
  if (!LETTER) return;
  render(LETTER);
  $("story").hidden = false;
  window.scrollTo(0, 0);
}

function proceedAfterPassword() {
  try { if (sessionStorage.getItem("oj_quiz") === "1") { revealStory(); return; } } catch (e) {}
  const q = $("quiz");
  if (!q) { revealStory(); return; }
  q.hidden = false;
  setTimeout(() => { const inp = $("quiz-answer"); if (inp) inp.focus(); }, 120);
}

function setup() {
  const payload = window.PAYLOAD;
  if (payload && payload.hint) {
    $("hint").textContent = "Hint: " + payload.hint;
  }
  if (!payload) {
    $("error").textContent = "No letter built yet. Run: node build.mjs";
    return;
  }

  $("gate-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = ev.target.querySelector("button");
    const pwd = $("password").value;
    $("error").textContent = "";
    btn.disabled = true; btn.textContent = "Opening…";
    try {
      const content = await decrypt(pwd, payload);
      LETTER = content;
      try { sessionStorage.setItem("oj_pw", pwd); } catch (e) {}
      const gate = $("gate");
      gate.style.transition = "opacity .6s ease";
      gate.style.opacity = "0";
      setTimeout(() => gate.remove(), 600);
      proceedAfterPassword();
    } catch {
      try { sessionStorage.removeItem("oj_pw"); } catch (e) {}
      btn.disabled = false; btn.textContent = "Open our story";
      $("error").textContent = "That's not quite it. Try again 💛";
      const card = document.querySelector(".gate-card");
      card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
    }
  });

  // Cheeky question — she has to name her favourite person (you) to get in 😏
  const quizForm = $("quiz-form");
  if (quizForm) {
    quizForm.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const ans = normAns($("quiz-answer").value);
      const msg = $("quiz-msg");
      const ok = ans.includes("nana") || ans.includes("karun") || QUIZ_SIMPLE.includes(ans);
      msg.style.color = "var(--accent)";
      if (ok) {
        try { sessionStorage.setItem("oj_quiz", "1"); } catch (e) {}
        msg.textContent = "🙈 okay now you've made me blush… keep reading →";
        const q = $("quiz");
        setTimeout(() => {
          q.style.transition = "opacity .6s ease";
          q.style.opacity = "0";
          setTimeout(() => q.remove(), 600);
          revealStory();
        }, 1200);
      } else {
        msg.textContent = "Nope 😌 that's not it. Hint: what do you call me?";
        const card = $("quiz").querySelector(".gate-card");
        card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
      }
    });
  }

  // Auto-unlock after a live-reload (remembers the password for this browser session).
  let saved = null;
  try { saved = sessionStorage.getItem("oj_pw"); } catch (e) {}
  if (saved) {
    $("password").value = saved;
    $("gate-form").requestSubmit();
  }
}

// Load the encrypted payload with a cache-buster so edits always show up.
(function loadPayload() {
  const s = document.createElement("script");
  s.src = "payload.js?t=" + Date.now();
  s.onload = setup;
  s.onerror = () => { $("error").textContent = "No letter built yet. Run: node build.mjs"; };
  document.head.appendChild(s);
})();
