require("dotenv").config();
const { Client, RemoteAuth, MessageMedia } = require("whatsapp-web.js");
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const qrcode = require("qrcode-terminal");
const { MongoStore } = require("wwebjs-mongo");

const app = express();
app.use(bodyParser.json());

const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 8000;

console.log("Starting server...");
console.log("MongoDB URI:", MONGO_URI);
console.log("Server Port:", PORT);

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is missing in .env file.");
  process.exit(1);
}

// Connect to MongoDB
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

const initializeClient = async () => {
  console.log("Initializing WhatsApp client...");
  const store = new MongoStore({ mongoose: mongoose });

  // Create WhatsApp client
  const client = new Client({
    authStrategy: new RemoteAuth({
      store: store,
      backupSyncIntervalMs: 900000, // 5 minutes
    }),
  });

  // Initialize the client
  client.initialize();

  // QR Code generation
  client.on("qr", (qr) => {
    console.log("Scan the QR Code to login:");
    qrcode.generate(qr, { small: true });
  });

  // Client is ready
  client.on("ready", async () => {
    console.log("✅ WhatsApp Client is ready!");
  });

  // Handle remote session saving
  client.on("remote_session_saved", () => {
    console.log("✅ Session saved successfully!");
  });

  // Handle client disconnection
  client.on("disconnected", async (reason) => {
    console.error("❌ Client disconnected:", reason);
    console.log("🔄 Session removed. Restarting client...");
    initializeClient(); // Restart client
  });

  // Handle incoming messages
  client.on("message_create", (message) => {
    if (message.body.toLowerCase() === "hi") {
      message
        .getChat()
        .then((chat) =>
          chat.sendMessage("🤖 This is only for testing purposes")
        );
    }
  });

  // API Route: Send WhatsApp Message
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
      console.log(`📩 Sending message to: ${formattedNumber}`);

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

      console.log("✅ Message sent successfully!");
      res.status(200).send("✅ Message sent successfully!");
    } catch (err) {
      console.error("❌ Error sending message:", err);
      res.status(500).send("❌ Error sending message: " + err.message);
    }
  });

  // Start Express server
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

// Start the client
