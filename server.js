const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); // JWT for token-based authentication
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB URI
const mongoURI = process.env.MONGO_URI || 'mongodb://tiktok-app-server:TaUCoAnBUP6AAVsaMGwTgBbfERfwZqZU9EHKQuORVeUwaY5KMXrc9ZpX3wmBTPTkzxnYchxSPtNSACDb0WvLUw==@tiktok-app-server.mongo.cosmos.azure.com:10255/?ssl=true&replicaSet=globaldb&retrywrites=false&maxIdleTimeMS=120000&appName=@tiktok-app-server@';
mongoose
    .connect(mongoURI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 30000,
    })
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    });

// User schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
});

userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

const User = mongoose.model('User', userSchema);

// Video schema
const videoSchema = new mongoose.Schema({
    url: { type: String, required: true },
    channel: { type: String, required: true },
    description: { type: String, required: true },
    song: { type: String, required: true },
});

const Video = mongoose.model('Video', videoSchema);

// JWT Secret
const JWT_SECRET = 'your_jwt_secret_here';

// Register route
app.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Check if the username or email already exists
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(400).json({ message: 'Username or Email already exists' });
        }

        // Create a new user instance
        const newUser = new User({ username, email, password });

        // Save the new user to the database
        await newUser.save();

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'An error occurred while registering the user. Please try again later.' });
    }
});

// Login route
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Find the user by username
        const user = await User.findOne({ username });
        
        // If no user or invalid password, return error
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate a JWT token
        const token = jwt.sign(
            { username: user.username, userId: user._id },
            JWT_SECRET,
            { expiresIn: '1h' } // Token expires in 1 hour
        );

        res.json({
            success: true,
            message: 'Login successful',
            username: user.username,
            token: token // Send the token
        });
    } catch (error) {
        console.error('Server error during login:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Profile route (GET)
app.get('/profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1]; // Extract token from Authorization header
        if (!token) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // Verify the JWT token
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // Fetch the user details from the database
        const user = await User.findOne({ _id: decoded.userId });
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Return the user profile information
        res.json({
            username: user.username,
            email: user.email,
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Videos route (no authentication required)
app.get('/videos', async (req, res) => {
    try {
        const videos = await Video.find();
        res.json(videos);
    } catch (error) {
        console.error('Error fetching videos:', error);
        res.status(500).json({ message: 'Error fetching videos' });
    }
});

// Upload video route (no authentication required)
app.post('/upload-video', async (req, res) => {
    try {
        const { videoUrl, channel, description, song } = req.body;
        const newVideo = new Video({
            url: videoUrl,
            channel,
            description,
            song
        });
        await newVideo.save();
        res.status(201).json({ success: true, video: newVideo });
    } catch (error) {
        res.status(500).json({ message: 'Upload failed' });
    }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
