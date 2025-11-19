import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import mqtt from 'mqtt';
import { analyzeHeartData } from '../utils/heartrules';
import Navbar from './Navbar';
import './HealthHistory.css';

export default function HealthHistory() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState(null);

  const [healthData, setHealthData] = useState([]);
  const [currentData, setCurrentData] = useState({
    bpm: null,
    spo2: null,
    temp: null,
    ir: null
  });
  const [activityMode, setActivityMode] = useState('Nghỉ ngơi'); // ✅ Lấy activity mode hiện tại

  const lastDataRef = useRef(null);
  const mqttClientRef = useRef(null);

  // ✅ Filter state
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTimeFrom, setFilterTimeFrom] = useState('');
  const [filterTimeTo, setFilterTimeTo] = useState('');
  const [filterMetrics, setFilterMetrics] = useState({
    bpm: false,
    spo2: false,
    temp: false
  });
  // State to store active filters
  const [activeFilters, setActiveFilters] = useState({
    timeFrom: '',
    timeTo: '',
    metrics: {
      bpm: false,
      spo2: false,
      temp: false
    }
  });

  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setLoading(false);
      if (user) {
        setUid(user.uid); // ✅ lấy uid để tạo topic riêng
      } else {
        navigate('/signin');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // ✅ Listen Firestore để lấy activityMode hiện tại
  useEffect(() => {
    if (!uid) return;

    const userDocRef = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().activityMode) {
        setActivityMode(docSnap.data().activityMode);
      }
    });

    return () => unsubscribe();
  }, [uid]);

  // MQTT và Data Management
  useEffect(() => {
    if (!uid) return;

    // Khôi phục dữ liệu từ localStorage nếu có
    const savedHealthData = localStorage.getItem(`historyData_${uid}`);
    if (savedHealthData) {
      setHealthData(JSON.parse(savedHealthData));
    }

    const client = mqtt.connect("wss://broker.emqx.io:8084/mqtt");
    mqttClientRef.current = client;

    const topic = `thongtinbenhnhan/${uid}`;

    client.on("connect", () => {
      console.log("Connected to MQTT");
      client.subscribe(topic);
    });

    const handleMessage = (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        const prevData = lastDataRef.current || currentData;
        const newData = {
          bpm: data.BPM !== -999 ? data.BPM : prevData.bpm,
          spo2: data.SpO2 !== -999 ? data.SpO2 : prevData.spo2,
          temp: data.TempC !== -999 ? data.TempC : prevData.temp,
          ir: data.IR !== -999 ? data.IR : prevData.ir
        };

        // Use analyzeHeartData to determine warnings/status similarly to Home.js
        // ✅ Dùng activityMode hiện tại từ Firestore
        const analysis = analyzeHeartData(newData.bpm, newData.spo2, newData.temp, activityMode);

        const now = new Date();

        const dataWithStatus = {
          ...newData,
          timestamp: now.toLocaleString('vi-VN', {
            hour12: false,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }),
          timestampRaw: now.toISOString(), // ✅ thêm trường để so sánh filter
          status: analysis.warnings.length > 0 ? 'alert' : 'normal',
          activityMode: activityMode, // ✅ Lưu activity mode khi báo động
          alerts: {
            bpm: analysis.warnings.includes('Nhịp tim bất thường'),
            spo2: analysis.warnings.includes('SpO2 thấp'),
            temp: analysis.warnings.includes('Nhiệt độ bất thường') || false
          }
        };

        lastDataRef.current = dataWithStatus;
        setCurrentData(dataWithStatus);

        // ✅ Chỉ lưu dữ liệu khi có cảnh báo "Nhịp tim bất thường"
        if (analysis.warnings.includes('Nhịp tim bất thường')) {
          setHealthData(prev => {
            const newHealthData = [...prev, dataWithStatus];
            localStorage.setItem(`historyData_${uid}`, JSON.stringify(newHealthData.slice(-1000)));
            return newHealthData;
          });
        }
      } catch (err) {
        console.error("Error parsing MQTT:", err);
      }
    };

    client.on("message", handleMessage);

    return () => {
      client.unsubscribe(topic);
      client.end();
    };
  }, [uid, activityMode]); // ✅ chạy lại khi uid hoặc activityMode thay đổi

  // ✅ Filtered data - Chỉ lấy dữ liệu "Nhịp tim bất thường"
  const filteredData = healthData.filter(item => item.alerts?.bpm === true);

  // ✅ Apply custom filter - Giữ nguyên logic time range
  const applyFilter = (data) => {
    return data.filter(item => {
      // ✅ Đã được lọc ở handleMessage, chỉ chứa BPM alerts
      if (activeFilters.timeFrom || activeFilters.timeTo) {
        const itemDate = new Date(item.timestampRaw); // dùng ISO để so sánh
        if (activeFilters.timeFrom) {
          const fromDate = new Date(activeFilters.timeFrom);
          if (itemDate < fromDate) return false;
        }
        if (activeFilters.timeTo) {
          const toDate = new Date(activeFilters.timeTo);
          if (itemDate > toDate) return false;
        }
      }

      return true;
    });
  };

  const dataToShow = applyFilter(filteredData);

  // ✅ Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const totalPages = Math.ceil(dataToShow.length / itemsPerPage);
  const paginatedData = dataToShow
    .slice()
    .reverse()
    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  const handleResetFilter = () => {
    setFilterTimeFrom('');
    setFilterTimeTo('');
    setFilterMetrics({ bpm: false, spo2: false, temp: false });
    setActiveFilters({
      timeFrom: '',
      timeTo: '',
      metrics: {
        bpm: false,
        spo2: false,
        temp: false
      }
    });
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div className="history-container">
        <h1>Lịch sử báo động</h1>

        <div className="view-toggle" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <button className="filter-toggle-btn" onClick={() => setFilterOpen(!filterOpen)}>
            {filterOpen ? 'Đóng bộ lọc' : 'Bộ lọc'}
          </button>
        </div>

        {filterOpen && (
          <div className="modal-overlay" onClick={() => setFilterOpen(false)}>
            <div className="filter-panel" onClick={(e) => e.stopPropagation()}>
              <button className="filter-panel-close" onClick={() => setFilterOpen(false)}>×</button>
              <h2>Bộ lọc dữ liệu</h2>
              <p className="filter-panel-subtitle">Lọc các cảnh báo theo thời gian và loại</p>
              
              <div className="filter-row">
                <label>Khoảng thời gian</label>
                <div className="filter-time-inputs">
                  <div>
                    <label>Từ</label>
                    <input 
                      type="date" 
                      value={filterTimeFrom} 
                      onChange={e => setFilterTimeFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Đến</label>
                    <input 
                      type="date" 
                      value={filterTimeTo} 
                      onChange={e => setFilterTimeTo(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="filter-row">
                <label style={{color: '#666', fontSize: '13px'}}>Bảng chỉ hiển thị dữ liệu "Nhịp tim bất thường"</label>
                <p style={{margin: '8px 0 0 0', color: '#999', fontSize: '12px'}}>Để lọc thêm, sử dụng bộ lọc thời gian bên dưới</p>
              </div>

              <div className="filter-buttons">
                <button className="filter-cancel-btn" onClick={() => setFilterOpen(false)}>
                  Hủy
                </button>
                <button className="filter-reset-btn" onClick={handleResetFilter}>
                  Reset
                </button>
                <button className="filter-ok-btn" onClick={() => {
                  setCurrentPage(1);
                  setActiveFilters({
                    timeFrom: filterTimeFrom,
                    timeTo: filterTimeTo,
                    metrics: { ...filterMetrics }
                  });
                  setFilterOpen(false);
                }}>
                  Áp dụng
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Nhịp tim (BPM)</th>
                  <th>SpO₂ (%)</th>
                  <th>Nhiệt độ (°C)</th>
                  <th>Chế độ vận động</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((item, index) => (
                  <tr key={index} className={item.status}>
                    <td>{item.timestamp}</td>
                    <td className={item.alerts?.bpm ? 'alert-value' : ''}>{item.bpm}</td>
                    <td className={item.alerts?.spo2 ? 'alert-value' : ''}>{item.spo2}</td>
                    <td className={item.alerts?.temp ? 'alert-value' : ''}>{item.temp}</td>
                    <td>{item.activityMode || 'Nghỉ ngơi'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>
              ⬅ Trước
            </button>
            <span>Trang {currentPage} / {totalPages || 1}</span>
            <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}>
              Sau ➡
            </button>

            <select value={itemsPerPage} onChange={handleItemsPerPageChange}>
              <option value={5}>5 dòng / trang</option>
              <option value={10}>10 dòng / trang</option>
              <option value={20}>20 dòng / trang</option>
              <option value={50}>50 dòng / trang</option>
            </select>
          </div>
        </div>
      </div>
    </>
  );
}
