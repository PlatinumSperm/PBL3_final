import { useState } from "react";
import "./SignUp.css";
import { Link, useNavigate } from "react-router-dom";
import { signUp } from "../authService";
import { toast } from "react-toastify";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const navigate = useNavigate();

  const handleSignUp = async () => {
    // Kiểm tra điều kiện trước khi đăng ký
    if (!email || !password || !confirmPassword) {
      toast.error("Vui lòng điền đầy đủ thông tin!");
      return;
    }

    if (password.length < 6) {
      toast.error("Mật khẩu phải có ít nhất 6 ký tự!");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Mật khẩu không khớp!");
      return;
    }

    // Thực hiện đăng ký
    const success = await signUp(email, password);
    if (success) {
      toast.success("Đăng ký thành công! Vui lòng đăng nhập.");
      navigate("/signin");
    }
  };

  return (
    <div className="auth-container">
      <h2>Đăng Ký</h2>
      <input
        type="email"
        placeholder="Email mới"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Mật khẩu"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <input
        type="password"
        placeholder="Xác nhận mật khẩu"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />
      <button
        className="auth-btn-primary"
        onClick={handleSignUp}
      >
        Tạo tài khoản
      </button>
      <Link to="/signin" className="auth-link">
        Đã có tài khoản? Đăng nhập
      </Link>
    </div>
  );
}
