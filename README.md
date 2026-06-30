# Productive Overbooking Manager

A local web app for managing overbookings in Productive.io — detects when BambooHR time-off syncs stack on top of existing project bookings and lets you resolve them in one click.

---

## Requirements

- [Node.js](https://nodejs.org) (download and install the **LTS** version)
- A Productive.io API token

---

## Setup

### 1. Download the project

Click the green **Code** button on this page → **Download ZIP**.

Unzip the file and move the folder to your **Documents** folder. Rename it to `PRODUCTIVE_OVERBOOKING` if it isn't already.

### 2. Open Terminal

Press `Cmd + Space`, type **Terminal**, hit Enter.

### 3. Navigate to the project folder

```
cd ~/Documents/PRODUCTIVE_OVERBOOKING
```

### 4. Install dependencies

```
npm install
```

> You only need to do this once.

### 5. Start the app

```
npm start
```

The app will open automatically at [http://localhost:3004](http://localhost:3004).

---

## First run

When you open the app, click the **gear icon** (⚙️) in the top right and enter:

- **API Token** — your Productive.io API token
- **Org ID** — your organization ID (visible in Productive.io URL)

These are saved in your browser and never sent anywhere except directly to Productive.io.

---

## Stopping the app

Go back to Terminal and press `Ctrl + C`.
