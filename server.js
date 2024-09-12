const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql');
const moment = require('moment');
const admin = require('firebase-admin');

const app = express();
const PORT = 4500; // Use your desired port number

// Firebase Admin SDK setup
const serviceAccountPath = path.resolve(__dirname, 'signup-1e8a0-firebase-adminsdk-zr2df-da405d54aa.json'); // Replace with your actual path

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('Firebase admin initialized successfully.');
} catch (error) {
  console.error('Failed to load Firebase service account key:', error);
  process.exit(1); // Exit the process if the key cannot be loaded
}

// MySQL connection setup
const dbConfig = {
  host: 'bovvp4rzqlnrqctrlr2n-mysql.services.clever-cloud.com', // Replace with your live database host
  user: 'uzqxfx6afvyrctmc',      // Replace with your live database user
  password: 'QJ3hgHSyI7GyQGSWQAXZ',      // Replace with your live database password
  database: 'bovvp4rzqlnrqctrlr2n', // Replace with your live database name
};

const connect = mysql.createConnection(dbConfig);

connect.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    process.exit(1);
  }
  console.log('Connected to MySQL database.');
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Logger middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - ${moment().format()}`);
  next();
});

// API Endpoints

// Get all records
app.get('/api/list', (req, res) => {
  connect.query('SELECT * FROM datalist', (err, rows) => {
    if (err) {
      console.error('Error fetching data:', err);
      return res.status(500).json({ error: 'Failed to fetch data' });
    }
    res.json(rows);
  });
});

// Get a record by ID
app.get('/api/list/:id', (req, res) => {
  const id = req.params.id;

  connect.query('SELECT * FROM datalist WHERE id = ?', [id], (err, rows) => {
    if (err) {
      console.error('Error fetching data:', err);
      return res.status(500).json({ error: 'Failed to fetch data' });
    }
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {    
      res.status(404).json({ msg: `Record with ID ${id} not found!` });
    }
  });
});

// Add a new record
app.post('/api/list', (req, res) => {
  const { plate, driver, brgy, actions } = req.body;

  connect.query(
    'INSERT INTO datalist (Plate_number, Driver_name, Barangay, Violations) VALUES (?, ?, ?, ?)',
    [plate, driver, brgy, actions],
    (err) => {
      if (err) {
        console.error('Error inserting data:', err);
        return res.status(500).json({ error: 'Failed to insert data' });
      }

      res.json({ msg: 'Successfully posted!' });
    }
  );
});

// Delete a record by ID
app.delete('/api/list', (req, res) => {
  const { id } = req.body;

  connect.query('DELETE FROM datalist WHERE id = ?', [id], (err) => {
    if (err) {
      console.error('Error deleting data:', err);
      return res.status(500).json({ error: 'Failed to delete data' });
    }

    res.json({ msg: 'Successfully deleted!' });
  });
});

// Store or update FCM token
app.post('/api/token', (req, res) => {
  const { id, fcm_token } = req.body;

  if (!id || !fcm_token) {
    return res.status(400).json({ error: 'ID and FCM token are required.' });
  }

  // Update existing record with the new FCM token
  connect.query(
    'INSERT INTO datalist (id, fcm_token) VALUES (?, ?) ON DUPLICATE KEY UPDATE fcm_token = VALUES(fcm_token)',
    [id, fcm_token],
    (err) => {
      if (err) {
        console.error('Error updating FCM token:', err);
        return res.status(500).json({ error: 'Failed to update FCM token' });
      }

      res.json({ msg: 'FCM token updated successfully!' });
    }
  );
});

// Send notification endpoint
app.post('/sendnotification', async (req, res) => {
  const { id, title, body } = req.body;

  if (!id || !title || !body) {
    return res.status(400).json({ error: 'ID, title, and body are required.' });
  }

  try {
    // Retrieve the FCM token from the database based on user ID
    connect.query('SELECT fcm_token FROM datalist WHERE id = ?', [id], (err, rows) => {
      if (err) {
        console.error('Error fetching FCM token:', err);
        return res.status(500).json({ error: 'Failed to fetch FCM token' });
      }
      
      console.log('Query Results:', rows); // Log query results

      if (rows.length === 0) {
        return res.status(404).json({ msg: 'User not found' });
      }

      const fcm_token = rows[0]?.fcm_token;
      if (!fcm_token) {
        return res.status(404).json({ msg: 'FCM token not found for the user.' });
      }

      const message = {
        notification: {
          title: title,
          body: body,
        },
        token: fcm_token, // Device token to notify
      };

      // Send notification
      admin.messaging().send(message)
        .then(response => {
          console.log('Notification sent successfully:', response);
          res.status(200).json({ msg: 'Notification sent successfully' });
        })
        .catch(error => {
          console.error('Error sending notification:', error);
          res.status(500).json({ error: 'Error sending notification' });
        });
    });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Error processing request' });
  }
});

// Serve static files (if needed)
app.use(express.static(path.join(__dirname, 'public')));

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
