let currentFormat = 'mp4';

// تبديل الصيغة
document.querySelectorAll('.fmt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFormat = btn.dataset.format;
    });
});

// جلب المعلومات
document.getElementById('fetchBtn').addEventListener('click', async () => {
    const input = document.getElementById('urlInput').value;
    const urls = input.split('\n').map(u => u.trim()).filter(u => u);
    
    if (!urls.length) {
        alert('الرجاء إدخال رابط واحد على الأقل');
        return;
    }
    
    const btn = document.getElementById('fetchBtn');
    btn.disabled = true;
    btn.textContent = '⏳ جاري الجلب...';
    
    try {
        const res = await fetch('/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls })
        });
        const results = await res.json();
        renderResults(results);
    } catch (err) {
        alert('حدث خطأ: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍 جلب المعلومات';
    }
});

function renderResults(results) {
    const container = document.getElementById('results');
    container.innerHTML = '';
    
    results.forEach(item => {
        if (!item.success) {
            const errCard = document.createElement('div');
            errCard.className = 'video-card';
            errCard.innerHTML = `<div class="video-info">
                <div class="video-title">❌ فشل جلب: ${item.url}</div>
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
                <div class="video-meta">👤 ${item.uploader} • ⏱ ${formatDuration(item.duration)}</div>
                <div>
                    <select class="quality-select">${qualities || '<option value="">أفضل جودة</option>'}</select>
                    <button class="download-btn">⬇ تحميل</button>
                </div>
                <div class="progress-bar" style="display:none;"><div class="progress-fill"></div></div>
            </div>
        `;
        
        const dlBtn = card.querySelector('.download-btn');
        const quality = card.querySelector('.quality-select');
        const progressBar = card.querySelector('.progress-bar');
        const progressFill = card.querySelector('.progress-fill');
        
        dlBtn.addEventListener('click', async () => {
            dlBtn.disabled = true;
            dlBtn.textContent = '⏳ جاري التحميل...';
            progressBar.style.display = 'block';
            
            const res = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: item.url,
                    format: currentFormat,
                    quality: quality.value
                })
            });
            const data = await res.json();
            
            // متابعة الحالة
            const interval = setInterval(async () => {
                const statusRes = await fetch(`/api/status/${data.download_id}`);
                const status = await statusRes.json();
                
                progressFill.style.width = (status.progress || 0) + '%';
                
                if (status.status === 'completed') {
                    clearInterval(interval);
                    dlBtn.textContent = '✅ اكتمل';
                    dlBtn.style.background = 'linear-gradient(135deg, #00c853, #00796b)';
                } else if (status.status === 'error') {
                    clearInterval(interval);
                    dlBtn.textContent = '❌ فشل';
                    dlBtn.style.background = 'linear-gradient(135deg, #d32f2f, #b71c1c)';
                }
            }, 1000);
        });
        
        container.appendChild(card);
    });
}

function formatDuration(seconds) {
    if (!seconds) return 'غير معروف';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0 ? `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`
                 : `${m}:${s.toString().padStart(2,'0')}`;
}
