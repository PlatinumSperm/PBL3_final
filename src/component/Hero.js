import './Hero.css';

export default function Hero({ status }) {
    return (
        <section className="hero">
  <div className="hero-header">
      <h1>Chào mừng đến với app quản lý sức khỏe của bạn</h1>
      <p>
          Trang quản lý sức khỏe của chúng tôi giúp bạn theo dõi nhịp tim và dự đoán tình trạng sức khỏe
          một cách chính xác.
      </p>
      <div className={`status-card ${status.type}`}>
          {status.text}
      </div>
  </div>
</section>

    );
}
