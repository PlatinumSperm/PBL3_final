import React, { createContext, useContext, useState, useEffect } from 'react';
import mqtt from 'mqtt';

const MQTTContext = createContext();

export const useMQTT = () => {
  return useContext(MQTTContext);
};

export function MQTTProvider({ children }) {
  const [healthData, setHealthData] = useState([]);
  const [currentData, setCurrentData] = useState({
    bpm: null,
    spo2: null,
    temp: null,
    ir: null
  });

  useEffect(() => {
    const client = mqtt.connect("wss://broker.emqx.io:8084/mqtt");

    client.on("connect", () => {
      console.log("Connected to MQTT");
      client.subscribe("thongtinbenhnhan");
    });

    client.on("message", (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        const timestamp = new Date().toLocaleString('vi-VN');
        
        const newData = {
          timestamp,
          bpm: data.BPM !== -999 ? data.BPM : currentData.bpm,
          spo2: data.SpO2 !== -999 ? data.SpO2 : currentData.spo2,
          temp: data.TempC !== -999 ? data.TempC : currentData.temp,
          ir: data.IR !== -999 ? data.IR : currentData.ir
        };

        // Kiểm tra trạng thái báo động
        const isAlert = 
          newData.bpm < 60 || newData.bpm > 100 ||
          newData.spo2 < 90 ||
          newData.temp < 25 || newData.temp > 30;

        const dataWithStatus = {
          ...newData,
          status: isAlert ? 'alert' : 'normal',
          alerts: {
            bpm: newData.bpm < 60 || newData.bpm > 100,
            spo2: newData.spo2 < 90,
            temp: newData.temp < 25 || newData.temp > 30
          }
        };

        // Cập nhật dữ liệu hiện tại
        setCurrentData(newData);

        // Thêm vào lịch sử
        setHealthData(prev => [...prev, dataWithStatus]);

      } catch (err) {
        console.error("Error parsing MQTT:", err);
      }
    });

    return () => {
      client.unsubscribe("thongtinbenhnhan");
      client.end();
    };
  }, []);

  const value = {
    currentData,
    healthData,
    clearHistory: () => setHealthData([])
  };

  return (
    <MQTTContext.Provider value={value}>
      {children}
    </MQTTContext.Provider>
  );
}