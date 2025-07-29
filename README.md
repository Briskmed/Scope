# MediView Video Call Service

A secure, scalable video calling service designed specifically for healthcare applications. This service provides real-time video communication with features tailored for medical consultations.

## Features

- 🏥 **HIPAA-compliant** video calling
- 👥 Multi-participant video rooms
- 🔒 End-to-end encryption (E2EE)
- 🎥 Screen sharing
- 📝 Real-time annotations
- 🏷️ Role-based access control
- 📊 Call analytics and logging
- 🚀 Scalable WebRTC infrastructure

## Prerequisites

- Node.js 16+
- npm or yarn
- Redis (for production)
- TURN server (for production)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/mediview-video-service.git
   cd mediview-video-service
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your configuration:
   ```env
   PORT=3000
   NODE_ENV=development
   JWT_SECRET=your-secret-key
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
   ```

## Development

1. Start the development server:
   ```bash
   npm run dev
   ```

2. The server will be available at `http://localhost:3000`

## Production Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Start the production server:
   ```bash
   npm start
   ```

## API Documentation

### Authentication
All API endpoints (except `/health`) require a valid JWT token in the `Authorization` header:
```
Authorization: Bearer <your-jwt-token>
```

### Endpoints

#### `GET /health`
Check if the service is running.

**Response:**
```json
{
  "status": "ok",
  "service": "mediview-video-service"
}
```

#### `POST /api/rooms`
Create a new video call room.

**Request Body:**
```json
{
  "title": "Follow-up Consultation",
  "participants": ["doctor-123", "patient-456"],
  "metadata": {
    "appointmentId": "appt-789",
    "medicalRecordId": "mr-123"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "roomId": "room-abc123",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

## WebSocket Events

### Joining a Room
```javascript
socket.emit('join-room', {
  roomId: 'room-abc123',
  user: {
    userId: 'user-123',
    name: 'Dr. Smith',
    role: 'doctor'
  }
});
```

### Sending a Signal
```javascript
socket.emit('signal', {
  roomId: 'room-abc123',
  to: 'participant-456',
  type: 'offer',
  payload: {
    sdp: '...',
    type: 'offer'
  }
});
```

## Security

- All connections use HTTPS/WSS in production
- JWT-based authentication
- Rate limiting on API endpoints
- Input validation on all endpoints
- CORS protection

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
