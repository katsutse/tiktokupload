require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB URI
const mongoURI = process.env.MONGO_URI;
mongoose
  .connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
  })
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

// Schemas and Models
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
});
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});
const User = mongoose.model('User', userSchema);

const videoSchema = new mongoose.Schema({
  url: { type: String, required: true },
  channel: { type: String, required: true },
  description: { type: String, required: true },
  song: { type: String, required: true },
  feedback: [
    {
      comment: String,
      like: { type: Boolean, default: false },
      share: { type: Boolean, default: false },
    },
  ],
});
const Video = mongoose.model('Video', videoSchema);

// JWT Middleware
const jwtMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(400).json({ message: 'Invalid or expired token' });
  }
};

// Routes
app.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Username or Email already exists' });
    }
    const newUser = new User({ username, email, password });
    await newUser.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'An error occurred. Try again later.' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ username: user.username, userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });
    res.json({ success: true, message: 'Login successful', username: user.username, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/profile', jwtMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ username: user.username, email: user.email });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/videos', async (req, res) => {
  try {
    const videos = await Video.find();
    if (!videos || videos.length === 0) {
      return res.status(200).json({ message: 'No videos found' });
    }
    res.json(videos);
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ message: 'Error fetching videos' });
  }
});

app.post('/upload-video', async (req, res) => {
  try {
    const { videoUrl, channel, description, song } = req.body;
    const newVideo = new Video({ url: videoUrl, channel, description, song, feedback: [] });
    await newVideo.save();
    res.status(201).json({ success: true, video: newVideo });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Upload failed' });
  }
});

app.post('/videos/:videoId/comment', jwtMiddleware, async (req, res) => {
  try {
    const { videoId } = req.params;
    const { comment, like, share } = req.body;
    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ message: 'Video not found' });
    video.feedback.push({ comment, like, share });
    await video.save();
    res.status(201).json({ success: true, video });
  } catch (error) {
    console.error('Comment error:', error);
    res.status(500).json({ message: 'Error adding comment' });
  }
});

app.post('/analyze-feedback', jwtMiddleware, async (req, res) => {
  try {
    const { videoId } = req.body;
    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ message: 'Video not found' });
    const feedbackComments = video.feedback.map((fb) => fb.comment).join(' ');
    const sentimentAnalysis = { sentiment: 'positive', score: 0.85 }; // Mock response
    res.json({ videoId: video._id, sentiment: sentimentAnalysis.sentiment, score: sentimentAnalysis.score });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ message: 'Analysis failed' });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
