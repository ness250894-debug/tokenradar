require("dotenv").config({ path: ".env.local" });
const clientId = process.env.X_OAUTH2_CLIENT_ID;
const clientSecret = process.env.X_OAUTH2_CLIENT_SECRET;
const b64 = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
const body = "grant_type=client_credentials";

fetch("https://api.x.com/2/oauth2/token", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Authorization": "Basic " + b64
  },
  body
}).then(r => r.json()).then(data => {
  console.log("Response with Basic:", data);
});

fetch("https://api.x.com/2/oauth2/token", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded"
  },
  body: body + "&client_id=" + clientId
}).then(r => r.json()).then(data => {
  console.log("Response with Body:", data);
});
