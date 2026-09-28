from flask import Flask, render_template, request, jsonify, send_from_directory
from datetime import datetime
import yt_dlp
import os
import uuid
import threading
import time

app = Flask(__name__)
app.config['DOWNLOAD_FOLDER'] = 'downloads'
app.config['MAX_DAILY_DOWNLOADS'] = 5  # حد أقصى يومي لكل IP
app.config['FILE_CLEANUP_DELAY'] = 600  # حذف الملف بعد 10 دقائق

os.makedirs(app.config['DOWNLOAD_FOLDER'], exist_ok=True)

# تخزين مؤقت
downloads_status = {}
daily_downloads = {}  # {ip: {'date': date, 'count': int}}
rate_limit_lock = threading.Lock()


# ============================
#   حماية: الحد اليومي لكل IP
# ============================
def check_rate_limit(ip):
    """التحقق من عدد التحميلات اليومية لكل مستخدم"""
    with rate_limit_lock:
        today = datetime.now().date()
        if ip not in daily_downloads:
            daily_downloads[ip] = {'date': today, 'count': 0}

        # إعادة التعيين عند تغيير اليوم
        if daily_downloads[ip]['date'] != today:
            daily_downloads[ip] = {'date': today, 'count': 0}

        if daily_downloads[ip]['count'] >= app.config['MAX_DAILY_DOWNLOADS']:
            return False, app.config['MAX_DAILY_DOWNLOADS'] - daily_downloads[ip]['count']

        daily_downloads[ip]['count'] += 1
        remaining = app.config['MAX_DAILY_DOWNLOADS'] - daily_downloads[ip]['count']
        return True, remaining


def get_remaining_quota(ip):
    """عدد التحميلات المتبقية لـ IP معين"""
    with rate_limit_lock:
        today = datetime.now().date()
        if ip not in daily_downloads or daily_downloads[ip]['date'] != today:
            return app.config['MAX_DAILY_DOWNLOADS']
        return max(0, app.config['MAX_DAILY_DOWNLOADS'] - daily_downloads[ip]['count'])


# ============================
#   تنظيف الملفات تلقائياً
# ============================
def cleanup_file(filepath, delay=None):
    """حذف الملف بعد انتهاء المهلة"""
    if delay is None:
        delay = app.config['FILE_CLEANUP_DELAY']

    def _delete():
        time.sleep(delay)
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
                print(f"[CLEANUP] تم حذف: {filepath}")
        except Exception as e:
            print(f"[CLEANUP ERROR] {e}")

    threading.Thread(target=_delete, daemon=True).start()


# ============================
#   جلب معلومات الفيديو
# ============================
def get_video_info(url):
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                'success': True,
                'title': info.get('title', 'Unknown'),
                'thumbnail': info.get('thumbnail', ''),
                'duration': info.get('duration', 0),
                'uploader': info.get('uploader', 'Unknown'),
                'formats': [
                    {
                        'format_id': f['format_id'],
                        'ext': f.get('ext'),
                        'resolution': f.get('resolution', 'audio only'),
                        'filesize': f.get('filesize'),
                        'note': f.get('format_note', '')
                    }
                    for f in info.get('formats', [])
                    if f.get('ext') in ('mp4', 'mp3', 'm4a', 'webm')
                ]
            }
    except Exception as e:
        return {'success': False, 'error': str(e)}


# ============================
#   التحميل في الخلفية
# ============================
def download_video(download_id, url, format_type, quality):
    downloads_status[download_id] = {
        'status': 'downloading',
        'progress': 0,
        'filename': None
    }

    def progress_hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 1)
            downloaded = d.get('downloaded_bytes', 0)
            downloads_status[download_id]['progress'] = round((downloaded / total) * 100, 1)
        elif d['status'] == 'finished':
            downloads_status[download_id]['filename'] = os.path.basename(d['filename'])
            downloads_status[download_id]['status'] = 'completed'
            downloads_status[download_id]['progress'] = 100

    output_template = os.path.join(
        app.config['DOWNLOAD_FOLDER'],
        f'{download_id}_%(title)s.%(ext)s'
    )

    if format_type == 'mp3':
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': output_template,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'progress_hooks': [progress_hook],
            'quiet': True,
        }
    else:
        fmt = f'{quality}+bestaudio/best' if quality else 'best'
        ydl_opts = {
            'format': fmt,
            'outtmpl': output_template,
            'merge_output_format': 'mp4',
            'progress_hooks': [progress_hook],
            'quiet': True,
        }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        # نضمن أن الحالة اكتملت
        if downloads_status[download_id]['status'] != 'completed':
            # البحث عن الملف الناتج
            for f in os.listdir(app.config['DOWNLOAD_FOLDER']):
                if f.startswith(download_id):
                    downloads_status[download_id]['filename'] = f
                    break
            downloads_status[download_id]['status'] = 'completed'
            downloads_status[download_id]['progress'] = 100

        # جدولة حذف الملف تلقائياً بعد 10 دقائق
        filename = downloads_status[download_id].get('filename')
        if filename:
            filepath = os.path.join(app.config['DOWNLOAD_FOLDER'], filename)
            cleanup_file(filepath)

    except Exception as e:
        downloads_status[download_id]['status'] = 'error'
        downloads_status[download_id]['error'] = str(e)


# ============================
#   الراوتات (Routes)
# ============================
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/info', methods=['POST'])
def api_info():
    data = request.get_json()
    urls = [u.strip() for u in data.get('urls', []) if u.strip()]
    urls = list(dict.fromkeys(urls))

    results = []
    for url in urls:
        info = get_video_info(url)
        info['url'] = url
        results.append(info)
    return jsonify(results)


@app.route('/api/download', methods=['POST'])
def api_download():
    # الحصول على IP المستخدم
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    if ip and ',' in ip:
        ip = ip.split(',')[0].strip()

    # التحقق من الحد اليومي
    allowed, remaining = check_rate_limit(ip)
    if not allowed:
        return jsonify({
            'error': 'rate_limit',
            'message': 'تجاوزت الحد الأقصى اليومي (5 تحميلات). حاول غداً.',
            'remaining': 0
        }), 429

    data = request.get_json()
    url = data.get('url')
    format_type = data.get('format', 'mp4')
    quality = data.get('quality', '')

    download_id = str(uuid.uuid4())[:8]
    thread = threading.Thread(
        target=download_video,
        args=(download_id, url, format_type, quality)
    )
    thread.daemon = True
    thread.start()

    return jsonify({
        'download_id': download_id,
        'remaining': remaining
    })


@app.route('/api/status/<download_id>')
def api_status(download_id):
    return jsonify(downloads_status.get(download_id, {'status': 'unknown'}))


@app.route('/api/quota')
def api_quota():
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    if ip and ',' in ip:
        ip = ip.split(',')[0].strip()
    return jsonify({'remaining': get_remaining_quota(ip)})


@app.route('/downloads/<filename>')
def download_file(filename):
    return send_from_directory(
        app.config['DOWNLOAD_FOLDER'],
        filename,
        as_attachment=True
    )


# ============================
#   تنظيف دوري للملفات القديمة
# ============================
def periodic_cleanup():
    """حذف الملفات الأقدم من ساعة كل 30 دقيقة"""
    while True:
        time.sleep(1800)  # 30 دقيقة
        try:
            now = time.time()
            for f in os.listdir(app.config['DOWNLOAD_FOLDER']):
                filepath = os.path.join(app.config['DOWNLOAD_FOLDER'], f)
                if os.path.isfile(filepath):
                    age = now - os.path.getmtime(filepath)
                    if age > 3600:  # أقدم من ساعة
                        os.remove(filepath)
                        print(f"[PERIODIC CLEANUP] حذف: {f}")
        except Exception as e:
            print(f"[PERIODIC CLEANUP ERROR] {e}")


# تشغيل خيط التنظيف الدوري
cleanup_thread = threading.Thread(target=periodic_cleanup, daemon=True)
cleanup_thread.start()


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8899, debug=False)
