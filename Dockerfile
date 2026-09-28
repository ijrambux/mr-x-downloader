FROM python:3.11-slim

# تثبيت ffmpeg و متطلبات النظام
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# تثبيت مكتبات بايثون
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# نسخ باقي الملفات
COPY . .

# إنشاء مجلد التنزيلات
RUN mkdir -p downloads

# متغير البيئة الافتراضي
ENV PORT=10000
EXPOSE 10000

# تشغيل الخادم
CMD gunicorn --bind 0.0.0.0:$PORT --timeout 600 --workers 2 --threads 4 app:app
