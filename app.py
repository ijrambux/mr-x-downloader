from flask import Flask, render_template, request, jsonify, send_from_directory
import yt_dlp
import os
import uuid
import threading

app = Flask(__name__)
app.config['DOWNLOAD_FOLDER'] = 'downloads'
os.makedirs(app.config['DOWNLOAD_FOLDER'], exist_ok=True)

# تخزين مؤقت لحالة التحميلات
downloads_status = {}


def get_video_info(url):
    """جلب معلومات الفيديو دون تحميله"""
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


def download_video(download_id, url, format_type, quality):
    """تحميل الفيديو في الخلفية"""
    downloads_status[download_id] = {'status': 'downloading', 'progress': 0}
    
    def progress_hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 1)
            downloaded = d.get('downloaded_bytes', 0)
            downloads_status[download_id]['progress'] = round((downloaded / total) * 100, 1)
        elif d['status'] == 'finished':
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
        downloads_status[download_id]['status'] = 'completed'
    except Exception as e:
        downloads_status[download_id]['status'] = 'error'
        downloads_status[download_id]['error'] = str(e)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/info', methods=['POST'])
def api_info():
    data = request.get_json()
    urls = [u.strip() for u in data.get('urls', []) if u.strip()]
    # إزالة التكرار
    urls = list(dict.fromkeys(urls))
    
    results = []
    for url in urls:
        info = get_video_info(url)
        info['url'] = url
        results.append(info)
    return jsonify(results)


@app.route('/api/download', methods=['POST'])
def api_download():
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
    
    return jsonify({'download_id': download_id})


@app.route('/api/status/<download_id>')
def api_status(download_id):
    return jsonify(downloads_status.get(download_id, {'status': 'unknown'}))


@app.route('/downloads/<filename>')
def download_file(filename):
    return send_from_directory(app.config['DOWNLOAD_FOLDER'], filename, as_attachment=True)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8899, debug=False)
