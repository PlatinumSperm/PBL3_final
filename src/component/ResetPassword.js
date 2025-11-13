import { useState } from "react";
import "./ResetPassword.css";
import { Link, useNavigate } from "react-router-dom";
import { resetPassword } from "../authService";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const navigate = useNavigate();

  const handleResetPassword = async () => {
    const success = await resetPassword(email);
    if (success) {
      navigate("/signin");
    }
  };

  return (
    <div className="auth-container">
      <h2>Khôi phục mật khẩu</h2>
      <input
        type="email"
        placeholder="Nhập email của bạn"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className="auth-btn-primary" onClick={handleResetPassword}>
        Gửi liên kết đặt lại mật khẩu
      </button>
      <Link to="/signin" className="auth-link">
        ← Quay lại đăng nhập
      </Link>
    </div>
  );
}
