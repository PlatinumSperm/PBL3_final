import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import SignIn from './component/SignIn';
import SignUp from './component/SignUp';
import ResetPassword from './component/ResetPassword';
import Home from './component/Home';
import AdminDashboard from './component/AdminDashboard';
import HealthHistory from './component/HealthHistory';
import DeviceSettings from './component/DeviceSettings';
import { MQTTProvider } from './context/MQTTContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {
    return (
        <ThemeProvider>
            <MQTTProvider>
                <Router>
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/signin" element={<SignIn />} />
                        <Route path="/signup" element={<SignUp />} />
                        <Route path="/reset" element={<ResetPassword />} />
                        <Route path="/admin" element={<AdminDashboard />} />
                        <Route path="/health-history" element={<HealthHistory />} />
                        <Route path="/device-settings" element={<DeviceSettings />} />
                    </Routes>
                    <ToastContainer position="top-right" autoClose={3000} />
                </Router>
            </MQTTProvider>
        </ThemeProvider>
    );
}

export default App;
