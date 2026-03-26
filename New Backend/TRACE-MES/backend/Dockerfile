FROM python:3.11-slim

#Prevents Python from writing .pyc files to disk
ENV PYTHONDONTWRITEBYTECODE=1
# Ensures that Python output is sent straight to terminal (e.g. your Docker log) without being first buffered
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y \
    netcat-openbsd \
    gcc \
    libpq-dev \
    && apt-get clean

COPY requirements.txt /app/
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

COPY entrypoint.sh /app/
RUN sed -i 's/\r$//g' /app/entrypoint.sh # elimiate line ending confusions on windows
RUN chmod +x /app/entrypoint.sh

COPY . /app/

ENTRYPOINT ["/app/entrypoint.sh"]