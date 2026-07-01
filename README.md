# Messenger

A real-time messenger playground built to understand how modern chat systems work.
Rather than stopping at a basic WebSocket chat application, this project explores how production messaging systems handle persistence, scalability, and connection reliability.

## Why this project

Many chat tutorials end after implementing basic real-time messaging.

This project focuses on understanding the infrastructure behind modern messengers such as Slack, Discord, and KakaoTalk.

The goal is to answer questions like:

- How do users connected to different backend servers communicate?
- Why doesn't the chat stop when one backend instance goes down?
- How are missed messages recovered after reconnecting?
- How are online users synchronized across servers?

## Current capabilities

- Real-time messaging with WebSocket
- Multiple FastAPI backend instances
- Redis Pub/Sub
- SQLite persistence
- Rooms
- Presence
- Typing indicator
- Delivery & Read receipts
- Reply
- Edit
- Delete
- Message grouping
- Auto-scroll
- Chat bubble UI

## Architecture

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

## Tech Stack

- **Frontend:** React, Vite
- **Backend:** FastAPI
- **Realtime:** WebSocket
- **Message bus:** Redis Pub/Sub
- **Storage:** SQLite
- **Dev environment:** Docker Compose

## Features

### Real-time chat

Clients connect to the backend through WebSocket. When a user sends a message:

```txt
Client
  -> FastAPI
  -> SQLite save
  -> Redis publish
  -> other backends
  -> connected clients
```

### Multiple backend instances

The app runs two backend instances:

```txt
backend1 : 8001
backend2 : 8002
```

Users connected to different backend instances can still chat because Redis Pub/Sub distributes events between them.

### Rooms

Messages are separated by room. Example URLs:

```txt
http://localhost:5174/?port=8001&user=Alice&room=general
http://localhost:5174/?port=8002&user=Bob&room=general
http://localhost:5174/?port=8001&user=Charlie&room=study
```

Users in different rooms do not receive each other's messages.

### Presence

Online users are stored in Redis. This allows different backend instances to share the same online user list.

```txt
presence:general = { Alice, Bob }
```

### Message history

Messages are stored in SQLite. When the browser loads:

```txt
GET /messages?room=general
```

fetches recent messages before opening the WebSocket connection.

### Message lifecycle

Messages have a lifecycle:

```txt
sent -> delivered -> read
```

Each message has a unique ID, so status updates can target a specific message.

### Edit and delete

Messages can be updated or deleted by sending WebSocket events.

```txt
edit   -> SQLite UPDATE -> Redis publish
delete -> SQLite DELETE -> Redis publish
```

### Reply

Messages can reference another message through `reply_to`. This allows reply-style UI similar to common messenger apps.

### UI improvements

The frontend includes:

- Message bubbles
- Left/right alignment
- Grouped consecutive messages
- Reply preview
- Hover actions
- Bottom input bar
- Auto-scroll
- Local time display

---

## Messenger v2 Roadmap

The next stage of this project focuses on operating a messenger reliably rather than adding more user-facing features.

### Connection reliability

- Heartbeat
- Automatic reconnect
- Missed message replay

### Distributed systems

- Redis Streams
- Delivery acknowledgement (ACK)
- Offline queue
- Multi-backend synchronization

### Observability

- Active connection count
- Message latency
- Reconnect metrics
- Delivery timeline
- Backend health dashboard

### Future messenger features

- File upload
- Image messages
- Emoji reactions
- Search
- Authentication

---

## Learning roadmap

### Phase 1

Build a real-time messenger.

✅ Completed

- WebSocket
- Rooms
- Redis Pub/Sub
- Presence
- Reply
-

## What I learned

This project explores core concepts behind real messenger systems:

- Why WebSocket is used for real-time communication
- Why Redis is needed when there are multiple backend instances
- Why messages need unique IDs
- How message status changes over time
- Why DB storage and real-time delivery are separate concerns
- How room isolation works
- How presence is shared across servers
- This project also helped me understand the trade-offs between real-time communication, persistent storage, and distributed backend architecture.

---

## Messenger v2 Progress

The second stage of this project focuses on making the messenger reliable under connection failures.

### Implemented

- Heartbeat with `ping` / `pong`
- Automatic WebSocket reconnect
- Rejoin after reconnect
- Missed message replay after reconnect
- ACK logging for received messages

### Postponed

- ACK timeout
- Retry logic
- Offline queue
- Redis Streams
- Observability dashboard

## Learning roadmap

### Phase 1: Real-time messenger

✅ Completed

- WebSocket messaging
- Rooms
- Redis Pub/Sub across backend instances
- SQLite message history
- Presence
- Typing indicator
- Reply / Edit / Delete
- Delivery and read receipts
- Message grouping UI

### Phase 2: Reliable messenger

✅ Completed

- Heartbeat
- Automatic reconnect
- Missed message replay
- ACK logging

### Phase 3: Delivery guarantees

Planned

- Pending ACK tracking
- ACK timeout
- Retry
- At-least-once delivery
- Duplicate prevention

### Phase 4: Operated messenger

Planned

- Metrics
- Reconnect count
- Message latency
- Active connection count
- Health dashboard

## What I learned

This project explores core concepts behind real messenger systems:

- Why WebSocket is used for real-time communication
- Why Redis is needed when there are multiple backend instances
- Why messages need unique IDs
- How message status changes over time
- Why DB storage and real-time delivery are separate concerns
- How room isolation works
- How presence is shared across servers
- How heartbeat detects active connections
- How reconnect restores WebSocket sessions
- How missed message replay recovers messages after disconnection
- How ACK can be used as the basis for delivery guarantees

This project also helped me understand the trade-offs between real-time communication, persistent storage, connection recovery, and distributed backend architecture.

## Running the project

```bash
docker compose up --build
```

Open:

```txt
http://localhost:5174/?port=8001&user=Alice&room=general
http://localhost:5174/?port=8002&user=Bob&room=general
```

### Reset local database

```bash
docker compose down
find . -name "messages.db" -delete
docker compose up --build
```

## Project structure

```txt
messenger/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── MessageBubble.jsx
│   │   └── MessageInput.jsx
│   └── Dockerfile
└── docker-compose.yml
```

