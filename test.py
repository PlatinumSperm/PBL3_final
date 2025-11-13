import paho.mqtt.client as mqtt
import time
import json
from datetime import datetime
import random

broker = "broker.emqx.io"
port = 1883
topic = "thongtinbenhnhan/f2bSibFN4iNORrveDvPaPsAnWrr2"
username = "Bao"
password = "123123123"

client = mqtt.Client()
client.username_pw_set(username, password)
client.connect(broker, port, 60)

while True:
    # Tạo dữ liệu giả lập
    data = {
        "BPM": random.randint(95, 110),      # Nhịp tim
        "SpO2": random.randint(98, 100),     # SpO2
        "TempC": round(random.uniform(26, 28), 1),  # Nhiệt độ
        "IR": random.randint(50000, 70000),  # Tín hiệu PPG (IR)
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    payload = json.dumps(data)
    client.publish(topic, payload)
    print("Published:", payload)

    time.sleep(0.1)
