import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import './AdminDashboard.css';
import mqtt from 'mqtt';

export default function AdminDashboard() {
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [mqttData, setMqttData] = useState([]);
    const navigate = useNavigate();

    // ✅ Kiểm tra admin
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!user || user.email !== 'admin@admin.com') {
                navigate('/');
            }
        });
        return () => unsubscribe();
    }, [navigate]);

    // ✅ Kết nối MQTT và lấy dữ liệu từ topic thongtinbenhnhan
    useEffect(() => {
        const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt');

        client.on('connect', () => {
            console.log('Connected to MQTT broker');
            client.subscribe('thongtinbenhnhan', (err) => {
                if (!err) {
                    console.log('Subscribed to thongtinbenhnhan');
                }
            });
        });

        client.on('message', (topic, message) => {
            try {
                const data = JSON.parse(message.toString());
                setMqttData((prev) => [
                    {
                        BPM: data.BPM,
                        SpO2: data.SpO2,
                        TempC: data.TempC,
                        timestamp: new Date().toISOString(),
                    },
                    ...prev.slice(0, 49), // giữ 50 bản ghi gần nhất
                ]);
            } catch (error) {
                console.error('Error parsing MQTT message:', error);
            }
        });

        return () => {
            client.end();
        };
    }, []);

    // ✅ Lấy danh sách người dùng từ Firestore
    useEffect(() => {
        const q = query(collection(db, "users"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const usersList = [];
            querySnapshot.forEach((doc) => {
                if (doc.data().email !== 'admin@admin.com') {
                    usersList.push({ id: doc.id, ...doc.data() });
                }
            });
            setUsers(usersList);
        });

        return () => unsubscribe();
    }, []);

    // ✅ Hàm render giá trị với màu cảnh báo
    const renderValue = (value, type) => {
        if (typeof value !== "number" || value === -999) return "N/A";

        let isWarning = false;

        if (type === "BPM" && (value < 50 || value > 120)) isWarning = true;
        if (type === "SpO2" && value < 90) isWarning = true;
        if (type === "TempC" && (value < 35 || value > 38)) isWarning = true;

        return (
            <span style={{ color: isWarning ? "red" : "black", fontWeight: isWarning ? "bold" : "normal" }}>
                {type === "TempC" ? value.toFixed(2) : value}
            </span>
        );
    };

    return (
        <div className="admin-dashboard">
            <h1>Admin Dashboard</h1>
            
            <div className="dashboard-container">
                {/* Cột danh sách user */}
                <div className="users-list">
                    <h2>Danh sách người dùng</h2>
                    {users.map(user => (
                        <button
                            key={user.id}
                            className={`user-button ${selectedUser === user.id ? 'selected' : ''}`}
                            onClick={() => setSelectedUser(user.id)}
                        >
                            {user.email}
                        </button>
                    ))}
                </div>

                {/* Cột dữ liệu MQTT */}
                <div className="data-display">
                    <h2>Dữ liệu real-time</h2>
                    <div className="data-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>BPM</th>
                                    <th>SpO₂ (%)</th>
                                    <th>Nhiệt độ (°C)</th>
                                    <th>Date & Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {mqttData.length > 0 ? (
                                    mqttData.map((data, index) => (
                                        <tr key={index}>
                                            <td>{renderValue(data.BPM, "BPM")}</td>
                                            <td>{renderValue(data.SpO2, "SpO2")}</td>
                                            <td>{renderValue(data.TempC , "TempC")}</td>
                                            <td>
                                                {data.timestamp
                                                    ? new Date(data.timestamp).toLocaleString()
                                                    : "N/A"}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="4">Chưa có dữ liệu</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
