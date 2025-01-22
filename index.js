const { Client, RemoteAuth } = require("whatsapp-web.js");
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const qrcode = require("qrcode-terminal");
const { MongoStore } = require("wwebjs-mongo");
const app = express().use(bodyParser.json());

dotenv.config();

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected!");
    const store = new MongoStore({ mongoose: mongoose });

    const client = new Client({
      authStrategy: new RemoteAuth({
        store: store,
        backupSyncIntervalMs: 300000,
      })
    });

    client.initialize();

    client.on("qr", (qr) => {
      qrcode.generate(qr, { moduleSize: 1, margin: 1, small:true});
    });

    client.on("message_create", (message) => {
      if (message.body === "Hi") {
        message.getChat().then((chat) => chat.sendMessage("This is only for testing purposes"));
      }
    });

    client.on("ready", () => {
      console.log("Client is ready!");
    });

    client.on("remote_session_saved", () => {
      console.log("Session saved successfully!");
    });

    client.on("disconnected", (reason) => {
      console.error("Client disconnected:", reason);
    });



    app.post("/send-message", async (req, res) => {
      const { phoneNumber, messageBody, imageUrl, videoUrl } = req.body;

      if (!phoneNumber || (!messageBody && !imageUrl && !videoUrl)) {
        return res.status(400).send("Phone number and at least one of messageBody, imageUrl, or videoUrl are required.");
      }

      const formattedNumber = `${phoneNumber.replace("+", "")}@c.us`;
      console.log(`Formatted number: ${formattedNumber}`);

      try {
        const isRegistered = await client.isRegisteredUser(formattedNumber);
        if (!isRegistered) {
          return res.status(404).send("The phone number is not registered on WhatsApp.");
        }

        let chat = await client.getChatById(formattedNumber).catch(() => null);
        if (!chat) {
          chat = await client.getChatById(formattedNumber);
        }

        if (messageBody) {
          await chat.sendMessage(messageBody);
        }
        if (imageUrl) {
          await chat.sendMessage(imageUrl);
        }
        if (videoUrl) {
          await chat.sendMessage(videoUrl);
        }

        res.status(200).send("Message sent successfully!");
      } catch (err) {
        console.error("Error sending message:", err);
        res.status(500).send("Error sending message: " + err.message);
      }
    });

    // Start the Express server on the specified port
    const PORT = process.env.PORT || 8000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });
