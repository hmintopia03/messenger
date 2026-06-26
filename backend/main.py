from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import asyncio
import json
import redis.asyncio as redis


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
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"Connected: {len(self.active_connections)} client(s)")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print(f"Disconnected: {len(self.active_connections)} client(s)")

    async def broadcast(self, data: dict):
        print(f"Broadcast to browsers: {data}")

        for connection in self.active_connections:
            await connection.send_json(data)


manager = ConnectionManager()

redis_client = redis.Redis(
    host="localhost",
    port=6379,
    decode_responses=True,
)

CHANNEL = "messenger"


async def publish(data: dict):
    print(f"Publish to Redis: {data}")
    await redis_client.publish(CHANNEL, json.dumps(data))


async def redis_subscriber():
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(CHANNEL)

    print(f"Subscribed to Redis channel: {CHANNEL}")

    async for message in pubsub.listen():
        if message["type"] != "message":
            continue

        data = json.loads(message["data"])
        await manager.broadcast(data)


@app.on_event("startup")
async def startup():
    asyncio.create_task(redis_subscriber())


@app.get("/health")
def health():
    return {"status": "ok"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)

    user = "unknown"

    try:
        while True:
            data = await websocket.receive_json()

            if data["type"] == "join":
                user = data["user"]
                await publish({
                    "type": "system",
                    "message": f"{user} joined",
                })

            elif data["type"] == "chat":
                await publish(data)

            elif data["type"] == "typing":
                await publish(data)
            elif data["type"] == "stop_typing":
                await publish(data)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await publish({
            "type": "system",
            "message": f"{user} left",
        })