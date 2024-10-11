const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql');
const moment = require('moment');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode'); 
const multer = require('multer'); 
const fs = require('fs');

const app = express();
const PORT = 4500;



// Firebase Admin SDK setup
const serviceAccountPath = path.resolve(__dirname, 'signup-1e8a0-firebase-adminsdk-zr2df-da405d54aa.json');

try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: 'gs://signup-1e8a0.appspot.com', 
    });
    console.log('Firebase admin initialized successfully.');
} catch (error) {
    console.error('Failed to load Firebase service account key:', error);
    process.exit(1);
}

const bucket = admin.storage().bucket();

const dbConfig = {
    host: 'bw3rasmbkvtizwwwumea-mysql.services.clever-cloud.com',
    user: 'uhncdvszdzjkayy8',
    password: 'SUBAKVgaTAKFQf6qBlSe',
    database: 'bw3rasmbkvtizwwwumea',
};

const connect = mysql.createConnection(dbConfig);

connect.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        process.exit(1);
    }
    console.log('Connected to MySQL database.');
});

// Middleware setup
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Request received`);
    next();
});;


// Validate image types (JPEG, PNG, GIF) and limit file size to 5MB
const upload = multer({
    storage: multer.memoryStorage(), // Store in memory, providing a buffer
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const isValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        if (isValid) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, and GIF are allowed.'));
        }
    }
});

// API Endpoints

// Add a new record with image upload
app.post('/api/list', upload.single('image'), (req, res) => {
    const { plate, driver, brgy, actions } = req.body;

    if (!plate || !driver || !brgy || !actions || !req.file) {
        return res.status(400).json({ error: 'All fields are required, including the image.' });
    }

    // Firebase storage reference
    const bucket = admin.storage().bucket();
    const fileName = Date.now() + path.extname(req.file.originalname);
    const file = bucket.file(`images/${fileName}`);

    // Create a write stream to Firebase Storage
    const stream = file.createWriteStream({
        metadata: {
            contentType: req.file.mimetype,
        },
    });

    // Handle the stream events
    stream.on('error', (err) => {
        console.error('Error uploading to Firebase Storage:', err);
        return res.status(500).json({ error: 'Failed to upload image' });
    });

    stream.on('finish', async () => {
        try {
            // Make the image public (optional, depends on your use case)
            await file.makePublic();

            // Get the image URL
            const imageUrl = file.publicUrl();

            // Insert record into MySQL
            connect.query(
                'INSERT INTO datalist (Plate_number, Driver_name, Barangay, Violations, image) VALUES (?, ?, ?, ?, ?)',
                [plate, driver, brgy, actions, imageUrl],
                (err) => {
                    if (err) {
                        console.error('Error inserting data into MySQL:', err);
                        return res.status(500).json({ error: 'Failed to insert data' });
                    }

                    res.json({ msg: 'Successfully posted with image!', imagePath: imageUrl });
                }
            );
        } catch (err) {
            console.error('Error making image public:', err);
            res.status(500).json({ error: 'Error saving image' });
        }
    });

    // Pipe the file stream to Firebase
    stream.end(req.file.buffer);
});

// Get all records with images
app.get('/api/list', (req, res) => {
    console.log('GET /api/list - Request received');
    connect.query('SELECT id, Plate_number, Driver_name, Barangay, Violations, image FROM datalist', (err, rows) => {
        if (err) {
            console.error('Error fetching data:', err);
            return res.status(500).json({ error: 'Failed to fetch data' });
        }
        console.log('Fetched data successfully:', rows);
        res.json(rows); // This will now include image paths
    });
});

// Get a record by ID
app.get('/api/list/:id', (req, res) => {
    const id = req.params.id;
    console.log(`GET /api/list/${id} - Request received`);

    connect.query('SELECT * FROM datalist WHERE id = ?', [id], (err, rows) => {
        if (err) {
            console.error('Error fetching data:', err);
            return res.status(500).json({ error: 'Failed to fetch data' });
        }
        if (rows.length > 0) {
            console.log('Fetched record successfully:', rows[0]);
            res.json(rows[0]);
        } else {
            console.error(`Record with ID ${id} not found`);
            res.status(404).json({ msg: `Record with ID ${id} not found!` });
        }
    });
});

// Get an image by record ID (if needed, you can remove this if you use the path stored in the database)
app.get('/api/list/:id/image', (req, res) => {
    const id = req.params.id;
    console.log(`GET /api/list/${id}/image - Request received`);

    connect.query('SELECT image FROM datalist WHERE id = ?', [id], (err, rows) => {
        if (err) {
            console.error('Error fetching image:', err);
            return res.status(500).json({ error: 'Failed to fetch image' });
        }

        if (rows.length === 0 || !rows[0].image) {
            console.error('Image not found for ID:', id);
            return res.status(404).json({ error: 'Image not found' });
        }

        res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Content-Length': rows[0].image.length,
        });
        console.log('Sending image for ID:', id);
        res.end(rows[0].image); // Send the binary image data
    });
});

// Delete a record by ID
app.delete('/api/list', (req, res) => {
    const { id } = req.body;
    console.log('DELETE /api/list - Request received', { id });

    connect.query('DELETE FROM datalist WHERE id = ?', [id], (err) => {
        if (err) {
            console.error('Error deleting data:', err);
            return res.status(500).json({ error: 'Failed to delete data' });
        }

        console.log('Data deleted successfully for ID:', id);
        res.json({ msg: 'Successfully deleted!' });
    });
});


// New endpoint to generate QR code for a record by ID
app.get('/api/qr/:id', (req, res) => {
    const qrId = req.params.id;
    const userIp = req.ip; // Or use a more unique identifier for the user if available (e.g., user ID)

    console.log(`[${new Date().toISOString()}] GET /api/qr/${qrId} - Request received from IP: ${userIp}`);

    // Check if the user has scanned the QR code recently (within 24 hours)
    const checkScanQuery = `SELECT * FROM qr_scan_history WHERE qr_id = ? AND user_ip = ? AND scanned_at >= NOW() - INTERVAL 24 HOUR`;

    connect.query(checkScanQuery, [qrId, userIp], (err, scanRows) => {
        if (err) {
            console.error('Error checking scan history:', err);
            return res.status(500).json({ error: 'Error checking scan history' });
        }

        // If a scan was found within the last 24 hours, deny access
        if (scanRows.length > 0) {
            console.log('QR code already scanned by this user in the last 24 hours.');
            return res.status(403).json({ error: 'You have already scanned this QR code recently. Please try again later.' });
        }

        // If no recent scan, proceed with QR code generation
        connect.query('SELECT * FROM datalist WHERE id = ?', [qrId], (err, rows) => {
            if (err) {
                console.error('Error fetching data for QR code:', err);
                return res.status(500).json({ error: 'Failed to fetch data' });
            }

            if (rows.length === 0) {
                console.error('Record not found for QR code ID:', qrId);
                return res.status(404).json({ error: `No record found for ID: ${qrId}.` });
            }

            const qrData = `https://triqride.onrender.com/api/qr?id=${qrId}`;
            QRCode.toDataURL(qrData, (err, url) => {
                if (err) {
                    console.error('Error generating QR code:', err);
                    return res.status(500).json({ error: 'Failed to generate QR code' });
                }

                // Save the scan to the history
                const insertScanQuery = `INSERT INTO qr_scan_history (qr_id, user_ip, scanned_at) VALUES (?, ?, NOW())`;
                connect.query(insertScanQuery, [qrId, userIp], (insertErr) => {
                    if (insertErr) {
                        console.error('Error inserting scan history:', insertErr);
                        return res.status(500).json({ error: 'Failed to record QR code scan' });
                    }

                    console.log('QR code generated and scan recorded successfully');
                    res.json({ qrCode: url });
                });
            });
        });
    });
});

app.get('/api/qr', (req, res) => {
    console.log(`[${new Date().toISOString()}] GET /api/qr - Request received`);
    console.log('Request Query Params:', req.query);

    const { plate, driver, barangay, violations } = req.query;

    const query = `SELECT * FROM datalist WHERE Plate_number = ? AND Driver_name = ? AND Barangay = ? AND Violations = ?`;
    connect.query(query, [plate, driver, barangay, violations], (err, rows) => {
        if (err) {
            console.error(`[${new Date().toISOString()}] Error executing query:`, err);
            return res.status(500).json({ error: 'Database query error' });
        }

        if (rows.length === 0) {
            console.log(`[${new Date().toISOString()}] No record found for query:`, req.query);
            return res.status(404).json({ error: 'No record found' });
        }

        console.log(`[${new Date().toISOString()}] Record found for query:`, rows[0]);
        res.json({ success: true, data: rows[0] });
    });
});


// Store or update FCM token
app.post('/api/token', (req, res) => {
    const { id, fcm_token } = req.body;
    console.log('POST /api/token - Request received', { id, fcm_token });

    if (!id || !fcm_token) {
        console.error('Validation Error: Missing ID or FCM token');
        return res.status(400).json({ error: 'ID and FCM token are required.' });
    }

    connect.query('INSERT INTO datalist (id, fcm_token) VALUES (?, ?) ON DUPLICATE KEY UPDATE fcm_token = VALUES(fcm_token)', 
    [id, fcm_token], (err) => {
        if (err) {
            console.error('Error updating FCM token in the database:', err);
            return res.status(500).json({ error: 'Failed to update FCM token' });
        }

        console.log('FCM token updated successfully for ID:', id);
        res.json({ msg: 'FCM token updated successfully!' });
    });
});

// Send notification endpoint
app.post('/sendnotification', (req, res) => {
    const { id, title, body, serverTime, serverDate } = req.body;
    console.log('POST /sendnotification - Request received', { id, title, body, serverTime, serverDate });

    if (!id || !title || !body || !serverTime || !serverDate) {
        console.error('Validation Error: Missing required fields');
        return res.status(400).json({ error: 'ID, title, body, serverTime, and serverDate are required.' });
    }

    connect.query('SELECT fcm_token FROM datalist WHERE id = ?', [id], (err, rows) => {
        if (err) {
            console.error('Error fetching FCM token:', err);
            return res.status(500).json({ error: 'Failed to fetch FCM token' });
        }

        if (rows.length === 0) {
            console.error('User not found for ID:', id);
            return res.status(404).json({ msg: 'User not found' });
        }

        const fcm_token = rows[0]?.fcm_token;
        if (!fcm_token) {
            console.error('FCM token not found for the user with ID:', id);
            return res.status(404).json({ msg: 'FCM token not found for the user.' });
        }

        const message = {
            notification: {
                title: title,
                body: body,
            },
            token: fcm_token,
            data: {
                serverTime: serverTime,
                serverDate: serverDate,
            },
        };

        console.log('Sending notification:', message);
        admin.messaging().send(message)
            .then((response) => {
                console.log('Notification sent successfully');
                res.status(200).json({ msg: 'Notification sent successfully' });
            })
            .catch((error) => {
                console.error('Error sending notification:', error);
                res.status(500).json({ error: 'Error sending notification' });
            });
    });
});

app.post('/api/report/:id', async (req, res) => {
    const driverId = req.params.id;
    const { report, plate, driver, brgy, fcm_token } = req.body;

    // Validate required fields
    if (!report || report.trim() === '') {
        return res.status(400).json({ error: 'Violation report cannot be empty.' });
    }

    if (!plate || !driver || !brgy) {
        return res.status(400).json({ error: 'Plate number, driver name, and barangay are required.' });
    }

    // Insert a new record for every report submission
    connect.query(
        'INSERT INTO datalist (id, Plate_Number, Driver_name, Barangay, Violations, fcm_token) VALUES (?, ?, ?, ?, ?, ?)',
        [driverId, plate, driver, brgy, report, fcm_token],
        (insertErr) => {
            if (insertErr) {
                console.error('Error inserting new report:', insertErr);
                return res.status(500).json({ error: 'Failed to submit the report.' });
            }

            console.log(`New violation report added for driver ID ${driverId}.`);
            res.json({
                msg: 'Report submitted successfully!',
                driverId,
                plate,
                driver,
                brgy,
                violations: report // Returning the single report in the response
            });
        }
    );
});




// Start the server 
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
