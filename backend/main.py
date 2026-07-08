from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
from collections import defaultdict

import asyncio
import json
import redis.asyncio as redis
import os
import aiosqlite
import uuid


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[WebSocket, dict] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[websocket] = {
            "user": "unknown",
            "room": "general",
        }

    def set_user_room(self, websocket: WebSocket, user: str, room: str):
        self.active_connections[websocket] = {
            "user": user,
            "room": room,
        }

    def disconnect(self, websocket: WebSocket):
        self.active_connections.pop(websocket, None)

    def users_in_room(self, room: str):
        return [
            info["user"]
            for info in self.active_connections.values()
            if info["room"] == room and info["user"] != "unknown"
        ]

    async def broadcast(self, data: dict):
        room = data.get("room", "general")

        for connection, info in self.active_connections.items():
            if info["room"] == room:
                await connection.send_json(data)

manager = ConnectionManager()

# message_id -> set of users who still need to ACK
pending_acks: dict[str, set[str]] = defaultdict(set)

DB_PATH = "messages.db"

ROOMS = [
    "general",
    "study",
    "random",
]

redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=6379,
    decode_responses=True,
)


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT NOT NULL,
                room TEXT NOT NULL,
                user TEXT NOT NULL,
                message TEXT NOT NULL,
                status TEXT NOT NULL,
                reply_to TEXT,
                created_at TEXT NOT NULL
            )
        """)
        await db.commit()

def channel_for(room: str):
    return f"messenger:{room}"


async def publish(data: dict):
    room = data.get("room", "general")
    channel = channel_for(room)

    print(f"Publish to Redis [{channel}]: {data}")
    await redis_client.publish(channel, json.dumps(data))


async def redis_subscriber():
    pubsub = redis_client.pubsub()

    channels = [channel_for(room) for room in ROOMS]
    await pubsub.subscribe(*channels)

    print(f"Subscribed to Redis channels: {channels}")

    async for message in pubsub.listen():
        if message["type"] != "message":
            continue

        data = json.loads(message["data"])

        if data.get("type") == "ack":
            await handle_ack(data)
            continue

        await manager.broadcast(data)

async def save_message(data: dict):
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO messages (
                message_id,
                room,
                user,
                message,
                status,
                reply_to,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["id"],
                data.get("room", "general"),
                data.get("user", "unknown"),
                data.get("message", ""),
                data.get("status", "sent"),
                json.dumps(data.get("reply_to")) if data.get("reply_to") else None,
                data.get("created_at", datetime.utcnow().isoformat())
            ),
        )
        await db.commit()

async def update_message_status(message_id: str, status: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            UPDATE messages
            SET status = ?
            WHERE message_id = ?
            """,
            (status, message_id),
        )
        await db.commit()

async def update_message_text(message_id: str, message: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            UPDATE messages
            SET message = ?
            WHERE message_id = ?
            """,
            (message, message_id),
        )
        await db.commit()

async def delete_message(message_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            DELETE FROM messages
            WHERE message_id = ?
            """,
            (message_id,),
        )
        await db.commit()

async def handle_ack(data: dict):
    message_id = data["id"]
    ack_user = data["user"]

    if message_id not in pending_acks:
        print(f"[ACK] Unknown message {message_id}")
        return

    pending_acks[message_id].discard(ack_user)

    print(
        f"[ACK] {ack_user} acknowledged "
        f"{message_id}. Remaining: {pending_acks[message_id]}"
    )

    if not pending_acks[message_id]:
        print(f"[ACK] {message_id} fully delivered")
        del pending_acks[message_id]

# NOTE: not called yet. Kept for the upcoming ACK timeout / retry phase.
# The (message_id, user) key format below is stale relative to the new
# receiver-set design and will need to be updated when this is wired back in.
async def wait_for_ack(message_id: str, user: str, room: str):
    await asyncio.sleep(5)

    key = (message_id, user)

    if key in pending_acks:
        print(f"ACK TIMEOUT: {user} did not ack message {message_id} in room {room}")
        pending_acks.pop(key, None)

@app.on_event("startup")
async def startup():
    await init_db()
    asyncio.create_task(redis_subscriber())


@app.get("/health")
def health():
    return {"status": "ok"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)

    user = "unknown"
    room = "general"

    try:
        while True:

            data = await websocket.receive_json()

            if data["type"] == "ping":
                await websocket.send_json({
                    "type": "pong",
                    "ts": data.get("ts"),
                })
                continue

            if data["type"] == "join":
                user = data["user"]
                room = data.get("room", "general")

                manager.set_user_room(websocket, user, room)

                await redis_client.sadd(f"presence:{room}", user)
                users = await redis_client.smembers(f"presence:{room}")

                await publish({
                    "type": "presence",
                    "room": room,
                    "users": list(users),
                })

                last_message_id = data.get("last_message_id")
                missed_messages = await get_messages_after(room, last_message_id)

                if missed_messages:
                    await websocket.send_json({
                        "type": "replay",
                        "messages": missed_messages,
                    })

            elif data["type"] == "chat":
                data["id"] = str(uuid.uuid4())
                data["status"] = "sent"
                data["created_at"] = datetime.utcnow().isoformat()

                await save_message(data)

                users = await redis_client.smembers(f"presence:{room}")
                print(f"[ACK] Presence users in {room}: {users}")

                recipients = {
                    u
                    for u in users
                    if u != data["user"]
                }
                print(f"[ACK] Recipients for {data['id']}: {recipients}")

                if recipients:
                    pending_acks[data["id"]] = recipients
                    print(f"[ACK] Tracking {data['id']} waiting for {recipients}")
                else:
                    print(f"[ACK] No recipients for {data['id']}")

                await publish(data)

            elif data["type"] == "typing":
                await publish(data)

            elif data["type"] == "stop_typing":
                await publish(data)

            elif data["type"] == "delivered":
                await update_message_status(data["id"], "delivered")
                await publish({
                    "type": "status",
                    "room": data.get("room", "general"),
                    "id": data["id"],
                    "status": "delivered",
                })

            elif data["type"] == "read":
                await update_message_status(data["id"], "read")
                await publish({
                    "type": "status",
                    "room": data.get("room", "general"),
                    "id": data["id"],
                    "status": "read",
                })

            elif data["type"] == "ack":
                await publish({
                    "type": "ack",
                    "room": data.get("room", room),
                    "id": data["id"],
                    "user": data["user"],
                })

            elif data["type"] == "edit":
                print("EDIT RECEIVED:", data)
                await update_message_text(data["id"], data["message"])

                await publish({
                    "type": "edit",
                    "room": data.get("room", "general"),
                    "id": data["id"],
                    "message": data["message"],
                })

            elif data["type"] == "delete":
                await delete_message(data["id"])

                await publish({
                    "type": "delete",
                    "room": data.get("room", "general"),
                    "id": data["id"],
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket)

        await redis_client.srem(f"presence:{room}", user)
        users = await redis_client.smembers(f"presence:{room}")

        await publish({
            "type": "presence",
            "room": room,
            "users": list(users),
        })

@app.get("/messages")
async def get_messages(room: str = "general"):
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """
            SELECT message_id, room, user, message, status, reply_to, created_at
            FROM messages
            WHERE room = ?
            ORDER BY id DESC
            LIMIT 30
            """,
            (room,),
        )

        rows = await cursor.fetchall()

    messages = [
        {
            "id": row[0],
            "type": "chat",
            "room": row[1],
            "user": row[2],
            "message": row[3],
            "status": row[4],
            "reply_to": json.loads(row[5]) if row[5] else None,
            "created_at": row[6],
        }
        for row in reversed(rows)
    ]

    return messages

async def get_messages_after(room: str, last_message_id: str | None):
    await init_db()

    async with aiosqlite.connect(DB_PATH) as db:
        if last_message_id:
            cursor = await db.execute(
                """
                SELECT id
                FROM messages
                WHERE message_id = ? AND room = ?
                """,
                (last_message_id, room),
            )
            row = await cursor.fetchone()
            last_row_id = row[0] if row else 0
        else:
            last_row_id = 0

        cursor = await db.execute(
            """
            SELECT message_id, room, user, message, status, reply_to, created_at
            FROM messages
            WHERE room = ? AND id > ?
            ORDER BY id ASC
            """,
            (room, last_row_id),
        )

        rows = await cursor.fetchall()

    return [
        {
            "id": row[0],
            "type": "chat",
            "room": row[1],
            "user": row[2],
            "message": row[3],
            "status": row[4],
            "reply_to": json.loads(row[5]) if row[5] else None,
            "created_at": row[6],
        }
        for row in rows
    ]