# main.py
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"]
)

class AgentRequest(BaseModel):
    question: str
    email: str | None = None  # optional

agent = None


# ---------- start MCP agent on FastAPI startup --------------------- #
@app.on_event("startup")
async def init_agent():
    global agent
    client = MultiServerMCPClient(
        {
            "product": {
                "command": "python",
                "args": ["product_search.py"],  # path to new tool‑server
                "transport": "stdio",
            }
        }
    )
    tools = await client.get_tools()
    print("[INIT] Tools registered:", [t.name for t in tools])

    agent = create_react_agent(
        ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=0),
        tools,
    )
    print("[INIT] MCP REACT agent ready ✅")


# ---------- chat endpoint ----------------------------------------- #
@app.post("/agent")
async def agent_chat(body: AgentRequest):
    if agent is None:
        return {"error": "Agent not ready yet."}

    user_msg = body.question
    prompt = {"messages": [{"role": "user", "content": user_msg}]}

    result = await agent.ainvoke(prompt)
    if isinstance(result, dict) and "messages" in result:
        return {"answer": result["messages"][-1].content}

    return {"error": "Unexpected agent response"}
