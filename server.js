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

    // First, fetch driver details from driverlist
    const driverQuery = 'SELECT * FROM driverlist WHERE id = ?';
    
    connect.query(driverQuery, [id], (err, driverRows) => {
        if (err) {
            console.error('Error fetching driver data:', err);
            return res.status(500).json({ error: 'Failed to fetch driver data' });
        }

        if (driverRows.length > 0) {
            const driver = driverRows[0]; // Get the driver record

            // Now, fetch violations and ratings from reportlist based on Plate_number
            const reportQuery = `
                SELECT 
                    COUNT(Violations) AS totalViolations, 
                    AVG(ratings) AS overallRating 
                FROM reportlist 
                WHERE Plate_number = ?
            `;

            connect.query(reportQuery, [driver.Plate_number], (err, reportRows) => {
                if (err) {
                    console.error('Error fetching report data:', err);
                    return res.status(500).json({ error: 'Failed to fetch report data' });
                }

                // Format overallRating to two decimal places
                const overallRating = reportRows[0].overallRating ? parseFloat(reportRows[0].overallRating).toFixed(2) : '0.00';

                // Combine driver data with report stats
                const responseData = {
                    ...driver,
                    totalViolations: reportRows[0].totalViolations || 0, // Count of violations
                    overallRating: overallRating                        // Formatted rating
                };

                console.log('Fetched driver and report data successfully:', responseData);
                res.json(responseData);
            });

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

app.get('/api/drivers', (req, res) => {
    const searchTerm = req.query.search; // Get the search query parameter

    // Base query to fetch all drivers
    let query = `SELECT * FROM driverlist`;

    // If a search term is provided, modify the query to search for matching Plate_number
    if (searchTerm) {
        query += ` WHERE Plate_number LIKE ?`; // Modify query to include the search condition
    }

    // Execute the query
    connect.query(query, searchTerm ? [`%${searchTerm}%`] : [], (err, results) => {
        if (err) {
            console.error('Error fetching drivers:', err);
            return res.status(500).json({ error: 'Failed to fetch drivers.' });
        }

        res.json(results);  // Return the fetched drivers
    });
});

// Fetch driver details along with their report data
app.get('/api/driver/:plateNumber', (req, res) => {
    const plateNumber = req.params.plateNumber;

    const query = `
        SELECT dl.*, 
        COALESCE(AVG(rl.ratings), 0) AS averageRating,  -- Calculate average rating
        GROUP_CONCAT(CONCAT(rl.Violations, ' - ', DATE_FORMAT(rl.report_datetime, '%Y-%m-%d %H:%i:%s')) SEPARATOR ', ') AS ViolationHistory,  -- Concatenate violations with date and time
        COUNT(rl.Violations) AS totalViolations  -- Count the total number of violations
        FROM driverlist dl
        LEFT JOIN reportlist rl ON dl.Plate_number = rl.Plate_number
        WHERE dl.Plate_number = ?
        GROUP BY dl.Plate_number;
    `;

    connect.query(query, [plateNumber], (err, results) => {
        if (err) {
            console.error('Error fetching driver report details:', err);
            return res.status(500).json({ error: 'Failed to fetch report details.' });
        }

        // Send the first result (driver data) back as a response, assuming one driver per plate number
        if (results.length > 0) {
            res.json({
                success: true,
                data: results[0] // Send the first result (driver data) back
            });
        } else {
            res.status(404).json({ error: 'Driver not found' });
        }
    });
});


app.get('/api/reports', (req, res) => {
    const searchTerm = req.query.search;  // Get the search query parameter
    const selectedMonth = req.query.month; // Get the selected month query parameter

    let query = 'SELECT * FROM reportlist';  // SQL query starts here
    const queryParams = [];  // This will hold the parameters for the prepared statement

    // Check if a search term or month is provided
    if (searchTerm || selectedMonth) {
        query += ' WHERE';  // Start the WHERE clause
        const conditions = [];

        // If a search term is provided, add a condition for it
        if (searchTerm) {
            conditions.push(' Plate_number LIKE ? ');
            queryParams.push(`%${searchTerm}%`);  // Add the search term to the query parameters with wildcards for partial matching
        }

        // If a month is provided, add a condition for it
        if (selectedMonth) {
            const monthInt = parseInt(selectedMonth, 10);  // Convert selectedMonth to an integer
            conditions.push(' MONTH(report_datetime) = ? ');
            queryParams.push(monthInt);  // Add the month to the query parameters
        }

        // Combine conditions with AND
        query += conditions.join(' AND ');
    }

    // Execute the query
    connect.query(query, queryParams, (err, results) => {
        if (err) {
            console.error('Error fetching reports:', err);
            return res.status(500).json({ error: 'Failed to fetch reports.' });
        }

        res.json(results);  // Return the fetched reports as JSON
    });
});

app.get('/api/seminar', (req, res) => {
    const searchTerm = req.query.search; // Get the search query parameter

    // Base query to fetch drivers with 3 or more violations
    let query = `
        SELECT 
            Driver_name AS owner, 
            Plate_number AS franchise, 
            COUNT(Violations) AS total_violations
        FROM reportlist
        GROUP BY Driver_name, Plate_number
        HAVING COUNT(Violations) >= 3
    `;

    // If a search term is provided, modify the query to search for matching Plate_number or Driver_name
    if (searchTerm) {
        query += ` AND (Plate_number LIKE ? OR Driver_name LIKE ?)`; // Search both plate number and driver name
    }

    // Execute the query, using placeholders for the search term if provided
    connect.query(query, searchTerm ? [`%${searchTerm}%`, `%${searchTerm}%`] : [], (err, results) => {
        if (err) {
            console.error('Error fetching seminar data:', err);
            return res.status(500).json({ error: 'Failed to fetch seminar data.' });
        }

        res.json(results);  // Return the fetched seminar data (filtered if search is applied)
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


app.post('/api/report/:id', async (req, res) => {
    const { plate, driver, report, fcm_token, ratings } = req.body;

    // Validate the input
    if (!plate || !driver || !report || !fcm_token || !ratings) {
        return res.status(400).json({ error: 'Plate, driver name, report, FCM token, and ratings are required.' });
    }

    // Check if driver exists in `driverlist`
    connect.query('SELECT id FROM driverlist WHERE Plate_number = ? AND Driver_name = ?', [plate, driver], (err, rows) => {
        if (err) {
            console.error('Error fetching driver data:', err);
            return res.status(500).json({ error: 'Failed to fetch driver data.' });
        }

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Driver not found for the provided Plate and Driver.' });
        }

        const driverId = rows[0].id; // Fetch driver ID

        // Set the current datetime for the report
        const reportDateTime = new Date().toISOString().slice(0, 19).replace('T', ' ');

        // Insert a new report entry in the `reportlist` table
        const insertQuery = `
            INSERT INTO reportlist (Plate_number, Driver_name, Violations, fcm_token, ratings, report_datetime)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const insertValues = [plate, driver, report.trim(), fcm_token, ratings, reportDateTime];

        connect.query(insertQuery, insertValues, (err, result) => {
            if (err) {
                console.error('Error inserting report:', err);
                return res.status(500).json({ error: 'Failed to submit report.' });
            }

            // Report submitted successfully
            res.json({
                msg: 'Report submitted successfully!',
                reportId: result.insertId,
                plate,
                driver,
                violations: report.trim(),
                ratings,
                report_datetime: reportDateTime
            });

            // Prepare notification payload
            const notificationPayload = {
                id: driverId,  // Use driverId for tracking
                title: "Report Notice",
                body: `Report Submitted To Municipal Office Franchise Number: ${plate}`,
                serverTime: new Date().toLocaleTimeString(),
                serverDate: new Date().toLocaleDateString(),
                fcm_token: fcm_token  // Use the fcm_token from the report
            };

            // Send the notification after report submission
            fetch('https://triqride.onrender.com/sendnotification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(notificationPayload)
            })
            .then(response => {
                if (!response.ok) {
                    // Log the status code and response if it's not OK
                    return response.text().then(text => {
                        console.error('Error response:', text);
                        throw new Error(`Failed to send notification. Status: ${response.status}`);
                    });
                }
                return response.json();  // Attempt to parse JSON if the response is OK
            })
            .then(data => {
                console.log('Notification Sent', data);
            })
            .catch(err => console.error('Error sending notification', err));
        });
    });
});

// New route: Send notification to a user
app.post('/sendnotification', (req, res) => {
    const { id, title, body, serverTime, serverDate } = req.body;
    console.log('POST /sendnotification - Request received', { id, title, body, serverTime, serverDate });

    // Validation checks
    if (!id || !title || !body || !serverTime || !serverDate) {
        console.error('Validation Error: Missing required fields');
        return res.status(400).json({ error: 'ID, title, body, serverTime, and serverDate are required.' });
    }

    // Fetch the FCM token from the reportlist based on the driver ID
    connect.query('SELECT fcm_token FROM reportlist WHERE Plate_number = (SELECT Plate_number FROM driverlist WHERE id = ?)', [id], (err, rows) => {
        if (err) {
            console.error('Database Error: Failed to fetch FCM token:', err);
            return res.status(500).json({ error: 'Failed to fetch FCM token' });
        }

        if (rows.length === 0) {
            console.error('No report found for driver ID:', id);
            return res.status(404).json({ error: 'No report found for the provided driver ID' });
        }

        const fcm_token = rows[0]?.fcm_token;
        if (!fcm_token) {
            console.error('FCM token not found for the driver ID:', id);
            return res.status(404).json({ error: 'FCM token not found for the provided driver ID' });
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
                console.log('Notification sent successfully to driver ID:', id);
                res.status(200).json({ success: true, msg: 'Notification sent successfully' });
            })
            .catch((error) => {
                console.error('Error sending notification for driver ID:', id, error);
                res.status(500).json({ error: 'Error sending notification' });
            });
    });
});

app.post('/api/notify-attendance', (req, res) => {
    const { driverId, attended } = req.body;
    
    // Fetch all relevant fcm_tokens from the reportlist
    const sqlQuery = 'SELECT fcm_token FROM reportlist WHERE Plate_number = (SELECT Plate_number FROM driverlist WHERE id = ?)';
    db.query(sqlQuery, [driverId], (error, results) => {
        if (error) return res.status(500).send('Error fetching FCM tokens');

        if (results.length > 0) {
            // Extract all fcm_tokens into an array
            const fcmTokens = results.map(result => result.fcm_token);
            const message = attended 
                ? 'The driver attended the seminar.' 
                : 'The driver did not attend the seminar.';

            // Create the payload for the notification
            const payload = {
                notification: {
                    title: 'Seminar Attendance Update',
                    body: message,
                },
                tokens: fcmTokens // Send to multiple tokens
            };

            // Send notification to multiple devices
            admin.messaging().sendMulticast(payload)
                .then(response => {
                    console.log('Notifications sent successfully:', response);
                    res.json({ success: true, message: 'Notifications sent successfully' });
                })
                .catch(error => {
                    console.error('Error sending notifications:', error);
                    res.status(500).send('Error sending notifications');
                });
        } else {
            res.status(404).send('No FCM tokens found for the driver');
        }
    });
});


// Start the server 
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
