# TriQRide — Backend Server

A Node.js/Express backend for the TriQRide tricycle driver management system. Provides APIs for driver registration, QR code generation, violation reporting, seminar tracking, and push notifications via Firebase Cloud Messaging.

## Tech Stack

| Layer         | Technology                  |
| ------------- | --------------------------- |
| Runtime       | Node.js                     |
| Framework     | Express.js                  |
| Database      | MySQL (Clever Cloud)        |
| File Storage  | Firebase Storage            |
| Notifications | Firebase Cloud Messaging    |
| Auth          | JWT (jsonwebtoken) + bcrypt |
| QR Codes      | qrcode                      |

## Project Structure

```
TriQRide/
├── server.js                          # Entry point — middleware & route mounting
├── package.json
├── .env                               # Environment variables (DB, JWT, Firebase)
├── .gitignore
├── signup-1e8a0-...json               # Firebase service account key
└── src/
    ├── config/
    │   ├── db.js                      # MySQL connection
    │   └── firebase.js                # Firebase Admin SDK + storage bucket
    ├── middleware/
    │   ├── auth.js                    # JWT authentication
    │   ├── upload.js                  # Multer (image upload, 5MB limit)
    │   └── logger.js                  # Request logging
    └── routes/
        ├── auth.routes.js             # Login, Register, Head Admin
        ├── admin.routes.js            # Pending admins, Approve/Deny
        ├── profile.routes.js          # Get/Edit user profile
        ├── driver.routes.js           # Driver CRUD, search, image upload
        ├── report.routes.js           # Submit & fetch reports
        ├── qr.routes.js               # QR code generation & lookup
        ├── notification.routes.js     # FCM tokens, push notifications
        └── seminar.routes.js          # Seminar eligibility, attendance, violations reset
```

## Setup

### Prerequisites

- Node.js (v16+)
- MySQL database
- Firebase project with Storage and Cloud Messaging enabled

### Installation

```bash
# Install dependencies
npm install

# Create .env file with your credentials (see .env.example below)
```

### Environment Variables (`.env`)

```env
PORT=4500
DB_HOST=your-mysql-host
DB_USER=your-mysql-user
DB_PASSWORD=your-mysql-password
DB_NAME=your-database-name
JWT_SECRET=your-jwt-secret
FIREBASE_STORAGE_BUCKET=gs://your-project.appspot.com
```

### Running the Server

```bash
# Development (with auto-restart)
npm start

# Or directly
node server.js
```

The server starts on `http://localhost:4500` by default.

## API Endpoints

### Authentication

| Method | Endpoint             | Description                |
| ------ | -------------------- | -------------------------- |
| POST   | `/create-head-admin` | Create the Head Admin      |
| GET    | `/check-head-admin`  | Check if Head Admin exists |
| POST   | `/login`             | User login (returns JWT)   |
| POST   | `/register`          | Register new admin         |

### Admin Management

| Method | Endpoint             | Description         |
| ------ | -------------------- | ------------------- |
| GET    | `/pending-admins`    | List pending admins |
| POST   | `/approve-admin/:id` | Approve an admin    |
| POST   | `/deny-admin/:id`    | Deny an admin       |

### Profile

| Method | Endpoint               | Description    |
| ------ | ---------------------- | -------------- |
| GET    | `/api/getProfile/:id`  | Get profile    |
| PUT    | `/api/editProfile/:id` | Update profile |

### Drivers

| Method | Endpoint                   | Description                 |
| ------ | -------------------------- | --------------------------- |
| POST   | `/api/list`                | Add driver (with image)     |
| GET    | `/api/list`                | Get all drivers             |
| GET    | `/api/list/:id`            | Get driver by ID            |
| GET    | `/api/list/:id/image`      | Get driver image            |
| GET    | `/api/drivers`             | Search drivers              |
| GET    | `/api/driver/:plateNumber` | Driver details + violations |
| PUT    | `/api/driver/update`       | Update driver               |
| DELETE | `/api/remove`              | Delete driver               |

### Reports

| Method | Endpoint            | Description                |
| ------ | ------------------- | -------------------------- |
| GET    | `/api/reports`      | Get reports (month filter) |
| GET    | `/api/reportmonths` | Get all reports            |
| POST   | `/api/report/:id`   | Submit a report            |

### QR Codes

| Method | Endpoint      | Description                |
| ------ | ------------- | -------------------------- |
| GET    | `/api/qr/:id` | Generate QR for driver     |
| GET    | `/api/qr`     | Lookup driver by QR params |

### Notifications

| Method | Endpoint                 | Description               |
| ------ | ------------------------ | ------------------------- |
| POST   | `/api/token`             | Store/update FCM token    |
| POST   | `/sendnotification`      | Send push notification    |
| POST   | `/api/notify-attendance` | Notify seminar attendance |

### Seminars

| Method | Endpoint                  | Description                |
| ------ | ------------------------- | -------------------------- |
| GET    | `/api/seminar`            | Drivers with 3+ violations |
| POST   | `/api/reset-violations`   | Record attendance & reset  |
| GET    | `/api/seminar-attendance` | Attendance stats by month  |
| GET    | `/api/server-time`        | Current server timestamp   |
