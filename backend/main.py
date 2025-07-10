from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from fastapi.responses import JSONResponse
from langchain_google_genai import ChatGoogleGenerativeAI
import os

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

llm = init_chat_model(
    "gemini-2.0-flash",
    model_provider="google_genai",
    google_api_key=os.getenv("GOOGLE_API_KEY")
)

class ChatRequest(BaseModel):
    query: str

@app.get("/")
async def root():
    return {"message": "Hello, World!"}

@app.post('/chat')
async def chat(request: ChatRequest):
    result = llm.invoke(request.query)
    return JSONResponse(content={"response": result.content})
