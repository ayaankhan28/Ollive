import uuid
import logging
from typing import AsyncIterator, Dict, Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.llm.manager import llm_manager
from app.services import session_service
from app.db.models.sessions import Session

logger = logging.getLogger(__name__)


async def process_chat_message(
    db: AsyncSession,
    user_id: uuid.UUID,
    message: str,
    session_id: Optional[uuid.UUID] = None,
) -> AsyncIterator[Dict[str, Any]]:
    """
    Process a chat message and yield events to the client.

    Yields dicts that map to WebSocket JSON events:
      - {"type": "session_info", "session_id": str, "title": str}
      - {"type": "chunk", "content": str}
      - {"type": "done", "session_id": str}
      - {"type": "error", "error": str}
    """
    session: Optional[Session] = None
    is_new_session = False

    try:
        # 1. Get or create session
        if session_id is not None:
            session = await session_service.get_session(db, session_id, user_id)
            if session is None:
                logger.warning(
                    f"Session {session_id} not found for user {user_id}, creating new one"
                )

        if session is None:
            session = await session_service.create_session(db, user_id, "New Chat")
            await db.commit()
            is_new_session = True
            logger.info(f"Created new session {session.id} for user {user_id}")

        # 2. Send session info to client
        yield {
            "type": "session_info",
            "session_id": str(session.id),
            "title": session.title,
        }

        # 3. Save the user message to DB
        await session_service.add_message(
            db, session.id, user_id, "user", message
        )
        await session_service.update_session_updated_at(db, session.id)
        await db.commit()

        # 4. Get conversation history for LLM context
        history = await session_service.get_all_conversation_history(
            db, session.id, limit=20
        )

        # Format messages for LLM (exclude the most recent user message since we
        # already have it, the history now includes it)
        llm_messages = [
            {"role": conv.role, "content": conv.content}
            for conv in history
        ]

        # 5. Auto-generate title for new sessions on first message
        if is_new_session or session.title == "New Chat":
            # Count existing user messages
            user_messages = [m for m in llm_messages if m["role"] == "user"]
            if len(user_messages) == 1:
                # This is the first message - generate title asynchronously
                try:
                    new_title = await llm_manager.generate_title(message)
                    updated_session = await session_service.update_session_title(
                        db, session.id, user_id, new_title
                    )
                    await db.commit()
                    if updated_session:
                        # Re-send session_info with the new title
                        yield {
                            "type": "session_info",
                            "session_id": str(session.id),
                            "title": new_title,
                        }
                        logger.info(
                            f"Generated title '{new_title}' for session {session.id}"
                        )
                except Exception as title_err:
                    logger.warning(f"Failed to generate title: {title_err}")

        # 6. Stream the LLM response
        full_response = ""
        async for chunk in llm_manager.stream_chat(llm_messages):
            if chunk:
                full_response += chunk
                yield {"type": "chunk", "content": chunk}

        # 7. Save the complete assistant response
        if full_response:
            await session_service.add_message(
                db, session.id, user_id, "assistant", full_response
            )
            await session_service.update_session_updated_at(db, session.id)
            await db.commit()
            logger.info(
                f"Saved assistant response ({len(full_response)} chars) to session {session.id}"
            )

        # 8. Send done event
        yield {"type": "done", "session_id": str(session.id)}

    except Exception as e:
        logger.error(f"Error in process_chat_message: {e}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        yield {"type": "error", "error": str(e)}
        if session:
            yield {"type": "done", "session_id": str(session.id)}
