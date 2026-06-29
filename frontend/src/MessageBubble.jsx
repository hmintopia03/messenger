import { useState } from "react";

function formatTime(value) {
  if (!value) return "";

  const date = new Date(value + "Z");

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}


function MessageBubble({ msg, isMine, isFirstInGroup, isLastInGroup, onEdit, onDelete, onReply }) {
  const [hovered, setHovered] = useState(false);
  function getBorderRadius(isMine, isFirstInGroup, isLastInGroup) {
    if (isFirstInGroup && isLastInGroup) return "12px";

    if (isMine) {
        if (isFirstInGroup) return "12px 12px 4px 12px";
        if (isLastInGroup) return "12px 4px 12px 12px";
        return "12px 4px 4px 12px";
    }

    if (isFirstInGroup) return "12px 12px 12px 4px";
    if (isLastInGroup) return "4px 12px 12px 12px";
    return "4px 12px 12px 4px";
    }
  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        listStyle: "none",
        marginBottom: isLastInGroup ? "12px" : "3px",
        display: "flex",
        justifyContent: isMine ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "65%",
          padding: "8px 10px",
          borderRadius: getBorderRadius(
            isMine,
            isFirstInGroup,
            isLastInGroup
            ),
          background: isMine ? "#DCF8C6" : "#F1F1F1",
        }}
      >
        {!isMine && isFirstInGroup && (
          <div style={{ fontSize: "12px", fontWeight: "bold" }}>
            {msg.user}
          </div>
        )}

        {msg.reply_to && (
          <div
            style={{
              fontSize: "12px",
              opacity: 0.75,
              borderLeft: "3px solid gray",
              paddingLeft: "8px",
              marginBottom: "6px",
            }}
          >
            <strong>{msg.reply_to.user}</strong>
            <br />
            {msg.reply_to.message}
          </div>
        )}

        <div style={{ whiteSpace: "pre-wrap" }}>
        {msg.message}
        </div>

        {isLastInGroup && (
        <div
            style={{
            fontSize: "11px",
            opacity: 0.65,
            marginTop: "4px",
            textAlign: "right",
            }}
        >
            {msg.status} · {formatTime(msg.created_at)}
        </div>
        )}

        {hovered && (
        <div style={{ marginTop: "4px" }}>
            {isMine && (
            <>
                <button onClick={() => onEdit(msg)}>Edit</button>
                <button onClick={() => onDelete(msg)}>Delete</button>
            </>
            )}
            <button onClick={() => onReply(msg)}>Reply</button>
        </div>
        )}
      </div>
    </li>
  );
}

export default MessageBubble;