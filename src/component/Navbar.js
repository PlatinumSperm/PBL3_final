import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useTheme } from '../contexts/ThemeContext';
import './Navbar.css';

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setDropdownOpen(false);
      navigate('/signin');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleSettings = () => {
    setDropdownOpen(false);
    navigate('/device-settings');
  };

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo">
        <img src="/logobk.jpg" alt="Logo" className="logo-img" /> 
        ❤️<span>Giám sát nhịp tim</span>
      </Link>
      <ul className="navbar-menu">
        <li><Link to="/">❤️ Nhịp tim</Link></li>
        <li><Link to="/health-history">📊 Lịch sử báo động</Link></li>
        <li><Link to="/device-settings">⚙️ Thiết lập</Link></li>
      </ul>
      {user && (
        <div className="user-controls" ref={dropdownRef}>
          <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <div className="user-avatar-wrapper" onClick={() => setDropdownOpen(!dropdownOpen)}>
            <img 
              src={user.photoURL || '/default-avatar.png'} 
              alt="Avatar" 
              className="user-avatar" 
            />
          </div>
          {dropdownOpen && (
            <div className="user-dropdown">
              <div className="dropdown-header">
                <div className="dropdown-user-name">{user.displayName || user.email?.split('@')[0] || 'Người dùng'}</div>
                <div className="dropdown-user-email">{user.email}</div>
              </div>
              <div className="dropdown-divider"></div>
              <button className="dropdown-item" onClick={handleSettings}>
                👤 Thiết lập tài khoản
              </button>
              <button className="dropdown-item logout" onClick={handleLogout}>
                🚪 Đăng xuất
              </button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
