# Messenger

A messenger engineering playground built to understand how modern messaging systems work.

Rather than stopping at a simple WebSocket chat application, this project explores how production-grade messengers achieve reliable message delivery, connection recovery, distributed communication, and operational visibility.

The long-term goal is to build a messenger from first principles while learning the backend and infrastructure concepts behind platforms such as Slack, Discord, KakaoTalk, and Microsoft Teams.

---

# Why this project

Many messenger tutorials stop after implementing real-time messaging.

In reality, production messaging systems must answer much harder questions:

* What happens if a user disconnects while receiving a message?
* How do users connected to different backend servers communicate?
* How are online users synchronized across multiple servers?
* How are missed messages recovered after reconnecting?
* How can a server know whether a message was actually delivered?
* How can duplicate deliveries be prevented?

This project focuses on answering those questions by incrementally adding reliability and distributed system concepts rather than only building user-facing features.

---

# Architecture

```text
             Browser (Alice)
                    │
              WebSocket
                    │
          FastAPI Backend 1
                    │
             Redis Pub/Sub
                    │
          FastAPI Backend 2
                    │
              WebSocket
                    │
              Browser (Bob)

        SQLite (Message History)
```

---

# Tech Stack

### Frontend

* React
* Vite

### Backend

* FastAPI

### Realtime

* WebSocket

### Distributed Messaging

* Redis Pub/Sub

### Persistence

* SQLite

### Development

* Docker Compose

---

# Current Capabilities

## Core Messaging

* Real-time WebSocket messaging
* Chat rooms
* SQLite message persistence
* Reply
* Edit
* Delete

## User Experience

* Message grouping
* Typing indicator
* Presence
* Delivery receipts
* Read receipts
* Auto-scroll
* Chat bubble UI

## Distributed Communication

* Multiple backend instances
* Redis Pub/Sub synchronization
* Shared presence across servers

## Connection Reliability

* Heartbeat (Ping / Pong)
* Automatic reconnect
* Session rejoin
* Missed message replay

## Delivery Reliability

* Receiver-based ACK protocol
* Pending ACK tracking
* ACK timeout detection
* Retry on missing ACK
* Duplicate message prevention

---

# How Messages Flow

When a user sends a message:

```text
Browser
    │
    ▼
FastAPI
    │
    ├── Save to SQLite
    │
    └── Publish via Redis
            │
            ▼
Other FastAPI instances
            │
            ▼
Connected browsers
```

Persistent storage and real-time delivery are intentionally handled separately to reflect how production messaging systems are designed.

---

# Distributed Architecture

The project runs multiple backend instances simultaneously.

```text
backend1 :8001

backend2 :8002
```

Users connected to different backend servers can communicate because Redis Pub/Sub distributes chat events between backend instances.

---

# Rooms

Messages are isolated by room.

Example:

```text
http://localhost:5174/?port=8001&user=Alice&room=general

http://localhost:5174/?port=8002&user=Bob&room=general

http://localhost:5174/?port=8001&user=Charlie&room=study
```

Only users inside the same room receive each other's messages.

---

# Presence

Online users are synchronized through Redis.

Example:

```text
presence:general

Alice
Bob
Charlie
```

This allows every backend instance to maintain the same view of connected users.

---

# Message Lifecycle

Current lifecycle:

```text
Sent
    ↓
Delivered
    ↓
Read
```

Each message has a unique identifier so later updates can target the correct message.

---

# Connection Reliability

Messenger v2 focuses on handling unstable network conditions.

Currently implemented:

* Heartbeat (Ping / Pong)
* Automatic reconnect
* Session rejoin
* Missed message replay

These features allow clients to recover from temporary disconnections without manually refreshing the application.

---

# Reliability Roadmap

The next step is moving from connection recovery to reliable message delivery.

```text
Heartbeat
        │
        ▼
Automatic Reconnect
        │
        ▼
Missed Message Replay
        │
        ▼
Receiver ACK Tracking ✅
        │
        ▼
Pending ACK per Message ✅
        │
        ▼
ACK Timeout ✅
        │
        ▼
Retry ✅
        │
        ▼
Duplicate Prevention ✅
        │
        ▼
Multi-backend Targeted Retry
        │
        ▼
At-least-once Delivery
        │
        ▼
Redis Streams
```

Rather than adding new chat features, the focus shifts toward making message delivery reliable under failures.

---

# Learning Roadmap

## Phase 1 — Real-time Messenger

Completed

* WebSocket
* Rooms
* SQLite persistence
* Redis Pub/Sub
* Presence
* Typing indicator
* Reply
* Edit
* Delete
* Delivery receipts
* Read receipts
* Message grouping

---

## Phase 2 — Connection Reliability

Completed

* Heartbeat
* Automatic reconnect
* Session rejoin
* Missed message replay

---

## Phase 3 — Delivery Guarantees

Implemented:

* Receiver ACK tracking
* Pending ACKs per message
* ACK timeout detection
* Retry on missing ACK
* Duplicate prevention on the client

Current limitation:

* Retry currently works for users connected to the same backend instance.
* Multi-backend ACK propagation works through Redis Pub/Sub.
* Multi-backend targeted retry is planned.

---

## Phase 4 — Operability

Planned

* Metrics
* Active connection count
* Message latency
* Delivery timeline
* Backend health dashboard

---

## Future Features

Possible future additions:

* Authentication
* File upload
* Image messages
* Emoji reactions
* Search
* Redis Streams
* Message ordering improvements

---

# What I Learned

This project helped me understand:

* Why WebSocket is used for real-time communication
* Why persistence and message delivery are separate concerns
* Why Redis Pub/Sub is needed when running multiple backend servers
* How room isolation works
* How presence is synchronized across servers
* Why messages require globally unique IDs
* How message status changes throughout its lifecycle
* How heartbeat detects broken connections
* How automatic reconnect restores communication
* How missed message replay recovers lost messages
* Why reconnect alone does not guarantee message delivery
* Why delivery acknowledgement should be tracked from receivers instead of senders
* How ACK tracking becomes the foundation for reliable messaging
* How distributed messaging systems gradually build delivery guarantees
* Why ACK state must be shared or propagated in multi-backend systems
* Why retry requires duplicate prevention
* How ACK timeout can detect incomplete delivery

---

# Running the Project

Start all services:

```bash
docker compose up --build
```

Open two browser windows:

```text
http://localhost:5174/?port=8001&user=Alice&room=general

http://localhost:5174/?port=8002&user=Bob&room=general
```

---

# Reset Local Database

```bash
docker compose down

find . -name "messages.db" -delete

docker compose up --build
```

---

# Project Structure

```text
messenger/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── MessageBubble.jsx
│   │   └── MessageInput.jsx
│   └── Dockerfile
│
└── docker-compose.yml
```
