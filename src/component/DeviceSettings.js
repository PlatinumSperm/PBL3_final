import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, storage } from '../firebase';
import { 
  onAuthStateChanged, 
  signOut, 
  updatePassword, 
  reauthenticateWithCredential, 
  EmailAuthProvider,
  updateProfile 
} from 'firebase/auth';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import mqtt from 'mqtt';
import Navbar from './Navbar';
import './DeviceSettings.css';

export default function DeviceSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [age, setAge] = useState('');
  const [name, setName] = useState('');
  const [addr, setAddr] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [wifi, setWifi] = useState({
    ssid: '',
    password: ''
  });
  const [passwordChange, setPasswordChange] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [showMessage, setShowMessage] = useState({ text: '', type: '' });
  const [activeTab, setActiveTab] = useState('account');
  const messageTimeoutRef = useRef(null);
  const mqttClientRef = useRef(null);
  const fileInputRef = useRef(null);

  // Danh sách tỉnh thành Việt Nam
  const provinces = [
    'Hà Nội', 'TP Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ',
    'An Giang', 'Bà Rịa - Vũng Tàu', 'Bắc Giang', 'Bắc Kạn', 'Bạc Liêu',
    'Bắc Ninh', 'Bến Tre', 'Bình Định', 'Bình Dương', 'Bình Phước',
    'Bình Thuận', 'Cà Mau', 'Cao Bằng', 'Đắk Lắk', 'Đắk Nông',
    'Điện Biên', 'Đồng Nai', 'Đồng Tháp', 'Gia Lai', 'Hà Giang',
    'Hà Nam', 'Hà Tĩnh', 'Hải Dương', 'Hậu Giang', 'Hòa Bình',
    'Hưng Yên', 'Khánh Hòa', 'Kiên Giang', 'Kon Tum', 'Lai Châu',
    'Lâm Đồng', 'Lạng Sơn', 'Lào Cai', 'Long An', 'Nam Định',
    'Nghệ An', 'Ninh Bình', 'Ninh Thuận', 'Phú Thọ', 'Phú Yên',
    'Quảng Bình', 'Quảng Nam', 'Quảng Ngãi', 'Quảng Ninh', 'Quảng Trị',
    'Sóc Trăng', 'Sơn La', 'Tây Ninh', 'Thái Bình', 'Thái Nguyên',
    'Thanh Hóa', 'Thừa Thiên Huế', 'Tiền Giang', 'Trà Vinh', 'Tuyên Quang',
    'Vĩnh Long', 'Vĩnh Phúc', 'Yên Bái'
  ];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setLoading(false);
      if (user) {
        setUser(user);
        // Fetch user data from Firestore
        const fetchUserData = async () => {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setPhoneNumber(userData.phoneNumber || '');
            setAge(userData.age || '');
            setName(userData.name || '');
            setAddr(userData.addr || '');
          }
        };
        fetchUserData();

        // Setup MQTT connection
        const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt');
        mqttClientRef.current = client;

        client.on('connect', () => {
          console.log('MQTT Connected');
        });

      } else {
        navigate('/signin');
      }
    });

    return () => {
      unsubscribe();
      if (mqttClientRef.current) {
        mqttClientRef.current.end();
      }
    };
  }, [navigate]);

  useEffect(() => {
    if (showMessage.text) {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
      messageTimeoutRef.current = setTimeout(() => {
        setShowMessage({ text: '', type: '' });
      }, 3000);
    }
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
    };
  }, [showMessage.text]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setShowMessage({ text: 'Ảnh không được quá 5MB', type: 'error' });
        return;
      }
      if (!file.type.startsWith('image/')) {
        setShowMessage({ text: 'Vui lòng chọn file ảnh', type: 'error' });
        return;
      }
      setAvatarFile(file);
    }
  };

  const handleAccountSubmit = async (e) => {
    e.preventDefault();
    try {
      if (user) {
        // Update user info in Firestore
        await updateDoc(doc(db, 'users', user.uid), {
          phoneNumber,
          age,
          name,
          addr
        });

        // Upload avatar if selected
        if (avatarFile) {
          const storageRef = ref(storage, `avatars/${user.uid}`);
          await uploadBytes(storageRef, avatarFile);
          const downloadURL = await getDownloadURL(storageRef);
          await updateProfile(user, { photoURL: downloadURL });
        }

        setShowMessage({ text: 'Thông tin tài khoản đã được cập nhật!', type: 'success' });
        setAvatarFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    } catch (error) {
      setShowMessage({ text: 'Có lỗi xảy ra: ' + error.message, type: 'error' });
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!user) {
        throw new Error('Vui lòng đăng nhập lại');
      }

      if (passwordChange.newPassword !== passwordChange.confirmPassword) {
        throw new Error('Mật khẩu mới không khớp');
      }

      if (passwordChange.newPassword.length < 6) {
        throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự');
      }

      const credential = EmailAuthProvider.credential(
        user.email,
        passwordChange.oldPassword
      );
      await reauthenticateWithCredential(user, credential);

      await updatePassword(user, passwordChange.newPassword);

      setPasswordChange({
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setShowMessage({ text: 'Đổi mật khẩu thành công!', type: 'success' });
    } catch (error) {
      let errorMessage = 'Có lỗi xảy ra: ';
      switch (error.code) {
        case 'auth/wrong-password':
          errorMessage += 'Mật khẩu cũ không chính xác';
          break;
        case 'auth/weak-password':
          errorMessage += 'Mật khẩu mới quá yếu';
          break;
        default:
          errorMessage += error.message;
      }
      setShowMessage({ text: errorMessage, type: 'error' });
    }
  };

  const handleDeviceSubmit = (e) => {
    e.preventDefault();
    try {
      if (user && mqttClientRef.current) {
        const deviceSettings = {
          Date: date,
          Time: time,
          Wifi: wifi.ssid,
          Pass: wifi.password
        };
        
        mqttClientRef.current.publish(
          `thongtinbenhnhan/${user.uid}`,
          JSON.stringify(deviceSettings)
        );
        
        setShowMessage({ text: 'Đã cập nhật thiết lập thiết bị!', type: 'success' });
      }
    } catch (error) {
      setShowMessage({ text: 'Có lỗi xảy ra: ' + error.message, type: 'error' });
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/signin');
    } catch (error) {
      setShowMessage({ text: 'Có lỗi khi đăng xuất: ' + error.message, type: 'error' });
    }
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
      <div className="settings-container">
        <h1>Thiết lập</h1>
        <div className="settings-tabs">
          <button 
            className={`tab-button ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => setActiveTab('account')}
          >
            <span className="tab-icon">👤</span>
            Tài khoản
          </button>
          <button 
            className={`tab-button ${activeTab === 'device' ? 'active' : ''}`}
            onClick={() => setActiveTab('device')}
          >
            <span className="tab-icon">📱</span>
            Thiết bị
          </button>
          <button 
            className={`tab-button ${activeTab === 'password' ? 'active' : ''}`}
            onClick={() => setActiveTab('password')}
          >
            <span className="tab-icon">🔒</span>
            Mật khẩu
          </button>
        </div>

        <div className="settings-layout">

          <div className="settings-content">
            {showMessage.text && (
              <div className={`message ${showMessage.type}`}>
                {showMessage.text}
              </div>
            )}

            {activeTab === 'account' ? (
              <div className="settings-section">
                <h2>Thông tin tài khoản</h2>
                <p className="section-subtitle">Cập nhật thông tin cá nhân của bạn</p>
                <form onSubmit={handleAccountSubmit}>
                  <div className="form-group">
                    <label>Email đăng nhập <span className="required">*</span></label>
                    <input
                      type="text"
                      value={user?.email || ''}
                      disabled
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Họ và tên <span className="required">*</span></label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Nhập họ và tên"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Tuổi <span className="required">*</span></label>
                      <input
                        type="number"
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        placeholder="Nhập tuổi"
                        required
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Khu vực tỉnh thành <span className="required">*</span></label>
                    <select
                      value={addr}
                      onChange={(e) => setAddr(e.target.value)}
                      required
                    >
                      <option value="">-- Chọn tỉnh/thành phố --</option>
                      {provinces.map((province, idx) => (
                        <option key={idx} value={province}>{province}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Số điện thoại <span className="required">*</span></label>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="Nhập số điện thoại (10 chữ số)"
                      pattern="[0-9]{10}"
                      required
                    />
                  </div>
                  <button type="submit" className="submit-btn">
                    💾 Lưu thông tin
                  </button>
                </form>
              </div>
            ) : activeTab === 'password' ? (
              <div className="settings-section">
                <h2>Đổi mật khẩu</h2>
                <p className="section-subtitle">Cập mật khẩu đăng nhập của bạn</p>
                <form onSubmit={handlePasswordSubmit}>
                  <div className="form-group">
                    <label>Mật khẩu cũ <span className="required">*</span></label>
                    <input
                      type="password"
                      value={passwordChange.oldPassword}
                      onChange={(e) => setPasswordChange({
                        ...passwordChange,
                        oldPassword: e.target.value
                      })}
                      placeholder="Nhập mật khẩu hiện tại"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Mật khẩu mới <span className="required">*</span></label>
                    <input
                      type="password"
                      value={passwordChange.newPassword}
                      onChange={(e) => setPasswordChange({
                        ...passwordChange,
                        newPassword: e.target.value
                      })}
                      placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Xác nhận mật khẩu mới <span className="required">*</span></label>
                    <input
                      type="password"
                      value={passwordChange.confirmPassword}
                      onChange={(e) => setPasswordChange({
                        ...passwordChange,
                        confirmPassword: e.target.value
                      })}
                      placeholder="Nhập lại mật khẩu mới"
                      required
                    />
                  </div>
                  <button type="submit" className="submit-btn">
                    🔑 Đổi mật khẩu
                  </button>
                </form>
              </div>
            ) : (
              <div className="settings-section">
                <h2>Thiết lập thiết bị</h2>
                <p className="section-subtitle">Cấu hình kết nối và voi thiết bị giám sát</p>
                <form onSubmit={handleDeviceSubmit}>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Ngày</label>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        placeholder="mm/dd/yyyy"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Giờ</label>
                      <input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        placeholder="--:-- --"
                        required
                        step="1"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>WiFi SSID</label>
                    <input
                      type="text"
                      value={wifi.ssid}
                      onChange={(e) => setWifi({ ...wifi, ssid: e.target.value })}
                      placeholder="Tên mạng WiFi"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>WiFi Password</label>
                    <input
                      type="password"
                      value={wifi.password}
                      onChange={(e) => setWifi({ ...wifi, password: e.target.value })}
                      placeholder="Mật khẩu WiFi"
                      required
                    />
                  </div>
                  <button type="submit" className="submit-btn">
                    💾 Cập nhật thiết bị
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
