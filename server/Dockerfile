FROM python:3.12-slim
WORKDIR /app

# Enable apt over HTTPS (bypasses middleboxes that 503 plain HTTP apt traffic)
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g; s|http://cdn-aws.deb.debian.org|https://deb.debian.org|g; s|http://mirror.yandex.ru|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources

RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]