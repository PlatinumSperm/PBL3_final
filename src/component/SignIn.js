import { useState } from "react";
import "./SignIn.css";
import { Link, useNavigate } from "react-router-dom";
import { signIn, signInWithGoogle } from "../authService";
import { toast } from "react-toastify";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSignIn = async (e) => {
    e.preventDefault(); // Ngăn chặn form submit mặc định

    // Kiểm tra dữ liệu đầu vào
    if (!email || !password) {
      toast.error("Vui lòng nhập đầy đủ email và mật khẩu!");
      return;
    }

    // Kiểm tra định dạng email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Email không hợp lệ!");
      return;
    }

    try {
      const { success, isAdmin } = await signIn(email, password);
      if (success) {
        if (isAdmin) {
          navigate("/admin");
        } else {
          navigate("/");
        }
      }
    } catch (error) {
      toast.error("Có lỗi xảy ra khi đăng nhập!");
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const success = await signInWithGoogle();
      if (success) {
        navigate("/");
      }
    } catch (error) {
      toast.error("Có lỗi xảy ra khi đăng nhập với Google!");
    }
  };

  return (
    <div className="auth-container">
      <h2>Đăng Nhập</h2>
      <form onSubmit={handleSignIn}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value.trim())}
          required
        />
        <input
          type="password"
          placeholder="Mật khẩu"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="auth-btn-primary">
          Đăng Nhập
        </button>
      </form>
      <button className="auth-btn-secondary" onClick={handleGoogleSignIn}>
        Đăng nhập với Google
      </button>
      <div className="auth-links">
        <Link to="/signup" className="auth-link">
          Chưa có tài khoản? Đăng ký
        </Link>
        <Link to="/reset" className="auth-link">
          Quên mật khẩu?
        </Link>
      </div>
    </div>
  );
}
