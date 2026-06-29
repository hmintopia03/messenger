function MessageInput({
  text,
  setText,
  replyTo,
  setReplyTo,
  onSend,
  onTyping,
}) {
  return (
    <>
      {replyTo && (
        <div style={{ fontSize: "13px", marginBottom: "8px" }}>
          Replying to <strong>{replyTo.user}</strong>: {replyTo.message}
          <button
            onClick={() => setReplyTo(null)}
            style={{ marginLeft: "8px" }}
          >
            Cancel
          </button>
        </div>
      )}

<div
  style={{
    display: "flex",
    gap: "8px",
    alignItems: "center",
  }}
>
    <textarea
        value={text}
        onChange={(e) => {
        const value = e.target.value;
        setText(value);
        onTyping(value);
        }}
        onKeyDown={(e) => {
        if (e.key === "Enter") onSend();
        }}
        placeholder="Type a message"
        style={{
        flex: 1,
        padding: "10px 12px",
        borderRadius: "999px",
        border: "1px solid #444",
        outline: "none",
        background: "#222",
        color: "white",
        }}
    />

    <button
        onClick={onSend}
        style={{
        padding: "10px 16px",
        borderRadius: "999px",
        border: "none",
        cursor: "pointer",
        }}
    >
        Send
    </button>
</div>
    </>
  );
}

export default MessageInput;