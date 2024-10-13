const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const mysql = require('mysql');
const moment = require('moment');
const bodyParser = require('body-parser');
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

// Login endpoint
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    connect.query('SELECT * FROM users WHERE username = ?', [username], async (err, result) => {
        if (err) {
            return res.status(500).json({ message: 'Database query error' });
        }

        if (result.length === 0) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        const user = result[0];
        const passwordMatch = await bcrypt.compare(password, user.password);
        
        if (!passwordMatch) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        // Send the full name of the user back to the frontend
        res.json({ message: 'Login successful', fullname: user.fullname });
    });
});

// Create account endpoint
app.post('/register', async (req, res) => {
    const { username, fullname, password } = req.body;

    console.log('Registration attempt for username:', username); // Log the username

    connect.query('SELECT * FROM users WHERE username = ?', [username], async (err, result) => {
        if (err) {
            console.error('Database query error:', err); // Log the error
            return res.status(500).json({ message: 'Database query error' });
        }

        if (result.length > 0) {
            console.warn('Username already exists:', username); // Log warning for existing username
            return res.status(400).json({ message: 'Username already exists' });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = { username, fullname, password: hashedPassword };

            connect.query('INSERT INTO users SET ?', newUser, (err) => {
                if (err) {
                    console.error('Error creating account:', err); // Log the error
                    return res.status(500).json({ message: 'Error creating account' });
                }
                console.log('Account created successfully for username:', username); // Log success message
                res.status(201).json({ message: 'Account created successfully' });
            });
        } catch (error) {
            console.error('Error during password hashing:', error); // Log any error that occurs while hashing password
            return res.status(500).json({ message: 'Error creating account' });
        }
    });
});


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

// Add a new driver record with image upload (to new driverlist table)
app.post('/api/list', upload.single('image'), (req, res) => {
    const { plate, driver, brgy } = req.body;

    if (!plate || !driver || !brgy || !req.file) {
        return res.status(400).json({ error: 'All fields are required, including the image.' });
    }

    // Firebase storage reference
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
            // Make the image public (optional)
            await file.makePublic();

            // Get the image URL
            const imageUrl = file.publicUrl();

            // Insert record into MySQL (driverlist table)
            connect.query(
                'INSERT INTO driverlist (Plate_number, Driver_name, Barangay, Image) VALUES (?, ?, ?, ?)',
                [plate, driver, brgy, imageUrl],
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
    connect.query('SELECT id, Plate_number, Driver_name, Barangay, Image FROM driverlist', (err, rows) => {
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

    connect.query('SELECT * FROM driverlist WHERE id = ?', [id], (err, rows) => {
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

app.get('/api/reports', (req, res) => {
    const searchTerm = req.query.search;  // Get the search query parameter

    let query = `SELECT * FROM reportlist`;  // Base query to fetch all reports

    // If a search term is provided, modify the query for exact match on Plate_number
    if (searchTerm) {
        query += ` WHERE Plate_number = ?`;  // Exact match on franchise number (Plate_number)
    }

    connect.query(query, [searchTerm], (err, results) => {
        if (err) {
            console.error('Error fetching reports:', err);
            return res.status(500).json({ error: 'Failed to fetch reports.' });
        }

        res.json(results);  // Return the fetched reports
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

        // If no recent scan, proceed with fetching driver data
        connect.query('SELECT * FROM driverlist WHERE id = ?', [qrId], (err, rows) => {
            if (err) {
                console.error('Error fetching data for QR code:', err);
                return res.status(500).json({ error: 'Failed to fetch driver data' });
            }

            if (rows.length === 0) {
                console.error('Record not found for QR code ID:', qrId);
                return res.status(404).json({ error: `No driver record found for ID: ${qrId}.` });
            }

            const driver = rows[0]; // Assuming only one record is returned

            // Data for the QR code (for example, linking to driver details page or API)
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
                    res.json({
                        qrCode: url,
                        driver: {
                            id: driver.id,
                            plate_number: driver.Plate_number,
                            driver_name: driver.Driver_name,
                            barangay: driver.Barangay,
                            image: driver.Image,
                            created_at: driver.created_at
                        }
                    });
                });
            });
        });
    });
});

app.get('/api/qr', (req, res) => {
    console.log(`[${new Date().toISOString()}] GET /api/qr - Request received`);
    console.log('Request Query Params:', req.query);

    const { plate, driver, barangay } = req.query;

    // Check for required parameters
    if (!plate || !driver || !barangay) {
        return res.status(400).json({ error: 'Missing required query parameters: plate, driver, barangay' });
    }

    const query = `SELECT * FROM driverlist WHERE Plate_number = ? AND Driver_name = ? AND Barangay = ?`;
    connect.query(query, [plate, driver, barangay], (err, rows) => {
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

    // Validation checks
    if (!id || !title || !body || !serverTime || !serverDate) {
        console.error('Validation Error: Missing required fields');
        return res.status(400).json({ error: 'ID, title, body, serverTime, and serverDate are required.' });
    }

    // Fetch the FCM token from the database
    connect.query('SELECT fcm_token FROM datalist WHERE id = ?', [id], (err, rows) => {
        if (err) {
            console.error('Database Error: Failed to fetch FCM token:', err);
            return res.status(500).json({ error: 'Failed to fetch FCM token' });
        }

        if (rows.length === 0) {
            console.error('User not found for ID:', id);
            return res.status(404).json({ error: 'User not found' });
        }

        const fcm_token = rows[0]?.fcm_token;
        if (!fcm_token) {
            console.error('FCM token not found for the user with ID:', id);
            return res.status(404).json({ error: 'FCM token not found for the user.' });
        }

        // Prepare the message to be sent
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

        // Send the notification via FCM
        admin.messaging().send(message)
            .then((response) => {
                console.log('Notification sent successfully to user with ID:', id);
                res.status(200).json({ success: true, msg: 'Notification sent successfully' });
            })
            .catch((error) => {
                console.error('Error sending notification for user with ID:', id, error);
                res.status(500).json({ error: 'Error sending notification' });
            });
    });
});


app.post('/api/report/:id', async (req, res) => {
    console.log('Request received for ID:', req.params.id);
    const driverId = req.params.id;

    // Destructure the request body
    const { report, plate, driver, brgy, fcm_token, ratings } = req.body;

    // Validate required fields
    if (!report || report.trim() === '') {
        console.error('Validation Error: Violation report is empty.');
        return res.status(400).json({ error: 'Violation report cannot be empty.' });
    }

    if (!plate || !driver || !brgy || !fcm_token || !ratings) {
        console.error('Validation Error: Missing required fields.');
        return res.status(400).json({ error: 'Plate number, driver name, barangay, FCM token, and ratings are required.' });
    }

    // Log the received data
    console.log('Received data:', req.body);

    // Set the current datetime for the report
    const reportDateTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // MySQL DATETIME format
    console.log('Report DateTime:', reportDateTime);

    // Prepare the SQL query
    const insertQuery = `
        INSERT INTO reportlist (Plate_number, Driver_name, Violations, fcm_token, ratings, report_datetime)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    const insertValues = [plate, driver, report.trim(), fcm_token, ratings, reportDateTime];

    // Insert a new report entry in the `reportlist` table
    console.log('Executing insert query with values:', insertValues);
    connect.query(insertQuery, insertValues, (err, result) => {
        if (err) {
            console.error('Error inserting report:', err);
            return res.status(500).json({ error: 'Failed to submit report.' });
        }

        console.log(`Report submitted successfully for driver ID ${driverId}, report ID: ${result.insertId}`);

        // Respond with success
        res.json({
            msg: 'Report submitted successfully!',
            reportId: result.insertId, // The new report's ID
            plate,
            driver,
            brgy,
            violations: report.trim(),
            ratings,
            report_datetime: reportDateTime
        });

        // Auto Notification Logic after report submission
        const notificationPayload = {
            id: driverId, // This is the user/driver to whom the notification is being sent
            title: "Report Notice:",
            body: `Report Submitted To Municipal Office Plate Number: ${plate}`,
            serverTime: new Date().toLocaleTimeString(),
            serverDate: new Date().toLocaleDateString()
        };

        // Call the /sendnotification endpoint using your backend URL
        console.log('Sending notification with payload:', notificationPayload);
        fetch('https://triqride.onrender.com/sendnotification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(notificationPayload)
        })
        .then(response => {
            console.log('Notification Response Status:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('Notification Sent', data);
        })
        .catch(err => {
            console.error('Error sending notification', err);
        });
    });
});

// Helper function to send notification
function sendNotification(driverId, plate, report) {
    const notificationPayload = {
        id: driverId,
        title: "New Violation Report",
        body: `A new report has been submitted for vehicle: ${plate} with violation: ${report}`,
        serverTime: new Intl.DateTimeFormat('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
            timeZone: 'Asia/Manila' // Replace this with your desired time zone
        }).format(new Date()),
        serverDate: new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: 'Asia/Manila' // Replace this with your desired time zone
        }).format(new Date())
    };

    // Call the /sendnotification endpoint to send notification
    fetch('https://triqride.onrender.com/sendnotification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationPayload)
    })
    .then(response => response.json())
    .then(data => console.log('Notification Sent', data))
    .catch(err => console.error('Error sending notification', err));
}





// Start the server 
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
