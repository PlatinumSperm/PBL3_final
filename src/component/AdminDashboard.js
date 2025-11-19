import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import './AdminDashboard.css';
import mqtt from 'mqtt';

export default function AdminDashboard() {
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [userMqttData, setUserMqttData] = useState({});
    const [userStatus, setUserStatus] = useState({});
    const [userActivity, setUserActivity] = useState({});
    const navigate = useNavigate();
    const mqttClientRef = React.useRef(null);

    // ✅ Kiểm tra admin
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!user || user.email !== 'admin@admin.com') {
                navigate('/');
            }
        });
        return () => unsubscribe();
    }, [navigate]);

    // ✅ MQTT kết nối + lắng nghe dữ liệu
    useEffect(() => {
        const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt');
        mqttClientRef.current = client;

        client.on('connect', () => {
            console.log('Connected to MQTT broker');
            client.subscribe('thongtinbenhnhan/#', (err) => {
                if (!err) {
                    console.log('Subscribed to thongtinbenhnhan/#');
                }
            });
        });

        client.on('message', (topic, message) => {
            try {
                const data = JSON.parse(message.toString());
                const parts = topic?.split('/') || [];
                const uid = parts[parts.length - 1] || null;

                if (!uid) return;

                setUserMqttData((prev) => ({
                    ...prev,
                    [uid]: {
                        BPM: data.BPM !== -999 ? data.BPM : null,
                        SpO2: data.SpO2 !== -999 ? data.SpO2 : null,
                        TempC: data.TempC !== -999 ? data.TempC : null,
                        IR: data.IR !== -999 ? data.IR : null,
                        timestamp: new Date(),
                    }
                }));

                setUserStatus((prev) => ({
                    ...prev,
                    [uid]: getStatusFromData(data)
                }));
            } catch (error) {
                console.error('Error parsing MQTT message:', error);
            }
        });

        return () => {
            client.unsubscribe('thongtinbenhnhan/#');
            client.end();
        };
    }, []);

    // ✅ Xác định trạng thái
    const getStatusFromData = (data) => {
        if (!data) return "no-data";

        const bpm = data.BPM;
        const spo2 = data.SpO2;
        const tempC = data.TempC;

        if (bpm === -999 || spo2 === -999 || tempC === -999) {
            return 'no-data';
        }

        if (bpm < 50 || bpm > 120 || spo2 < 90 || tempC < 26 || tempC > 40) {
            return 'alert';
        }

        return 'normal';
    };

    // ✅ Lấy danh sách users từ Firestore
    useEffect(() => {
        const q = query(collection(db, "users"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const usersList = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.email !== 'admin@admin.com') {
                    usersList.push({ id: doc.id, ...data });
                    // Lấy activity mode từ Firestore nếu có
                    if (data.activityMode) {
                        setUserActivity((prev) => ({
                            ...prev,
                            [doc.id]: data.activityMode
                        }));
                    }
                }
            });
            setUsers(usersList);
        });
        return () => unsubscribe();
    }, []);

    // ✅ Nếu user không có dữ liệu MQTT sau 3 giây → no-data
    useEffect(() => {
        const timeouts = {};
        Object.keys(userMqttData).forEach((uid) => {
            if (timeouts[uid]) clearTimeout(timeouts[uid]);
            timeouts[uid] = setTimeout(() => {
                setUserStatus((prev) => ({
                    ...prev,
                    [uid]: 'no-data'
                }));
            }, 3000);
        });
        return () => {
            Object.values(timeouts).forEach((t) => clearTimeout(t));
        };
    }, [userMqttData]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'normal': return '#52c41a';
            case 'alert': return '#ff4d4f';
            default: return '#d9d9d9';
        }
    };

    const getStatusText = (status) => {
        switch (status) {
            case 'normal': return 'Bình thường';
            case 'alert': return 'Báo động';
            default: return 'Chưa có dữ liệu';
        }
    };

    // ✅ Hàm đăng xuất
    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/signin');
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    const selectedUserData = selectedUser ? users.find(u => u.id === selectedUser) : null;
    const selectedUserMqttData = selectedUser ? userMqttData[selectedUser] : null;

    return (
        <div className="admin-dashboard">
            <div className="admin-header">
                <h1>❤️ Quản Lý Sức Khỏe Bệnh Nhân</h1>
                <button className="logout-btn" onClick={handleLogout}>
                    🚪 Đăng Xuất
                </button>
            </div>

            <div className="dashboard-container">

                {/* Grid user */}
                <div className="users-grid">
                    {users.length > 0 ? (
                        users.map(user => {
                            const status = userStatus[user.id] || 'no-data';
                            const bgColor = getStatusColor(status);
                            const isSelected = selectedUser === user.id;

                            return (
                                <div
                                    key={user.id}
                                    className={`user-card ${isSelected ? 'selected' : ''}`}
                                    style={{ borderColor: bgColor, backgroundColor: `${bgColor}15` }}
                                    onClick={() => setSelectedUser(user.id)}
                                >
                                    <div className="user-card-header" style={{ backgroundColor: bgColor }}>
                                        <span className="status-badge">{getStatusText(status)}</span>
                                    </div>

                                    <div className="user-card-content">

                                        <div className="user-field">
                                            <label>👤 Tên đăng nhập</label>
                                            <p>{user.email?.split('@')[0] || 'Không rõ'}</p>
                                        </div>

                                        <div className="user-field">
                                            <label>📧 Email</label>
                                            <p>{user.email || 'Không rõ'}</p>
                                        </div>

                                        {user.phone && (
                                            <div className="user-field">
                                                <label>📱 Điện thoại</label>
                                                <p>{user.phone}</p>
                                            </div>
                                        )}

                                        {user.age && (
                                            <div className="user-field">
                                                <label>🎂 Tuổi</label>
                                                <p>{user.age}</p>
                                            </div>
                                        )}

                                        {user.city && (
                                            <div className="user-field">
                                                <label>🏙️ Thành phố</label>
                                                <p>{user.city}</p>
                                            </div>
                                        )}

                                        <div className="user-field">
                                            <label>🏃 Trạng Thái Vận Động</label>
                                            <p className="activity-status">{userActivity[user.id] || 'Chưa cập nhật'}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <p className="no-users">Không có người dùng nào</p>
                    )}
                </div>

                {/* Panel dữ liệu MQTT */}
                {selectedUserData && (
                    <div className="data-detail-panel">
                        <h2>
                            📈 Dữ liệu Thời Gian Thực – {selectedUserData.email || "Không rõ"}
                        </h2>

                        {selectedUserMqttData ? (
                            <div className="mqtt-data-container">

                                <div className="mqtt-item">
                                    <div className="mqtt-label">Nhịp Tim (BPM)</div>
                                    <div className="mqtt-value" style={{
                                        color: selectedUserMqttData.BPM &&
                                            (selectedUserMqttData.BPM < 50 || selectedUserMqttData.BPM > 120)
                                            ? '#ff4d4f' : '#52c41a'
                                    }}>
                                        {selectedUserMqttData.BPM ?? 'N/A'}
                                    </div>
                                </div>

                                <div className="mqtt-item">
                                    <div className="mqtt-label">Oxy (SpO₂ %)</div>
                                    <div className="mqtt-value" style={{
                                        color: selectedUserMqttData.SpO2 && selectedUserMqttData.SpO2 < 90
                                            ? '#ff4d4f' : '#52c41a'
                                    }}>
                                        {selectedUserMqttData.SpO2?.toFixed(1) ?? 'N/A'}
                                    </div>
                                </div>

                                <div className="mqtt-item">
                                    <div className="mqtt-label">Nhiệt độ (°C)</div>
                                    <div className="mqtt-value" style={{
                                        color: selectedUserMqttData.TempC &&
                                            (selectedUserMqttData.TempC < 26 || selectedUserMqttData.TempC > 40)
                                            ? '#ff4d4f' : '#52c41a'
                                    }}>
                                        {selectedUserMqttData.TempC?.toFixed(2) ?? 'N/A'}
                                    </div>
                                </div>

                                <div className="mqtt-item">
                                    <div className="mqtt-label">PPG (IR)</div>
                                    <div className="mqtt-value">
                                        {selectedUserMqttData.IR ?? 'N/A'}
                                    </div>
                                </div>

                                <div className="mqtt-timestamp">
                                    <span>⏰ Cập nhật lúc: {selectedUserMqttData.timestamp?.toLocaleTimeString('vi-VN')}</span>
                                </div>

                                <div className="mqtt-activity-section">
                                    <div className="mqtt-activity-label">🏃 Trạng Thái Vận Động</div>
                                    <div className="mqtt-activity-value">
                                        {userActivity[selectedUser] || 'Chưa cập nhật'}
                                    </div>
                                </div>

                            </div>
                        ) : (
                            <div className="no-data-message">⏳ Đang chờ dữ liệu...</div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}
