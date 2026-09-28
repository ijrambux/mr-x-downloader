# gunicorn_config.py
bind = "0.0.0.0:10000"  # Render يحدد المنفذ تلقائياً عبر متغير PORT
workers = 2
threads = 4
timeout = 600  # 10 دقائق للسماح بتحميل الفيديوهات الكبيرة
