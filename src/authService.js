import {
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase";
import { toast } from "react-toastify";

// Đăng nhập Google
export const signInWithGoogle = async () => {
  try {
    await signInWithPopup(auth, googleProvider);
    toast.success("Đăng nhập Google thành công 🎉");
  } catch (error) {
    toast.error("Đăng nhập Google thất bại ❌");
  }
};

// Đăng ký
export const signUp = async (email, password) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;
    await setDoc(doc(db, "users", user.uid), {
      email: user.email,
      createdAt: new Date(),
    });
    toast.success("Tạo tài khoản thành công 🎉");
    return true;
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      toast.error("❌ Tài khoản đã tồn tại");
    } else if (error.code === "auth/weak-password") {
      toast.error("❌ Mật khẩu quá yếu");
    } else {
      toast.error("❌ Lỗi tạo tài khoản");
    }
    return false;
  }
};

// Đăng nhập Email
export const signIn = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Cập nhật thời gian đăng nhập cuối trong Firestore
    await setDoc(doc(db, "users", user.uid), {
      lastLogin: new Date()
    }, { merge: true });
    
    toast.success("Đăng nhập thành công 🎉");
    
    // Kiểm tra nếu là admin thì chuyển đến trang admin
    if (user.email === "admin@admin.com") {
      return { success: true, isAdmin: true };
    }
    
    return { success: true, isAdmin: false };
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      toast.error("❌ Tài khoản không tồn tại");
    } else if (error.code === "auth/wrong-password") {
      toast.error("❌ Sai mật khẩu");
    } else if (error.code === "auth/invalid-email") {
      toast.error("❌ Email không hợp lệ");
    } else {
      toast.error("❌ Lỗi đăng nhập: " + error.message);
    }
    return { success: false, isAdmin: false };
  }
};

// Reset password
export const resetPassword = async (email) => {
  try {
    await sendPasswordResetEmail(auth, email);
    toast.info("📩 Email reset mật khẩu đã được gửi");
  } catch (error) {
    toast.error("❌ Không thể gửi email reset");
  }
};

// Đăng xuất
export const logout = async () => {
  await signOut(auth);
  toast.info("Bạn đã đăng xuất 👋");
};
