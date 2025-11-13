# Overview

This is a React-based health monitoring application that tracks vital signs (heart rate, SpO2, temperature) in real-time using MQTT protocol and Firebase for authentication and data storage. The application provides user authentication, real-time health data visualization, alert systems for abnormal readings, and device configuration capabilities.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

**Framework**: React 19 with Create React App
- Single Page Application (SPA) using React Router DOM for navigation
- Component-based architecture with reusable UI components
- Tailwind CSS for styling with custom CSS modules for specific components
- Framer Motion for animations and transitions

**Key Design Decisions**:
- **Routing**: Client-side routing enables seamless navigation between dashboard, health history, device settings, and authentication pages
- **State Management**: React hooks (useState, useEffect, useRef) for local state management; Context API (MQTTContext) for global MQTT connection state
- **Real-time Updates**: MQTT client runs in browser using WebSocket protocol to receive sensor data continuously
- **Responsive Design**: Mobile-first approach with Tailwind CSS utilities

## Authentication & Authorization

**Provider**: Firebase Authentication
- Email/password authentication
- Google OAuth integration via GoogleAuthProvider
- Password reset functionality via email
- Role-based access control (admin vs regular users)

**Key Design Decisions**:
- **Admin Detection**: Hardcoded admin email check (`admin@admin.com`) for administrative access
- **Session Management**: Firebase handles session persistence automatically
- **Protected Routes**: onAuthStateChanged listener redirects unauthorized users
- **User Profiles**: Firebase Firestore stores additional user metadata (creation date, profile info)

## Real-time Data Communication

**Protocol**: MQTT over WebSocket
- **Broker**: Public EMQX broker (`broker.emqx.io:8084/mqtt`)
- **Topics**: User-specific topics (`thongtinbenhnhan/{userId}`) and general topic (`thongtinbenhnhan`)
- **Data Flow**: IoT devices publish health metrics; web app subscribes and processes data in real-time

**Key Design Decisions**:
- **WebSocket Transport**: Enables MQTT in browser environment without additional infrastructure
- **Topic Structure**: User ID-based topics allow personalized data streams
- **Data Format**: JSON payloads with BPM, SpO2, TempC, IR, and timestamp fields
- **Connection Management**: useRef hooks maintain persistent MQTT client connections across component lifecycle

## Data Visualization

**Library**: Recharts for charting
- Line charts for temporal health data visualization
- Responsive containers for adaptive sizing
- Custom tooltips and labels for better UX

**Key Design Decisions**:
- **Chart Types**: Dynamic switching between BPM, SpO2, and Temperature views
- **Data Buffering**: Maintains rolling window of recent data points (typically 50 records)
- **Performance**: Client-side rendering with optimized re-renders using React memoization

## Health Analysis & Alerts

**Rules Engine**: Custom JavaScript-based analysis (`heartrules.js`)
- Activity-based thresholds (Rest, Light Activity, Intense Exercise, Sleep)
- Multi-metric evaluation (BPM, SpO2, Temperature)
- Suggested activity recommendations based on heart rate

**Alert System**:
- **Warning Levels**: Normal, Warning, Error states based on threshold violations
- **Countdown Timers**: 10-second countdown before triggering emergency protocols
- **Toast Notifications**: React-Toastify for non-intrusive alerts
- **Activity Suggestions**: Automatic detection when user's activity doesn't match physiological state

**Key Design Decisions**:
- **Thresholds**: Predefined ranges for different activity levels (e.g., Rest: 60-100 BPM)
- **Grace Period**: Countdown mechanism prevents false alarms from temporary spikes
- **User Confirmation**: Allows users to override automatic activity suggestions

## File Storage

**Provider**: Firebase Storage
- User avatar uploads
- Profile image management

**Key Design Decisions**:
- **Upload Flow**: Client-side file selection → Firebase Storage upload → URL retrieval → Firestore metadata update
- **Default Avatars**: Fallback to default avatar when user hasn't uploaded custom image

# External Dependencies

## Firebase Services

**Firebase Authentication**
- Purpose: User identity management and session handling
- Integration: Direct SDK integration with email/password and Google OAuth providers
- Configuration: API keys and project settings in `firebaseConfig.js`

**Firebase Firestore**
- Purpose: User metadata storage (profiles, settings, preferences)
- Schema: Document-based with collections for `users`
- Operations: Create, read, update user documents

**Firebase Storage**
- Purpose: User-uploaded file storage (profile pictures)
- Integration: Direct SDK with reference-based file access

## MQTT Broker

**EMQX Public Broker**
- Endpoint: `wss://broker.emqx.io:8084/mqtt`
- Purpose: Real-time bidirectional communication for IoT sensor data
- Topic Structure: `thongtinbenhnhan/{userId}` for user-specific streams
- Authentication: Username/password credentials (configured in device/client)

## Third-Party Libraries

**React Router DOM** (v7.8.2)
- Purpose: Client-side routing and navigation

**Recharts** (v3.2.0)
- Purpose: Data visualization and charting

**Framer Motion** (v12.23.12)
- Purpose: Animations and transitions

**React Toastify** (v11.0.5)
- Purpose: Notification system for user feedback

**MQTT.js** (v5.14.1)
- Purpose: MQTT protocol implementation for browser

**Twilio** (v5.10.0)
- Purpose: SMS/communication capabilities (potentially for emergency alerts)
- Note: Integration code not visible in provided files

## Development Tools

**Tailwind CSS** (v4.1.13)
- Purpose: Utility-first CSS framework

**Create React App** (v5.0.1)
- Purpose: Build tooling and development server

**Testing Libraries**
- @testing-library/react, @testing-library/jest-dom, @testing-library/user-event
- Purpose: Component and integration testing