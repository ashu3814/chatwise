const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "goodreads.db");
const app = express();

app.use(express.json());

let db = null;

// Initialize the SQLite database
async function initializeDatabase() {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });

    // Create 'user' table
    await db.run(`CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      name TEXT NOT NULL,
      password TEXT NOT NULL
    )`);

    // Create 'friendship' table
    await db.run(`CREATE TABLE IF NOT EXISTS friendship (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      friend_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES user (id),
      FOREIGN KEY (friend_id) REFERENCES user (id)
    )`);

    // Create 'post' table
    await db.run(`CREATE TABLE IF NOT EXISTS post (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES user (id)
    )`);

    console.log("Database initialized successfully");
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(-1);
  }
}

// Initialize the database and start the server
async function initializeServer() {
  try {
    // Initialize the database
    await initializeDatabase();

    // Start the server
    const port = 3000;
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (e) {
    console.log(`Server Error: ${e.message}`);
    process.exit(-1);
  }
}

// Call the function to initialize the server
initializeServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid Access Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.send("Invalid Access Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// User Registration - API endpoint
app.post("/register", async (request, response) => {
  const { username, name, password } = request.body;

  try {
    // Check if the username is already taken
    const existingUser = await db.get("SELECT * FROM user WHERE username = ?", [username]);
    if (existingUser) {
      return response.status(400).json({ error: "Username already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the user details into the 'user' table
    const result = await db.run(
      "INSERT INTO user (username, name, password) VALUES (?, ?, ?)",
      [username, name, hashedPassword]
    );

    if (result.lastID) {
      return response.status(200).json({ message: "User registered successfully" });
    } else {
      return response.status(500).json({ error: "Failed to register user" });
    }
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: "Failed to register user" });
  }
});


// Send Friend Request - API endpoint
app.post("/friend-request", authenticateToken, async (request, response) => {
  const { friendId } = request.body;
  const userId = request.user.id; // Assuming the authenticated user information is available in request.user

  try {
    // Check if the friend request already exists
    const existingRequest = await db.get(
      "SELECT * FROM friendship WHERE user_id = ? AND friend_id = ?",
      [userId, friendId]
    );

    if (existingRequest) {
      return response.status(400).json({ error: "Friend request already sent" });
    }

    // Insert the friend request details into the 'friendship' table
    const result = await db.run(
      "INSERT INTO friendship (user_id, friend_id, status) VALUES (?, ?, ?)",
      [userId, friendId, "pending"]
    );

    if (result.lastID) {
      return response.status(200).json({ message: "Friend request sent successfully" });
    } else {
      return response.status(500).json({ error: "Failed to send friend request" });
    }
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: "Failed to send friend request" });
  }
});


// Accept Friend Request - API endpoint
app.post("/accept-friend-request", authenticateToken, async (request, response) => {
  const { friendId } = request.body;
  const userId = request.user.id; // Assuming the authenticated user information is available in request.user

  try {
    // Update the friend request status in the 'friendship' table
    const result = await db.run(
      "UPDATE friendship SET status = 'accepted' WHERE user_id = ? AND friend_id = ?",
      [friendId, userId]
    );

    if (result.changes > 0) {
      return response.status(200).json({ message: "Friend request accepted successfully" });
    } else {
      return response.status(400).json({ error: "Invalid friend request" });
    }
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: "Failed to accept friend request" });
  }
});


// Create Post - API endpoint
app.post("/posts", authenticateToken, async (request, response) => {
  const { content } = request.body;
  const userId = request.user.id; // Assuming the authenticated user information is available in request.user

  try {
    // Insert the post details into the 'post' table
    const result = await db.run(
      "INSERT INTO post (user_id, content) VALUES (?, ?)",
      [userId, content]
    );

    if (result.lastID) {
      return response.status(200).json({ message: "Post created successfully" });
    } else {
      return response.status(400).json({ error: "Failed to create post" });
    }
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: "Failed to create post" });
  }
});


// Fetch User's Posts - API endpoint
app.get("/posts/user/:userId", authenticateToken, async (request, response) => {
  const { userId } = request.params;

  try {
    // Retrieve posts created by the specified user
    const query = `
      SELECT p.id, p.content
      FROM post AS p
      INNER JOIN friendship AS f ON (p.user_id = f.friend_id)
      WHERE (f.user_id = ? AND f.status = 'accepted') OR p.user_id = ?
    `;
    const posts = await db.all(query, [userId, userId]);

    return response.status(200).json({ posts });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: "Failed to fetch user posts" });
  }
});


// Other routes that require authentication

// Start the server and initialize the database
//initializeServer
