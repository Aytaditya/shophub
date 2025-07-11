from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv
from product_search import get_vectordb
import os, asyncio, re

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

class AgentRequest(BaseModel):
    question: str
    email: str | None = None

agent = None
tools = None
user_states = {}

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
            system_message="When you mention a product name, surround it in **double asterisks**."
        ),
        tools,
    )
    print("[INIT] MCP REACT agent ready ✅")


# def extract_products_from_answer(answer: str) -> list[dict]:
#     from langchain_community.vectorstores import Chroma

#     try:
#         vdb = get_vectordb()
#         all_products = vdb.similarity_search("all", k=100)
#         all_product_names = {doc.metadata.get("name", "").lower(): doc.metadata for doc in all_products}
#         all_categories = {doc.metadata.get("category", "").lower(): doc.metadata for doc in all_products}

#         lower_text = answer.lower()
#         final_matches: list[dict] = []
#         seen = set()

#         # 1. Match bolded names
#         for name in re.findall(r"\*\*(.*?)\*\*", answer):
#             key = name.strip().lower()
#             if key in all_product_names and key not in seen:
#                 final_matches.append(all_product_names[key])
#                 seen.add(key)

#         # 2. Fuzzy substring match
#         if not final_matches:
#             for prod_name, meta in all_product_names.items():
#                 if prod_name not in seen:
#                     prod_keywords = set(prod_name.split())
#                     if any(k in lower_text for k in prod_keywords):
#                         final_matches.append(meta)
#                         seen.add(prod_name)

#         # 3. Category fallback
#         if not final_matches:
#             for cat, meta in all_categories.items():
#                 if cat and cat in lower_text:
#                     final_matches.append(meta)
#                     break

#         print(f">>> [EXTRACTOR] Final products extracted: {final_matches}")
#         return final_matches

#     except Exception as e:
#         print(f"[ERROR] Failed to extract product info: {e}")
#         return []



async def invoke_tool(tool_name: str, **kwargs):
    tool_obj = next((t for t in tools if t.name == tool_name), None)
    if not tool_obj:
        raise ValueError(f"Tool {tool_name} not found")
    if asyncio.iscoroutinefunction(tool_obj.ainvoke):
        return await tool_obj.ainvoke(kwargs)
    return tool_obj.invoke(kwargs)


def get_user_state(email: str) -> dict:
    if email not in user_states:
        user_states[email] = {
            "connected": False,
            "awaiting_name": False,
            "name_set": False
        }
    return user_states[email]

def is_likely_name(text: str) -> bool:
    words = text.strip().split()
    if len(words) > 3:
        return False
    common_phrases = ["hi", "hello", "how", "what", "where", "when", "why", "can", "could", "would", "will"]
    if any(word.lower() in common_phrases for word in words):
        return False
    return all(word.replace("'", "").isalpha() for word in words)

def extract_name_from_text(text: str) -> str | None:
    patterns = [
        r"\b(?:my name is|i am|i'm)\s+([a-zA-Z]+(?: [a-zA-Z]+)*)",
        r"\b(?:call me|name me)\s+([a-zA-Z]+(?: [a-zA-Z]+)*)",
        r"\b(?:it's|its)\s+([a-zA-Z]+(?: [a-zA-Z]+)*)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip().title()
    return None

@app.post("/agent")
async def agent_chat(body: AgentRequest):
    if agent is None:
        return {"error": "Agent not ready yet."}

    email = body.email or "guest@example.com"
    user_input = body.question.strip()
    user_state = get_user_state(email)

    print(f"[DEBUG] User {email} state: {user_state}, Input: '{user_input}'")

    if user_state["awaiting_name"]:
        extracted_name = extract_name_from_text(user_input)
        if extracted_name:
            try:
                result = await invoke_tool("set_user_name", name=extracted_name, email=email)
                user_state["awaiting_name"] = False
                user_state["name_set"] = True
                return {"answer": result}
            except Exception as e:
                print(f"[ERROR] set_user_name failed: {e}")
                return {"error": "Failed to set name"}
        elif is_likely_name(user_input):
            name = user_input.title()
            try:
                result = await invoke_tool("set_user_name", name=name, email=email)
                user_state["awaiting_name"] = False
                user_state["name_set"] = True
                return {"answer": result}
            except Exception as e:
                print(f"[ERROR] set_user_name failed: {e}")
                return {"error": "Failed to set name"}
        else:
            return {"answer": "I'm still waiting for your name. What should I call you?"}

    if not user_state["connected"]:
        print(f"[MCP] Connecting user: {email}")
        try:
            response = await invoke_tool("connect_user", email=email)
            user_state["connected"] = True
            if "What should I call you?" in response:
                user_state["awaiting_name"] = True
                return {"answer": response}
            else:
                user_state["name_set"] = True
                return {"answer": response}
        except Exception as e:
            print(f"[ERROR] connect_user failed: {e}")
            return {"error": "Failed to connect user"}

    extracted_name = extract_name_from_text(user_input)
    if extracted_name:
        try:
            result = await invoke_tool("set_user_name", name=extracted_name, email=email)
            user_state["name_set"] = True
            return {"answer": result}
        except Exception as e:
            print(f"[ERROR] set_user_name failed: {e}")

    try:
        prompt = {"messages": [{"role": "user", "content": user_input}]}
        result = await agent.ainvoke(prompt)

        if isinstance(result, dict) and "messages" in result:
            answer_text = result["messages"][-1].content
            print("\n===== RAW ANSWER FROM LLM =====\n", answer_text, "\n===============================\n")

            #products = extract_products_from_answer(answer_text)

            return {
                "answer": answer_text,
                # "products": products,
                # "debug": {
                #     "raw_answer": answer_text[:500],
                #     "num_products": len(products),
                # },
            }
        else:
            return {"answer": str(result)}
    except Exception as e:
        print(f"[ERROR] Agent processing failed: {e}")
        return {"error": "Failed to process your request"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "agent_ready": agent is not None}
