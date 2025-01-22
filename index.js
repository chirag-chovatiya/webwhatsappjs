const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const express = require("express");
const bodyParser = require("body-parser");
const app = express().use(bodyParser.json());
const dotenv = require("dotenv");
const qrcode = require("qrcode-terminal");
dotenv.config();

const client = new Client({ authStrategy: new LocalAuth() });



client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("message_create", (message) => {
  if (message.body === "Hi") {
    return message.getChat().then(chat => chat.sendMessage("This is only testing perpose"))
  }
});

client.on("ready", () => {
  console.log("Client is ready!");
});

client.initialize();


app.post("/send-message", async (req, res) => {
  const { phoneNumber, messageBody, imageUrl, videoUrl } = req.body;

  if (!phoneNumber || (!messageBody && !imageUrl && !videoUrl)) {
    return res.status(400).send("Phone number and at least one of messageBody, imageUrl, or videoUrl are required.");
  }

  const formattedNumber = `${phoneNumber.replace('+', '')}@c.us`;
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
    console.log("Error sending message:", err);
    res.status(500).send("Error sending message: " + err.message);
  }
});



const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
