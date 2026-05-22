import uuid
import logging
from typing import AsyncIterator, Dict, Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.agent import run_agent_turn
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
    Process a chat message through the agentic loop and yield WebSocket events:

      {"type": "session_info",  "session_id": "...", "title": "..."}
      {"type": "tool_start",    "tool_name": "...",  "tool_input": {...}}
      {"type": "tool_end",      "tool_name": "...",  "tool_result": "..."}
      {"type": "chunk",         "content": "..."}
      {"type": "done",          "session_id": "..."}
      {"type": "error",         "error": "..."}
    """
    session: Optional[Session] = None
    is_new_session = False

    try:
        # 1. Get or create session
        if session_id is not None:
            session = await session_service.get_session(db, session_id, user_id)
        if session is None:
            session = await session_service.create_session(db, user_id, "New Chat")
            await db.commit()
            is_new_session = True

        yield {"type": "session_info", "session_id": str(session.id), "title": session.title}

        # 2. Save user message
        user_msg = await session_service.add_message(db, session.id, user_id, "user", message)
        await session_service.update_session_updated_at(db, session.id)
        await db.commit()

        # 3. Build conversation history for LLM
        history = await session_service.get_all_conversation_history(db, session.id, limit=20)
        llm_messages = [{"role": c.role, "content": c.content} for c in history]

        # 4. Auto-generate title on first message
        if is_new_session or session.title == "New Chat":
            if len([m for m in llm_messages if m["role"] == "user"]) == 1:
                try:
                    from app.core.llm.manager import llm_manager
                    new_title = await llm_manager.generate_title(message)
                    updated = await session_service.update_session_title(db, session.id, user_id, new_title)
                    await db.commit()
                    if updated:
                        yield {"type": "session_info", "session_id": str(session.id), "title": new_title}
                except Exception as e:
                    logger.warning("Title generation failed: %s", e)

        # 5. Set observe-me context vars so spans link to session/user
        try:
            import observe_me
            observe_me.set_session_id(str(session.id))
            observe_me.set_user_id(str(user_id))
            observe_me.set_conversation_id(str(user_msg.id) if user_msg else None)
        except ImportError:
            pass

        # 6. Run agent loop — yields tool_start / tool_end / chunk events
        full_response = ""
        async for event in run_agent_turn(
            messages=llm_messages,
            session_id=str(session.id),
            user_id=str(user_id),
            conversation_id=str(user_msg.id) if user_msg else None,
        ):
            if event["type"] == "chunk":
                full_response += event["content"]
            yield event

        # 7. Save assistant response
        if full_response:
            await session_service.add_message(db, session.id, user_id, "assistant", full_response)
            await session_service.update_session_updated_at(db, session.id)
            await db.commit()

        yield {"type": "done", "session_id": str(session.id)}

    except Exception as e:
        logger.error("process_chat_message error: %s", e, exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        yield {"type": "error", "error": str(e)}
        if session:
            yield {"type": "done", "session_id": str(session.id)}
    finally:
        try:
            import observe_me
            observe_me.set_session_id(None)
            observe_me.set_user_id(None)
            observe_me.set_conversation_id(None)
        except ImportError:
            pass
