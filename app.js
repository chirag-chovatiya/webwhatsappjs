require("dotenv").config();
const cors = require("cors"); // Import the CORS package
const http = require("http");
const socketIo = require("socket.io");
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const { Client, RemoteAuth, MessageMedia } = require("whatsapp-web.js");
const { MongoStore } = require("wwebjs-mongo");
const qrcode = require("qrcode");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
app.use(express.static(path.join(__dirname, "public")));

// Enable CORS for all origins (or specific ones)
app.use(cors({ origin: "*" }));

app.use(bodyParser.json());

// MongoDB URI and port
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;

let client; // Global variable for client

// MongoDB connection
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected successfully!");
    initializeClient();
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// Initialize WhatsApp client
const initializeClient = async () => {
  if (client !== undefined) {
    const status = await client.getState();

    console.log("✅ WhatsApp client is already connected.");
    io.emit("client-ready");
    return;
  }

  const store = new MongoStore({ mongoose: mongoose });

  client = new Client({
    authStrategy: new RemoteAuth({
      store: store,
      backupSyncIntervalMs: 300000, // 5 minutes
    }),
  });

  // Initialize the client
  client.initialize();

  // Send QR code to frontend
  client.on("qr", (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
      if (err) {
        console.error("❌ QR Code generation error:", err);
        return;
      }
      io.emit("qr", url); // Emit the QR code to the frontend via Socket.IO
    });
  });
  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);
    socket.on("join", async (data) => {
      try {
        if (client !== undefined) {
          const status = await client?.getState();
          if (status === "CONNECTED") {
            io.emit("client-ready");
          }
        }
      } catch (error) {}
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
    socket.on("logout", async () => {
      client.destroy();
    });
  });

  // Client is ready
  client.on("ready", () => {
    console.log("✅ WhatsApp Client is ready!");
    io.emit("client-ready"); // Notify frontend that client is ready
  });

  // Handle remote session saving
  client.on("remote_session_saved", () => {
    console.log("✅ Session saved successfully!");
    io.emit("session-saved");
  });

  // Handle client disconnection
  client.on("disconnected", () => {
    console.log("❌ Client disconnected. Re-initializing...");
    initializeClient(); // Restart client
  });
};

app.get("/home", async (req, res) => {
  // Serve the index.html file
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Send WhatsApp message endpoint
app.post("/send-message", async (req, res) => {
  try {
    const { phoneNumber, messageBody, imageUrl } = req.body;

    if (!phoneNumber || (!messageBody && !imageUrl)) {
      return res
        .status(400)
        .send(
          "⚠️ Phone number and at least one of messageBody or imageUrl are required."
        );
    }

    const formattedNumber = `${phoneNumber.replace("+", "")}@c.us`;

    // Check if the number is registered on WhatsApp
    const isRegistered = await client.isRegisteredUser(formattedNumber);
    if (!isRegistered) {
      return res
        .status(404)
        .send("❌ The phone number is not registered on WhatsApp.");
    }

    // Get chat instance
    const chat = await client.getChatById(formattedNumber);
    if (!chat) {
      return res.status(404).send("❌ Chat not found.");
    }

    // Send messages
    if (messageBody) await chat.sendMessage(messageBody);
    if (imageUrl) {
      const media = await MessageMedia.fromUrl(imageUrl);
      await chat.sendMessage(media);
    }

    res.status(200).send("✅ Message sent successfully!");
  } catch (err) {
    res.status(500).send("❌ Error sending message: " + err.message);
  }
});

// Start Express server with Socket.IO
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
