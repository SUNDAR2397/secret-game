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

// ---- 20-second fireworks on the correct answer ----
function startFireworks(durationMs) {
  const canvas = $("fireworks");
  if (!canvas) return;
  canvas.hidden = false;
  const ctx = canvas.getContext("2d");
  const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
  resize(); window.addEventListener("resize", resize);
  const colors = ["#c2607a", "#f3dde3", "#ffd36e", "#8ec7ff", "#ff8fab", "#ffffff"];
  let particles = [];
  const burst = (x, y) => {
    const n = 45 + Math.floor(Math.random() * 30);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n, sp = 2 + Math.random() * 4.5;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1,
        color: colors[Math.floor(Math.random() * colors.length)] });
    }
  };
  const start = performance.now();
  let last = 0;
  function frame(t) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (t - last > 320 && t - start < durationMs) {
      burst(Math.random() * canvas.width, canvas.height * (0.1 + Math.random() * 0.5));
      last = t;
    }
    particles.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.vx *= 0.99; p.vy *= 0.99; p.life -= 0.011;
      ctx.globalAlpha = Math.max(p.life, 0); ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.fill();
    });
    particles = particles.filter((p) => p.life > 0);
    if (t - start < durationMs || particles.length) {
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.hidden = true;
      window.removeEventListener("resize", resize);
    }
  }
  requestAnimationFrame(frame);
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
      revealStory();
    } catch {
      try { sessionStorage.removeItem("oj_pw"); } catch (e) {}
      btn.disabled = false; btn.textContent = "Open our story";
      $("error").textContent = "That's not quite it. Try again 💛";
      const card = document.querySelector(".gate-card");
      card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
    }
  });

  // The cheeky question at the very end. Emails you whatever she types.
  const finaleForm = $("finale-form");
  if (finaleForm) {
    finaleForm.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const raw = $("finale-answer").value.trim();
      if (!raw) return;
      const ans = normAns(raw);
      const msg = $("finale-msg");
      const ok = ans.includes("nana") || ans.includes("karun") || QUIZ_SIMPLE.includes(ans);
      if (ok) {
        finaleForm.style.display = "none";
        const hintEl = document.querySelector(".finale-hint");
        if (hintEl) hintEl.style.display = "none";
        msg.textContent = "";
        startFireworks(20000);
        const ty = $("thankyou");
        ty.hidden = false;
        ty.innerHTML =
          `<div class="ty-emoji">🎆</div>` +
          `<h2>You got it 🙈❤️</h2>` +
          `<p>Okay, now I'm the one blushing on the other side of the world.</p>` +
          `<p class="ty-sign">Thank you, Munnu. For these two months, and for being exactly you.<br>— Karun</p>`;
        setTimeout(() => ty.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
      } else {
        msg.style.color = "var(--accent)";
        msg.textContent = "Nope 😌 that's not it. Hint: what do you call me?";
        const card = document.querySelector(".finale-card");
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
