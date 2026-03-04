FROM php:8.3-cli

RUN apt-get update && apt-get install -y \
    curl libcurl4-openssl-dev libssl-dev \
    && docker-php-ext-install curl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . /app

RUN mkdir -p /tmp/chatapp_sessions /tmp/chatapp_rl \
    && chmod 777 /tmp/chatapp_sessions /tmp/chatapp_rl

COPY start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]
