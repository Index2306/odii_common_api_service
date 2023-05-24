#!/bin/bash

echo "Start notify"

MSG=$1
if [ -z $MSG ]; then
    echo "Error: Parameter 1<telegram message> is empty."
    exit 0
fi

TOKEN="1839732926:AAGw3MDeD1FcU6iiZBOAiXu-WpRa6YZ0iYo"
ID="-1001512743608"
URL="https://api.telegram.org/bot$TOKEN/sendMessage"

echo "send telegram notify: $MSG"
curl -s -X POST $URL -d chat_id=$ID -d text="$MSG" > /dev/null 2>&1

