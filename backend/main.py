from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv
from product_search import get_vectordb    # still unused for now
import os, asyncio, re


load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AgentRequest(BaseModel):
    question: str
    email: str | None = None
    reset: bool | None = False          # 🔸 allow the FE to clear history if it wants

agent = None
tools = None

# 🔸 {email: {...}} lives only in RAM ‑‑ replace with Redis if you need persistence
user_states: dict[str, dict] = {}

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
def get_user_state(email: str) -> dict:
    if email not in user_states:
        user_states[email] = {
            "connected": False,
            "awaiting_name": False,
            "name_set": False,
            "name": None,
            "history": [],              # 🔸 rolling chat history
        }
    return user_states[email]

def is_likely_name(text: str) -> bool:
    words = text.strip().split()
    if not 1 <= len(words) <= 3:
        return False
    common = {
        "hi", "hello", "how", "what", "where", "when",
        "why", "can", "could", "would", "will",
    }
    if any(w.lower() in common for w in words):
        return False
    return all(w.replace("'", "").isalpha() for w in words)

def extract_name_from_text(text: str) -> str | None:
    patterns = [
        r"\b(?:my name is|i am|i'm)\s+([a-zA-Z]+(?: [a-zA-Z]+)*)",
        r"\b(?:call me|name me)\s+([a-zA-Z]+(?: [a-zA-Z]+)*)",
        r"\b(?:it's|its)\s+([a-zA-Z]+(?: [a-zA-Z]+)*)",
        r"\bhi[, ]+([a-zA-Z]+)\b",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(1).title().strip()
    return None

async def invoke_tool(tool_name: str, **kwargs):
    tool = next((t for t in tools if t.name == tool_name), None)
    if not tool:
        raise ValueError(f"Tool {tool_name} not found")
    return await tool.ainvoke(kwargs) if asyncio.iscoroutinefunction(tool.ainvoke) else tool.invoke(kwargs)

# ------------------------------------------------------------
# Startup – create MCP REACT agent
# ------------------------------------------------------------
@app.on_event("startup")
async def init_agent():
    global agent, tools
    client = MultiServerMCPClient(
        {
            "product": {
                "command": "python",
                "args": ["product_search.py"],
                "transport": "stdio",
            }
        }
    )
    tools = await client.get_tools()
    print("[INIT] Tools registered:", [t.name for t in tools])

    agent = create_react_agent(
        ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            temperature=0,
            system_message="When you mention a product name, surround it in **double asterisks**.",
        ),
        tools,
    )
    print("[INIT] MCP REACT agent ready ✅")

# ------------------------------------------------------------
# Routes
# ------------------------------------------------------------
@app.post("/agent")
async def agent_chat(body: AgentRequest):
    if agent is None:
        return {"error": "Agent not ready yet."}

    email = body.email or "guest@example.com"
    user_input = body.question.strip()
    if body.reset:
        user_states.pop(email, None)     # 🔸 optional FE reset hook
    state = get_user_state(email)

    # 1️⃣ — handle “waiting for name” branch -----------------------------------
    if state["awaiting_name"]:
        extracted = extract_name_from_text(user_input) or (user_input.title() if is_likely_name(user_input) else None)
        if extracted:
            try:
                resp = await invoke_tool("set_user_name", name=extracted, email=email)
                state.update({"awaiting_name": False, "name_set": True, "name": extracted})
                return {"answer": resp}
            except Exception as e:
                print("[ERROR] set_user_name failed:", e)
                return {"error": "Failed to set your name."}
        return {"answer": "I'm still waiting for your name. What should I call you?"}

    # 2️⃣ — first‑time connection branch ---------------------------------------
    if not state["connected"]:
        try:
            resp = await invoke_tool("connect_user", email=email)
            state["connected"] = True

            # If connect_user itself greeted with a name, store it
            maybe_name = extract_name_from_text(resp or "")
            if maybe_name:
                state.update({"name": maybe_name, "name_set": True})

            if "What should I call you?" in (resp or ""):
                state["awaiting_name"] = True
            return {"answer": resp}
        except Exception as e:
            print("[ERROR] connect_user failed:", e)
            return {"error": "Failed to connect user."}

    # 3️⃣ — user voluntarily tells their name mid‑conversation -----------------
    extracted = extract_name_from_text(user_input)
    if extracted:
        try:
            resp = await invoke_tool("set_user_name", name=extracted, email=email)
            state.update({"name": extracted, "name_set": True})
            return {"answer": resp}
        except Exception as e:
            print("[ERROR] set_user_name failed:", e)

    # 4️⃣ — normal LLM call ----------------------------------------------------
    try:
        # 🔸 build message stack: system (with name) + history + new user msg
        sys_msg = None
        if state["name_set"] and state["name"]:
            sys_msg = {
                "role": "system",
                "content": f"The user's name is {state['name']}. "
                           f"Always greet or address them by name in every reply.",
            }

        history = state["history"][-20:]    # keep at most 10 pairs (=20 msgs)
        messages = ([sys_msg] if sys_msg else []) + history + [
            {"role": "user", "content": user_input}
        ]

        result = await agent.ainvoke({"messages": messages})

        # Extract assistant reply text
        if isinstance(result, dict) and "messages" in result:
            reply = result["messages"][-1].content
        else:
            reply = str(result)

        # 🔸 update history
        history.append({"role": "user", "content": user_input})
        history.append({"role": "assistant", "content": reply})
        state["history"] = history[-20:]    # truncate again

        return {"answer": reply}
    except Exception as e:
        print("[ERROR] Agent processing failed:", e)
        return {"error": "Failed to process your request."}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "agent_ready": agent is not None}
