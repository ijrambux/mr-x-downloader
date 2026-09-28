/* ============================
   نظام الترجمة (i18n)
   ============================ */
const translations = {
    ar: {
        follow: "تابعني على X",
        tagline: "محمّل الوسائط  — يدعم +1000 موقع",
        inputPlaceholder: "الصق رابطاً واحداً أو أكثر (سطر لكل رابط)...",
        fetchBtn: "🔍 جلب المعلومات",
        footer: "© 2026 Mr. X — ",
        fetching: "⏳ جاري الجلب...",
        download: "⬇ تحميل",
        downloading: "⏳ جاري التحميل...",
        ready: "📥 تنزيل الملف",
        completed: "✅ اكتمل",
        failed: "❌ فشل",
        readyMsg: "✅ التحميل جاهز! اضغط على الزر لبدء التنزيل.",
        bestQuality: "أفضل جودة",
        errorFetch: "حدث خطأ أثناء الجلب: ",
        errorEmpty: "الرجاء إدخال رابط واحد على الأقل",
        uploader: "👤",
        duration: "⏱",
        fetchFailed: "❌ فشل جلب: ",
        noFile: "لم يتم العثور على اسم الملف. حاول مرة أخرى.",
        rateLimit: "⚠️ تجاوزت الحد الأقصى اليومي (5 تحميلات). حاول غداً.",
        quotaLabel: "متبقٍ اليوم: "
    },
    en: {
        follow: "Follow me on X",
        tagline: "Professional Media Downloader — Supports 1000+ Sites",
        inputPlaceholder: "Paste one or more URLs (one per line)...",
        fetchBtn: "🔍 Fetch Info",
        footer: "© 2026 Mr. X — Open-source tool for personal use",
        fetching: "⏳ Fetching...",
        download: "⬇ Download",
        downloading: "⏳ Downloading...",
        ready: "📥 Get File",
        completed: "✅ Completed",
        failed: "❌ Failed",
        readyMsg: "✅ Ready! Click the button to start download.",
        bestQuality: "Best Quality",
        errorFetch: "Error while fetching: ",
        errorEmpty: "Please enter at least one URL",
        uploader: "👤",
        duration: "⏱",
        fetchFailed: "❌ Failed to fetch: ",
        noFile: "File name not found. Please try again.",
        rateLimit: "⚠️ Daily limit reached (5 downloads). Try again tomorrow.",
        quotaLabel: "Remaining today: "
    }
};

let currentLang = localStorage.getItem('mrx-lang') || 'ar';
let currentQuota = 5;
let currentFormat = 'mp4';

/* ============================
   تطبيق اللغة
   ============================ */
function applyLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('mrx-lang', lang);

    const html = document.getElementById('htmlRoot');
    if (html) {
        html.setAttribute('lang', lang);
        html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    }

    // تحديث جميع النصوص
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang] && translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });

    // تحديث الـ placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[lang] && translations[lang][key]) {
            el.placeholder = translations[lang][key];
        }
    });

    // تحديث زر اللغة
    const langCurrent = document.querySelector('.lang-current');
    if (langCurrent) {
        langCurrent.textContent = lang === 'ar' ? '🇬🇧 English' : '🇸🇦 عربي';
    }

    // تحديث العداد
    if (typeof updateQuotaBadge === 'function') {
        updateQuotaBadge(currentQuota);
    }
}

/* ============================
   ربط زر اللغة
   ============================ */
document.addEventListener('DOMContentLoaded', () => {
    const langToggle = document.getElementById('langToggle');
    if (langToggle) {
        langToggle.addEventListener('click', (e) => {
            e.preventDefault();
            const newLang = currentLang === 'ar' ? 'en' : 'ar';
            applyLanguage(newLang);
        });
    }

    // ربط زر الصيغة
    document.querySelectorAll('.fmt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFormat = btn.dataset.format;
        });
    });

    // ربط زر الجلب
    const fetchBtn = document.getElementById('fetchBtn');
    if (fetchBtn) {
        fetchBtn.addEventListener('click', handleFetch);
    }

    // تهيئة اللغة عند التحميل
    applyLanguage(currentLang);
    fetchQuota();
});

/* ============================
   عرض الحد اليومي
   ============================ */
function updateQuotaBadge(remaining) {
    currentQuota = remaining;
    const badge = document.getElementById('quotaBadge');
    const text = document.getElementById('quotaText');
    if (!badge || !text) return;

    text.textContent = `${remaining}/5`;

    badge.classList.remove('low', 'empty');
    if (remaining === 0) badge.classList.add('empty');
    else if (remaining <= 2) badge.classList.add('low');
}

async function fetchQuota() {
    try {
        const res = await fetch('/api/quota');
        const data = await res.json();
        updateQuotaBadge(data.remaining);
    } catch (e) {
        console.error('Quota fetch failed', e);
    }
}

/* ============================
   Toast
   ============================ */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 50);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

/* ============================
   معالجة جلب المعلومات
   ============================ */
async function handleFetch() {
    const input = document.getElementById('urlInput');
    const urls = input.value.split('\n').map(u => u.trim()).filter(u => u);

    if (!urls.length) {
        showToast(translations[currentLang].errorEmpty, 'error');
        return;
    }

    const btn = document.getElementById('fetchBtn');
    const span = btn.querySelector('span');
    btn.disabled = true;
    const originalText = span ? span.textContent : '';
    if (span) span.textContent = translations[currentLang].fetching;

    try {
        const res = await fetch('/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls })
        });
        const results = await res.json();
        renderResults(results);
    } catch (err) {
        showToast(translations[currentLang].errorFetch + err.message, 'error');
    } finally {
        btn.disabled = false;
        if (span) span.textContent = translations[currentLang].fetchBtn;
    }
}

/* ============================
   عرض النتائج
   ============================ */
function renderResults(results) {
    const container = document.getElementById('results');
    container.innerHTML = '';
    const t = translations[currentLang];

    results.forEach(item => {
        if (!item.success) {
            const errCard = document.createElement('div');
            errCard.className = 'video-card';
            errCard.innerHTML = `<div class="video-info">
                <div class="video-title">${t.fetchFailed}${item.url}</div>
                <div class="video-meta">${item.error}</div>
            </div>`;
            container.appendChild(errCard);
            return;
        }

        const card = document.createElement('div');
        card.className = 'video-card';

        const qualities = item.formats
            .filter(f => f.resolution && f.resolution !== 'audio only')
            .map(f => `<option value="${f.format_id}">${f.resolution}</option>`)
            .join('');

        card.innerHTML = `
            <img class="video-thumb" src="${item.thumbnail}" alt="thumbnail" onerror="this.style.display='none'">
            <div class="video-info">
                <div class="video-title">${item.title}</div>
                <div class="video-meta">${t.uploader} ${item.uploader} • ${t.duration} ${formatDuration(item.duration)}</div>
                <div>
                    <select class="quality-select">
                        ${qualities || `<option value="">${t.bestQuality}</option>`}
                    </select>
                    <button class="download-btn">${t.download}</button>
                </div>
                <div class="progress-bar" style="display:none;"><div class="progress-fill"></div></div>
            </div>
        `;

        const dlBtn = card.querySelector('.download-btn');
        const quality = card.querySelector('.quality-select');
        const progressBar = card.querySelector('.progress-bar');
        const progressFill = card.querySelector('.progress-fill');

        dlBtn.addEventListener('click', () => handleDownload(item, dlBtn, quality, progressBar, progressFill, card));
        container.appendChild(card);
    });
}

/* ============================
   معالجة التحميل
   ============================ */
async function handleDownload(item, dlBtn, quality, progressBar, progressFill, card) {
    const t = translations[currentLang];
    dlBtn.disabled = true;
    dlBtn.textContent = t.downloading;
    progressBar.style.display = 'block';

    try {
        const res = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: item.url,
                format: currentFormat,
                quality: quality.value
            })
        });

        if (res.status === 429) {
            const errData = await res.json();
            showToast(t.rateLimit, 'error');
            dlBtn.disabled = false;
            dlBtn.textContent = t.download;
            progressBar.style.display = 'none';
            updateQuotaBadge(0);
            return;
        }

        const data = await res.json();

        if (typeof data.remaining !== 'undefined') {
            updateQuotaBadge(data.remaining);
        }

        const interval = setInterval(async () => {
            const statusRes = await fetch(`/api/status/${data.download_id}`);
            const status = await statusRes.json();

            progressFill.style.width = (status.progress || 0) + '%';

            if (status.status === 'completed') {
                clearInterval(interval);
                dlBtn.textContent = t.ready;
                dlBtn.style.background = 'linear-gradient(135deg, #00e676, #00c853)';
                dlBtn.disabled = false;

                dlBtn.onclick = () => {
                    if (status.filename) {
                        window.location.href = `/downloads/${encodeURIComponent(status.filename)}`;
                        showToast(t.readyMsg, 'success');
                    } else {
                        showToast(t.noFile, 'error');
                    }
                };

                const successMsg = document.createElement('div');
                successMsg.style.cssText = 'color: #00e676; font-size: 0.9rem; margin-top: 8px;';
                successMsg.textContent = t.readyMsg;
                card.querySelector('.video-info').appendChild(successMsg);

            } else if (status.status === 'error') {
                clearInterval(interval);
                dlBtn.textContent = t.failed;
                dlBtn.style.background = 'linear-gradient(135deg, #d32f2f, #b71c1c)';
            }
        }, 1000);

    } catch (err) {
        showToast(t.errorFetch + err.message, 'error');
        dlBtn.disabled = false;
        dlBtn.textContent = t.download;
    }
}

/* ============================
   تنسيق المدة
   ============================ */
function formatDuration(seconds) {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0
        ? `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`
        : `${m}:${s.toString().padStart(2,'0')}`;
}
